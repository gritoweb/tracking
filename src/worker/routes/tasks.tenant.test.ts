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

/** ws-A (admin u-admin) owns p-A and top-level task t-A; ws-B (u-eve) owns p-B and task t-B. */
function world() {
  const { db, raw } = createMigratedD1();
  const now = "2026-01-01 00:00:00";
  raw.exec(`
    INSERT INTO workspaces (id, name) VALUES ('ws-A', 'A'), ('ws-B', 'B');
    ${["u-admin", "u-eve"].map((id) => `INSERT INTO "user" (id, name, email, createdAt, updatedAt) VALUES ('${id}', '${id}', '${id}@x.test', '${now}', '${now}');`).join("\n")}
    INSERT INTO "member" (id, organizationId, userId, role, createdAt) VALUES ('m-admin', 'ws-A', 'u-admin', 'admin', '${now}');
    INSERT INTO "member" (id, organizationId, userId, role, createdAt) VALUES ('m-eve', 'ws-B', 'u-eve', 'owner', '${now}');
    INSERT INTO clients (id, workspace_id, name) VALUES ('cl-A', 'ws-A', 'Client A'), ('cl-B', 'ws-B', 'Client B');
    INSERT INTO projects (id, workspace_id, name, client_id) VALUES ('p-A', 'ws-A', 'Project A', 'cl-A'), ('p-B', 'ws-B', 'Project B', 'cl-B');
    INSERT INTO task_statuses (id, workspace_id, project_id, name, color, category, sort_order, is_default) VALUES
      ('s-A', 'ws-A', NULL, 'To do', '#3b82f6', 'not_started', 1, 1),
      ('s-B', 'ws-B', NULL, 'To do', '#3b82f6', 'not_started', 1, 1);
    INSERT INTO tasks (id, workspace_id, project_id, name, status_id) VALUES
      ('t-A', 'ws-A', 'p-A', 'task in A', 's-A'),
      ('t-B', 'ws-B', 'p-B', 'task in B', 's-B');
  `);
  const env = { DB: db, TIMER_ROOM: { idFromName: () => "room", get: () => ({ fetch: async () => new Response("ok") }) } } as unknown as Env;
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;
  const app = new Hono<{ Bindings: Env; Variables: { workspaceId: string; userId: string } }>()
    .use("*", async (c, next) => {
      c.set("workspaceId", "ws-A");
      c.set("userId", "u-admin");
      await next();
    })
    .route("/", tasksRouter);
  const post = (body: unknown) =>
    app.request("/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, env, ctx);
  const tasksIn = (workspaceId: string) => (raw.prepare(`SELECT id, project_id, parent_id FROM tasks WHERE workspace_id = ?`).all(workspaceId) as { id: string; project_id: string; parent_id: string | null }[]);
  return { post, tasksIn };
}

describe("S-19 — POST / never stores another workspace's ids", () => {
  it("refuses a projectId that belongs to another workspace and writes nothing", async () => {
    const w = world();
    const res = await w.post({ name: "cross-tenant", projectId: "p-B" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("Project not found");
    expect(w.tasksIn("ws-A").map((t) => t.id)).toEqual(["t-A"]);
  });

  it("refuses a projectId that does not exist at all", async () => {
    const w = world();
    expect((await w.post({ name: "ghost", projectId: "nope" })).status).toBe(400);
    expect(w.tasksIn("ws-A")).toHaveLength(1);
  });

  it("refuses a parentId that belongs to another workspace", async () => {
    const w = world();
    const res = await w.post({ name: "cross-parent", projectId: "p-A", parentId: "t-B" });
    expect(res.status).toBe(400);
    expect(w.tasksIn("ws-A").map((t) => t.id)).toEqual(["t-A"]);
  });

  it("still creates a task in the caller's own project", async () => {
    const w = world();
    const res = await w.post({ name: "legit", projectId: "p-A" });
    expect(res.status).toBe(201);
    expect(((await res.json()) as { projectId: string }).projectId).toBe("p-A");
  });

  it("still creates a subtask under a top-level task, inheriting its project", async () => {
    const w = world();
    const res = await w.post({ name: "child", projectId: "p-A", parentId: "t-A" });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { parentId: string; projectId: string };
    expect([body.parentId, body.projectId]).toEqual(["t-A", "p-A"]);
  });

  it("still refuses a subtask of a subtask (one level only)", async () => {
    const w = world();
    const child = (await (await w.post({ name: "child", projectId: "p-A", parentId: "t-A" })).json()) as { id: string };
    expect((await w.post({ name: "grandchild", projectId: "p-A", parentId: child.id })).status).toBe(400);
  });

  it("a subtask ignores a foreign projectId in the body and follows its parent", async () => {
    const w = world();
    const res = await w.post({ name: "child", projectId: "p-B", parentId: "t-A" });
    expect(res.status).toBe(201);
    expect(((await res.json()) as { projectId: string }).projectId).toBe("p-A");
  });
});
