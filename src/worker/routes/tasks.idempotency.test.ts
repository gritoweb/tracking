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

const ID = "0b6f7c1e-3f2a-4d7b-9a51-2c8e4f6a9d10";

function world() {
  const { db, raw } = createMigratedD1();
  const now = "2026-01-01 00:00:00";
  raw.exec(`
    INSERT INTO workspaces (id, name) VALUES ('ws-A', 'A'), ('ws-B', 'B');
    INSERT INTO "user" (id, name, email, createdAt, updatedAt) VALUES ('u-ana', 'Ana', 'ana@x.test', '${now}', '${now}');
    INSERT INTO "member" (id, organizationId, userId, role, createdAt) VALUES ('m-ana', 'ws-A', 'u-ana', 'owner', '${now}');
    INSERT INTO clients (id, workspace_id, name) VALUES ('cl-A', 'ws-A', 'Client'), ('cl-B', 'ws-B', 'Client');
    INSERT INTO projects (id, workspace_id, name, client_id) VALUES ('p1', 'ws-A', 'One', 'cl-A'), ('pB', 'ws-B', 'B', 'cl-B');
    INSERT INTO tasks (id, workspace_id, project_id, name) VALUES ('parent', 'ws-A', 'p1', 'Parent');
  `);
  const env = { DB: db } as unknown as Env;
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;
  const app = new Hono<{ Bindings: Env; Variables: { workspaceId: string; userId: string } }>()
    .use("*", async (c, next) => {
      c.set("workspaceId", "ws-A");
      c.set("userId", "u-ana");
      await next();
    })
    .route("/", tasksRouter);
  const post = (body: object) =>
    app.request("/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, env, ctx);
  const subtasks = () => (raw.prepare(`SELECT COUNT(*) AS n FROM tasks WHERE parent_id = 'parent'`).get() as { n: number }).n;
  return { post, subtasks, raw };
}

describe("POST /tasks with a client id (a double Enter on the subtask field)", () => {
  it("creates the subtask once however many times the same create arrives", async () => {
    const { post, subtasks } = world();
    const body = { id: ID, name: "Write tests", projectId: "p1", parentId: "parent" };

    const first = await post(body);
    expect(first.status).toBe(201);
    const replays = await Promise.all([post(body), post(body), post(body)]);

    expect(replays.map((r) => r.status)).toEqual([200, 200, 200]);
    for (const r of replays) expect(((await r.json()) as { id: string }).id).toBe(ID);
    expect(subtasks()).toBe(1);
  });

  it("still creates two tasks with the same name when their ids differ", async () => {
    const { post, subtasks } = world();
    await post({ id: ID, name: "Same", projectId: "p1", parentId: "parent" });
    await post({ id: crypto.randomUUID(), name: "Same", projectId: "p1", parentId: "parent" });
    expect(subtasks()).toBe(2);
  });

  it("refuses an id already taken in another workspace, without revealing that task", async () => {
    const { post, raw } = world();
    raw.exec(`INSERT INTO tasks (id, workspace_id, project_id, name) VALUES ('${ID}', 'ws-B', 'pB', 'Secret')`);
    const res = await post({ id: ID, name: "Mine", projectId: "p1" });
    expect(res.status).toBe(409);
    expect(JSON.stringify(await res.json())).not.toContain("Secret");
  });

  it("rejects an id that isn't a UUID", async () => {
    const { post } = world();
    const res = await post({ id: "t1", name: "Mine", projectId: "p1" });
    expect(res.status).toBe(400);
  });

  it("keeps creating without an id, as the MCP and older clients do", async () => {
    const { post } = world();
    const res = await post({ name: "No id", projectId: "p1" });
    expect(res.status).toBe(201);
  });
});
