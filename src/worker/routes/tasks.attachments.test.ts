import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { createMigratedD1 } from "../../test/sqlite-d1";

// tasks.ts imports lib/image.ts, which loads a real WASM module outside vitest — stub it out (same as tasks.test.ts).
vi.mock("@cf-wasm/photon/workerd", () => ({
  PhotonImage: class {},
  SamplingFilter: { Lanczos3: 1 },
  resize: vi.fn(),
}));

const { tasksRouter } = await import("./tasks");

const MB = 1024 * 1024;
const BOUNDARY = "----test-boundary";

// A real 1x1 GIF89a (transparent pixel).
const GIF_1X1 = new Uint8Array([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff, 0xff, 0xff,
  0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
  0x02, 0x02, 0x44, 0x01, 0x00, 0x3b,
]);

function world() {
  const { db, raw } = createMigratedD1();
  const now = "2026-01-01 00:00:00";
  raw.exec(`
    INSERT INTO workspaces (id, name) VALUES ('ws-A', 'A');
    INSERT INTO "user" (id, name, email, createdAt, updatedAt) VALUES ('u-ana', 'Ana', 'ana@x.test', '${now}', '${now}');
    INSERT INTO "member" (id, organizationId, userId, role, createdAt) VALUES ('m-ana', 'ws-A', 'u-ana', 'member', '${now}');
    INSERT INTO clients (id, workspace_id, name) VALUES ('cl-A', 'ws-A', 'Client');
    INSERT INTO projects (id, workspace_id, name, client_id) VALUES ('p1', 'ws-A', 'One', 'cl-A');
    INSERT INTO tasks (id, workspace_id, project_id, name) VALUES ('t1', 'ws-A', 'p1', 'task one');
  `);
  const put = vi.fn(async () => ({}));
  const del = vi.fn(async () => {});
  const env = { DB: db, ATTACHMENTS: { put, delete: del } } as unknown as Env;
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;
  const app = new Hono<{ Bindings: Env; Variables: { workspaceId: string; userId: string } }>()
    .use("*", async (c, next) => {
      c.set("workspaceId", "ws-A");
      c.set("userId", "u-ana");
      await next();
    })
    .route("/", tasksRouter);
  const count = () => (raw.prepare(`SELECT COUNT(*) AS n FROM task_attachments WHERE task_id = 't1'`).get() as { n: number }).n;
  return { app, env, ctx, put, del, count, raw };
}

const encoder = new TextEncoder();
const partHead = (filename: string) =>
  encoder.encode(`--${BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: image/png\r\n\r\n`);
const partTail = encoder.encode(`\r\n--${BOUNDARY}--\r\n`);

/** Multipart body as a stream that records how many bytes the server pulled from it. */
function streamedUpload(fileBytes: number, firstBytes: Uint8Array, opts: { declareLength: boolean }) {
  const head = partHead("shot.png");
  const total = head.length + fileBytes + partTail.length;
  const chunk = new Uint8Array(64 * 1024);
  let sentFile = 0;
  let stage: "head" | "file" | "tail" | "done" = "head";
  const state = { pulled: 0 };
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (stage === "head") { controller.enqueue(head); state.pulled += head.length; stage = "file"; return; }
      if (stage === "file") {
        const first = sentFile === 0;
        const n = Math.min(chunk.length, fileBytes - sentFile);
        const out = first ? new Uint8Array(n) : chunk.subarray(0, n);
        if (first) out.set(firstBytes.subarray(0, n));
        controller.enqueue(out);
        state.pulled += n;
        sentFile += n;
        if (sentFile >= fileBytes) stage = "tail";
        return;
      }
      if (stage === "tail") { controller.enqueue(partTail); state.pulled += partTail.length; stage = "done"; return; }
      controller.close();
    },
  });
  const headers: Record<string, string> = { "Content-Type": `multipart/form-data; boundary=${BOUNDARY}` };
  if (opts.declareLength) headers["Content-Length"] = String(total);
  return { init: { method: "POST", headers, body, duplex: "half" } as RequestInit, state, total };
}

function smallUpload(file: Uint8Array, declareLength: boolean): RequestInit {
  const body = new Blob([partHead("dot.gif"), file, partTail]);
  const headers: Record<string, string> = { "Content-Type": `multipart/form-data; boundary=${BOUNDARY}` };
  if (declareLength) headers["Content-Length"] = String(body.size);
  return { method: "POST", headers, body };
}

