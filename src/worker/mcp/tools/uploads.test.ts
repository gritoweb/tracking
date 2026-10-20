import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { createMigratedD1 } from "../../../test/sqlite-d1";
import type { ToolRegistrar } from "../shared";

// tasks.ts imports lib/image.ts, which loads a real WASM module outside vitest — stub it out (same as the route tests).
vi.mock("@cf-wasm/photon/workerd", () => ({
  PhotonImage: class {},
  SamplingFilter: { Lanczos3: 1 },
  resize: vi.fn(),
}));

const { registerAllTools } = await import("../registry");
const { signedUploadRouter, uploadsRouter } = await import("../../routes/uploads");
const { signUploadGrant, verifyUploadGrant } = await import("../../lib/uploads");

type ToolResult = { content: { type: string; text: string }[]; isError?: boolean };
type Handler = (args: Record<string, unknown>) => Promise<ToolResult>;

const SECRET = "test-secret-at-least-32-characters-long";
// A real 1x1 GIF89a (transparent pixel).
const GIF_1X1 = new Uint8Array([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff, 0xff, 0xff,
  0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
  0x02, 0x02, 0x44, 0x01, 0x00, 0x3b,
]);

/** Just enough of an R2 bucket, in memory, to stage a file and read it back. */
function memoryBucket() {
  const objects = new Map<string, { bytes: Uint8Array; customMetadata?: Record<string, string> }>();
  const bucket = {
    put: async (key: string, value: ArrayBuffer | Uint8Array, opts?: { customMetadata?: Record<string, string> }) => {
      objects.set(key, { bytes: new Uint8Array(value instanceof Uint8Array ? value : new Uint8Array(value)), customMetadata: opts?.customMetadata });
      return {};
    },
    get: async (key: string) => {
      const o = objects.get(key);
      return o ? { customMetadata: o.customMetadata, arrayBuffer: async () => o.bytes.slice().buffer } : null;
    },
    delete: async (key: string) => void objects.delete(key),
  };
  return { bucket, objects };
}

function world() {
  const { db, raw } = createMigratedD1();
  const now = "2026-01-01 00:00:00";
  raw.exec(`
    INSERT INTO workspaces (id, name) VALUES ('ws-A', 'A');
    INSERT INTO "user" (id, name, email, createdAt, updatedAt) VALUES
      ('u-admin', 'Ada', 'ada@x.test', '${now}', '${now}'),
      ('u-member', 'Mel', 'mel@x.test', '${now}', '${now}');
    INSERT INTO "member" (id, organizationId, userId, role, createdAt) VALUES
      ('m-admin', 'ws-A', 'u-admin', 'admin', '${now}'),
      ('m-member', 'ws-A', 'u-member', 'member', '${now}');
    INSERT INTO clients (id, workspace_id, name) VALUES ('cl-A', 'ws-A', 'Client');
    INSERT INTO projects (id, workspace_id, name, client_id) VALUES ('p1', 'ws-A', 'One', 'cl-A');
    INSERT INTO tasks (id, workspace_id, project_id, name) VALUES ('t1', 'ws-A', 'p1', 'task one');
  `);
  const { bucket, objects } = memoryBucket();
  const env = {
    DB: db,
    ATTACHMENTS: bucket,
    BETTER_AUTH_SECRET: SECRET,
    APP_URL: "http://localhost:5173",
    TIMER_ROOM: { idFromName: () => "room", get: () => ({ fetch: async () => new Response(null, { status: 200 }) }) },
  } as unknown as Env;
  const pending: Promise<unknown>[] = [];
  const executionCtx = { waitUntil: (p: Promise<unknown>) => pending.push(p), passThroughOnException: () => {} } as unknown as ExecutionContext;

  const toolsFor = (userId: string) => {
    const tools = new Map<string, Handler>();
    const registrar = { registerTool: (name: string, _c: unknown, h: Handler) => tools.set(name, h) } as unknown as ToolRegistrar;
    registerAllTools(registrar, { env, workspaceId: "ws-A", userId, scope: "read_write", role: userId === "u-admin" ? "admin" : "member", executionCtx });
    return tools;
  };
  const call = async (userId: string, name: string, args: Record<string, unknown>) => {
    const result = await toolsFor(userId).get(name)!(args);
    await Promise.all(pending.splice(0));
    const body = result.content[0]?.text ?? "";
    return result.isError ? { error: body, data: null } : { error: null, data: JSON.parse(body) as Record<string, string> };
  };
  const signed = new Hono<{ Bindings: Env }>().route("/api/uploads/signed", signedUploadRouter);
  const put = (url: string, bytes: Uint8Array) =>
    signed.request(new URL(url).pathname, { method: "PUT", body: bytes, headers: { "Content-Length": String(bytes.byteLength) } }, env, executionCtx);
  const staged = new Hono<{ Bindings: Env; Variables: { workspaceId: string; userId: string } }>()
    .use("*", async (c, next) => {
      c.set("workspaceId", "ws-A");
      c.set("userId", "u-admin");
      await next();
    })
    .route("/api/uploads", uploadsRouter);
  const attachments = () => raw.prepare(`SELECT filename, content_type FROM task_attachments WHERE task_id = 't1'`).all();
  return { call, put, staged, env, executionCtx, objects, attachments };
}

