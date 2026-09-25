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

/** ws-A: u-author edits; Ana Maria and Bo are members; Eve is in another workspace. */
function world() {
  const { db, raw } = createMigratedD1();
  const now = "2026-01-01 00:00:00";
  raw.exec(`
    INSERT INTO workspaces (id, name) VALUES ('ws-A', 'A'), ('ws-B', 'B');
    INSERT INTO "user" (id, name, email, createdAt, updatedAt) VALUES
      ('u-author', 'Author', 'author@x.test', '${now}', '${now}'),
      ('u-ana', 'Ana Maria', 'ana@x.test', '${now}', '${now}'),
      ('u-bo', 'Bo', 'bo@x.test', '${now}', '${now}'),
      ('u-eve', 'Eve', 'eve@x.test', '${now}', '${now}');
    INSERT INTO "member" (id, organizationId, userId, role, createdAt) VALUES
      ('m1', 'ws-A', 'u-author', 'owner', '${now}'),
      ('m2', 'ws-A', 'u-ana', 'member', '${now}'),
      ('m3', 'ws-A', 'u-bo', 'member', '${now}'),
      ('m4', 'ws-B', 'u-eve', 'owner', '${now}');
    INSERT INTO clients (id, workspace_id, name) VALUES ('cl-A', 'ws-A', 'Client A');
    INSERT INTO projects (id, workspace_id, name, client_id) VALUES ('p-A', 'ws-A', 'Project A', 'cl-A');
    INSERT INTO task_statuses (id, workspace_id, project_id, name, color, category, sort_order, is_default) VALUES
      ('s-A', 'ws-A', NULL, 'To do', '#3b82f6', 'not_started', 1, 1);
    INSERT INTO tasks (id, workspace_id, project_id, name, status_id, created_by) VALUES
      ('t-A', 'ws-A', 'p-A', 'Review @Bo copy', 's-A', 'u-author');
  `);
  const pending: Promise<unknown>[] = [];
  const room = { idFromName: () => "room", get: () => ({ fetch: async () => new Response("ok") }) };
  const env = { DB: db, TIMER_ROOM: room, NOTIFICATION_ROOM: room } as unknown as Env;
  const ctx = { waitUntil: (p: Promise<unknown>) => pending.push(p), passThroughOnException: () => {} } as unknown as ExecutionContext;
  const app = new Hono<{ Bindings: Env; Variables: { workspaceId: string; userId: string } }>()
    .use("*", async (c, next) => {
      c.set("workspaceId", "ws-A");
      c.set("userId", "u-author");
      await next();
    })
    .route("/", tasksRouter);
  const send = async (method: string, path: string, body: unknown) => {
    const res = await app.request(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, env, ctx);
    await Promise.all(pending);
    return res;
  };
  const notified = () =>
    raw.prepare(`SELECT user_id, type, body FROM notifications ORDER BY user_id`).all() as { user_id: string; type: string; body: string }[];
  return { send, notified };
}

const doc = (...ids: string[]) =>
  JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: ids.map((id) => ({ type: "mention", attrs: { id, label: id } })) }] });

describe("PUT /:id — people tagged in the title", () => {
  it("notifies someone newly tagged in the title, and only them", async () => {
    const w = world();
    const res = await w.send("PUT", "/t-A", { name: "Review @Bo copy with @Ana Maria" });
    expect(res.status).toBe(200);
    expect(w.notified()).toEqual([{ user_id: "u-ana", type: "task_mention", body: "Review @Bo copy with @Ana Maria: in the title" }]);
  });

  it("never notifies the editor tagging themselves, or a name that isn't a member here", async () => {
    const w = world();
    await w.send("PUT", "/t-A", { name: "Review @Author and @Eve" });
    expect(w.notified()).toEqual([]);
  });

  it("is quiet when the title changes without a new tag", async () => {
    const w = world();
    await w.send("PUT", "/t-A", { name: "Review @Bo copy today" });
    expect(w.notified()).toEqual([]);
  });
});

describe("POST / — people tagged when the task is created", () => {
  it("notifies people tagged in the title or description, once each", async () => {
    const w = world();
    const res = await w.send("POST", "/", { name: "Ping @Bo", projectId: "p-A", description: doc("u-ana", "u-bo") });
    expect(res.status).toBe(201);
    expect(w.notified().map((n) => [n.user_id, n.body])).toEqual([
      ["u-ana", "Ping @Bo: in the description"],
      ["u-bo", "Ping @Bo: in the title"],
    ]);
  });
});