const PNG_SIG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("S-11 — the size limit is enforced before the body is read", () => {
  it("answers 413 for an 18 MB upload that declares Content-Length, without pulling the body", async () => {
    const w = world();
    const upload = streamedUpload(18 * MB, PNG_SIG, { declareLength: true });
    const res = await w.app.request("/t1/attachments", upload.init, w.env, w.ctx);
    expect(upload.state.pulled).toBeLessThan(MB);
    expect(res.status).toBe(413);
    expect(((await res.json()) as { error: string }).error).toMatch(/10 MB/);
    expect(w.put).not.toHaveBeenCalled();
    expect(w.count()).toBe(0);
  });

  it("still refuses an oversized body that arrives without Content-Length (post-read check kept)", async () => {
    const w = world();
    const upload = streamedUpload(11 * MB, PNG_SIG, { declareLength: false });
    const res = await w.app.request("/t1/attachments", upload.init, w.env, w.ctx);
    expect([400, 413]).toContain(res.status);
    expect(((await res.json()) as { error: string }).error).toMatch(/10 MB/);
    expect(w.put).not.toHaveBeenCalled();
    expect(w.count()).toBe(0);
  });

  it.each([true, false])("keeps accepting a small legitimate image (Content-Length declared: %s)", async (declared) => {
    const w = world();
    const res = await w.app.request("/t1/attachments", smallUpload(GIF_1X1, declared), w.env, w.ctx);
    expect(res.status).toBe(201);
    expect(w.put).toHaveBeenCalledTimes(1);
    expect(w.count()).toBe(1);
  });
});

describe("S-21 — attachments per task are capped", () => {
  const CAP = 50;
  const seed = (w: ReturnType<typeof world>, n: number) => {
    for (let i = 0; i < n; i++) {
      w.raw.exec(
        `INSERT INTO task_attachments (id, workspace_id, task_id, user_id, r2_key, filename, content_type, size, width, height)
         VALUES ('a${i}', 'ws-A', 't1', 'u-ana', 'k${i}', 'f.gif', 'image/gif', 10, 1, 1)`
      );
    }
  };

  it("accepts the upload that brings the task to the cap", async () => {
    const w = world();
    seed(w, CAP - 1);
    const res = await w.app.request("/t1/attachments", smallUpload(GIF_1X1, true), w.env, w.ctx);
    expect(res.status).toBe(201);
    expect(w.count()).toBe(CAP);
  });

  it("refuses the upload past the cap without storing anything", async () => {
    const w = world();
    seed(w, CAP);
    const res = await w.app.request("/t1/attachments", smallUpload(GIF_1X1, true), w.env, w.ctx);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toMatch(/50/);
    expect(w.put).not.toHaveBeenCalled();
    expect(w.count()).toBe(CAP);
  });
  it("the INSERT itself refuses when a racing upload filled the last slot after the pre-check", async () => {
    const w = world();
    seed(w, CAP);
    const realDb = w.env.DB;
    const staleCount = { prepare: (sql: string) => sql.includes("COUNT(*) AS n FROM task_attachments")
      ? { bind: () => ({ first: async () => ({ n: 0 }) }) } : realDb.prepare(sql) } as unknown as D1Database;
    const env = { ...w.env, DB: staleCount } as Env;
    const res = await w.app.request("/t1/attachments", smallUpload(GIF_1X1, true), env, w.ctx);
    expect(res.status).toBe(409);
    expect(w.del).toHaveBeenCalledTimes(1);
    expect(w.count()).toBe(CAP);
  });
});

describe("S-22 — an uploaded GIF is stored without non-frame bytes", () => {
  it("writes the sanitized GIF to R2, not the uploaded bytes", async () => {
    const w = world();
    const comment = [0x21, 0xfe, 0x0d, ...new TextEncoder().encode("INJECTED-BYTE"), 0x00];
    const tail = new TextEncoder().encode("<script>INJECTED-TAIL</script>");
    const dirty = new Uint8Array([...GIF_1X1.subarray(0, 19), ...comment, ...GIF_1X1.subarray(19), ...tail]);
    const res = await w.app.request("/t1/attachments", smallUpload(dirty, true), w.env, w.ctx);
    expect(res.status).toBe(201);
    const stored = (w.put.mock.calls[0] as unknown as [string, Uint8Array])[1];
    expect(new TextDecoder("latin1").decode(stored).includes("INJECTED")).toBe(false);
    expect([...stored]).toEqual([...GIF_1X1]);
  });

  it("answers 400 for a GIF whose structure is broken", async () => {
    const w = world();
    const res = await w.app.request("/t1/attachments", smallUpload(GIF_1X1.subarray(0, GIF_1X1.length - 1), true), w.env, w.ctx);
    expect(res.status).toBe(400);
    expect(w.put).not.toHaveBeenCalled();
  });
});