describe("a file on disk reaches a task through a signed upload URL", () => {
  it("stages the PUT, attaches it by uploadId and hands back the Markdown that shows it", async () => {
    const w = world();
    const link = await w.call("u-admin", "request_upload_url", { filename: "shot.gif" });
    expect(link.data!.command).toContain(link.data!.uploadUrl);

    expect((await w.put(link.data!.uploadUrl, GIF_1X1)).status).toBe(201);
    const attached = await w.call("u-admin", "upload_task_attachment", { taskId: "t1", uploadId: link.data!.uploadId });

    expect(attached.error).toBeNull();
    expect(attached.data!.markdown).toMatch(/^!\[shot\.gif\]\(\/api\/attachments\/[\w-]+\)$/);
    expect(w.attachments()).toEqual([{ filename: "shot.gif", content_type: "image/gif" }]);
    // Taken once: the staged copy is gone.
    expect([...w.objects.keys()].filter((k) => k.startsWith("staging/"))).toEqual([]);
  });

  it("refuses a teammate's uploadId: staged files are found only under their uploader", async () => {
    const w = world();
    const link = await w.call("u-admin", "request_upload_url", { filename: "shot.gif" });
    await w.put(link.data!.uploadUrl, GIF_1X1);

    const stolen = await w.call("u-member", "upload_task_attachment", { taskId: "t1", uploadId: link.data!.uploadId });
    expect(stolen.error).toMatch(/No uploaded file/);
    expect(w.attachments()).toEqual([]);
  });

  it("refuses a tampered, expired or bodyless PUT", async () => {
    const w = world();
    const link = await w.call("u-admin", "request_upload_url", { filename: "shot.gif" });
    const url = new URL(link.data!.uploadUrl);
    const tampered = url.toString().replace(/.$/, (ch) => (ch === "A" ? "B" : "A"));
    expect((await w.put(tampered, GIF_1X1)).status).toBe(403);

    const grant = { workspaceId: "ws-A", userId: "u-admin", uploadId: "x", filename: "a.gif", expiresAt: Date.now() - 1 };
    expect(await verifyUploadGrant(SECRET, await signUploadGrant(SECRET, grant))).toBeNull();
    expect(await verifyUploadGrant("another-secret", await signUploadGrant(SECRET, { ...grant, expiresAt: Date.now() + 60_000 }))).toBeNull();

    // A signature made with the raw auth secret (what Better Auth signs cookies with) is not an upload grant.
    const payload = btoa(JSON.stringify({ ...grant, expiresAt: Date.now() + 60_000 })).replace(/=+$/, "");
    const rawKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const rawSig = new Uint8Array(await crypto.subtle.sign("HMAC", rawKey, new TextEncoder().encode(payload)));
    const forged = `${payload}.${btoa(String.fromCharCode(...rawSig)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
    expect(await verifyUploadGrant(SECRET, forged)).toBeNull();

    expect((await w.put(link.data!.uploadUrl, new Uint8Array())).status).toBe(400);
    expect([...w.objects.keys()].filter((k) => k.startsWith("staging/"))).toEqual([]);
  });

  it("refuses a PUT that declares more than 25 MB before reading it", async () => {
    const w = world();
    const link = await w.call("u-admin", "request_upload_url", { filename: "big.bin" });
    const signed = new Hono<{ Bindings: Env }>().route("/api/uploads/signed", signedUploadRouter);
    const res = await signed.request(
      new URL(link.data!.uploadUrl).pathname,
      { method: "PUT", body: GIF_1X1, headers: { "Content-Length": String(26 * 1024 * 1024) } },
      w.env,
      w.executionCtx
    );
    expect(res.status).toBe(413);
  });
});

describe("upload_task_attachment", () => {
  it("takes a file the Assistant's composer staged", async () => {
    const w = world();
    const form = new FormData();
    form.set("file", new File([GIF_1X1], "pasted.gif"));
    const res = await w.staged.request("/api/uploads", { method: "POST", body: form }, w.env, w.executionCtx);
    expect(res.status).toBe(201);
    const { uploadId } = (await res.json()) as { uploadId: string };

    const attached = await w.call("u-admin", "upload_task_attachment", { taskId: "t1", uploadId });
    expect(attached.data!.markdown).toMatch(/^!\[pasted\.gif\]/);
  });

  it("still takes a tiny file as base64, and a non-image comes back as a file card link", async () => {
    const w = world();
    const attached = await w.call("u-admin", "upload_task_attachment", { taskId: "t1", filename: "notes.txt", contentBase64: btoa("hello") });
    expect(attached.data!.markdown).toMatch(/^\[notes\.txt\]\(\/api\/attachments\/[\w-]+\)$/);
  });

  it("refuses an uploadId that isn't a UUID, so it can't reach past the caller's own staging prefix", async () => {
    const w = world();
    const r = await w.call("u-admin", "upload_task_attachment", { taskId: "t1", uploadId: "../u-member/x" });
    expect(r.error).toMatch(/No uploaded file/);
  });

  it("asks for exactly one source", async () => {
    const w = world();
    expect((await w.call("u-admin", "upload_task_attachment", { taskId: "t1" })).error).toMatch(/exactly one/);
    expect((await w.call("u-admin", "upload_task_attachment", { taskId: "t1", uploadId: "x", contentBase64: "aGk=" })).error).toMatch(/exactly one/);
  });
});

describe("uploadIds attach and show a file in one call", () => {
  async function stage(w: ReturnType<typeof world>, name: string) {
    const link = await w.call("u-admin", "request_upload_url", { filename: name });
    await w.put(link.data!.uploadUrl, GIF_1X1);
    return link.data!.uploadId;
  }

  it("add_task_comment puts the image under the comment's text", async () => {
    const w = world();
    const uploadId = await stage(w, "bug.gif");
    const comment = await w.call("u-admin", "add_task_comment", { taskId: "t1", body: "Shows the mobile bug", uploadIds: [uploadId] });
    expect(comment.error).toBeNull();
    expect(comment.data!.body).toMatch(/^Shows the mobile bug\n\n!\[bug\.gif\]\(\/api\/attachments\/[\w-]+\)$/);
    expect(w.attachments()).toHaveLength(1);
  });

  it("update_task keeps the notes and adds the image at their end", async () => {
    const w = world();
    await w.call("u-admin", "update_task", { taskId: "t1", description: "## Context\n- Overlaps on mobile." });
    const uploadId = await stage(w, "bug.gif");
    const updated = await w.call("u-admin", "update_task", { taskId: "t1", uploadIds: [uploadId] });
    expect(updated.error).toBeNull();
    expect(updated.data!.notes).toMatch(/^## Context\n\n- Overlaps on mobile\.\n\n!\[bug\.gif\]\(\/api\/attachments\/[\w-]+\)$/);
  });

  it("create_task puts the files in the new task's notes", async () => {
    const w = world();
    const uploadId = await stage(w, "mockup.gif");
    const created = await w.call("u-admin", "create_task", { projectId: "p1", name: "Build the new header", description: "## Goal\n- Match the mockup.", uploadIds: [uploadId] });
    expect(created.error).toBeNull();
    expect(created.data!.notes).toMatch(/^## Goal\n\n- Match the mockup\.\n\n!\[mockup\.gif\]\(\/api\/attachments\/[\w-]+\)$/);
  });

  it("refuses an unknown uploadId before writing the comment", async () => {
    const w = world();
    const comment = await w.call("u-admin", "add_task_comment", { taskId: "t1", body: "hi", uploadIds: ["nope"] });
    expect(comment.error).toMatch(/No uploaded file/);
  });
});

