import { describe, expect, it } from "vitest";
import { createMigratedD1 } from "../../test/sqlite-d1";
import { routeClient } from "../../test/route-harness";
import { taskStatusesRouter } from "./task-statuses";

/** ws-A has three workspace-wide statuses (To do is the default) and two tasks; ws-B has one status of its own. */
function world() {
  const { db, raw } = createMigratedD1();
  const now = "2026-01-01 00:00:00";
  const people = [["u-owner", "owner"], ["u-admin", "admin"], ["u-ana", "member"]];
  raw.exec(`
    INSERT INTO workspaces (id, name) VALUES ('ws-A', 'A'), ('ws-B', 'B');
    ${["u-owner", "u-admin", "u-ana", "u-eve"].map((id) => `INSERT INTO "user" (id, name, email, createdAt, updatedAt) VALUES ('${id}', '${id}', '${id}@x.test', '${now}', '${now}');`).join("\n")}
    ${people.map(([id, role]) => `INSERT INTO "member" (id, organizationId, userId, role, createdAt) VALUES ('m-${id}', 'ws-A', '${id}', '${role}', '${now}');`).join("\n")}
    INSERT INTO "member" (id, organizationId, userId, role, createdAt) VALUES ('m-eve', 'ws-B', 'u-eve', 'owner', '${now}');
    INSERT INTO clients (id, workspace_id, name) VALUES ('cl-A', 'ws-A', 'Client');
    INSERT INTO projects (id, workspace_id, name, client_id) VALUES ('p1', 'ws-A', 'One', 'cl-A');
    INSERT INTO task_statuses (id, workspace_id, project_id, name, color, category, sort_order, is_default) VALUES
      ('s-todo', 'ws-A', NULL, 'To do', '#3b82f6', 'not_started', 1, 1),
      ('s-doing', 'ws-A', NULL, 'Doing', '#f59e0b', 'active', 2, 0),
      ('s-done', 'ws-A', NULL, 'Done', '#22c55e', 'completed', 3, 0),
      ('s-B', 'ws-B', NULL, 'Elsewhere', '#000000', 'not_started', 1, 1);
    INSERT INTO tasks (id, workspace_id, project_id, name, status_id, active) VALUES
      ('t-open', 'ws-A', 'p1', 'open task', 's-doing', 1);
    INSERT INTO tasks (id, workspace_id, project_id, name, status_id, active, completed_at) VALUES
      ('t-done', 'ws-A', 'p1', 'done task', 's-done', 0, '2026-01-02T00:00:00.000Z');
  `);
  const as = (userId: string, workspaceId = "ws-A") => routeClient(taskStatusesRouter, db, { workspaceId, userId });
  const status = (id: string) => raw.prepare(`SELECT * FROM task_statuses WHERE id = ?`).get(id) as Record<string, unknown>;
  const task = (id: string) => raw.prepare(`SELECT status_id, active, completed_at FROM tasks WHERE id = ?`).get(id) as Record<string, unknown>;
  const defaults = () => (raw.prepare(`SELECT id FROM task_statuses WHERE workspace_id = 'ws-A' AND is_default = 1 AND archived = 0`).all() as { id: string }[]).map((r) => r.id);
  return { as, status, task, defaults };
}

describe("GET /", () => {
  it("lists the workspace's statuses in order, to any member, and never another workspace's", async () => {
    const { as } = world();
    const list = (await (await as("u-ana").get("/")).json()) as { id: string }[];
    expect(list.map((s) => s.id)).toEqual(["s-todo", "s-doing", "s-done"]);
  });
});

describe("configuring statuses is for owners and admins", () => {
  it.each([
    ["creating", (c: ReturnType<ReturnType<typeof world>["as"]>) => c.post("/", { name: "QA", category: "active" })],
    ["renaming", (c: ReturnType<ReturnType<typeof world>["as"]>) => c.put("/s-doing", { name: "Working" })],
    ["archiving", (c: ReturnType<ReturnType<typeof world>["as"]>) => c.post("/s-todo/archive", {})],
    ["forking", (c: ReturnType<ReturnType<typeof world>["as"]>) => c.post("/fork", { projectId: "p1" })],
  ])("refuses a member %s", async (_name, act) => {
    const { as } = world();
    expect((await act(as("u-ana"))).status).toBe(403);
  });
});

describe("POST /", () => {
  it("lets an admin add a status, ordered last, never as the default, with a colour picked for it", async () => {
    const { as, status, defaults } = world();
    const res = await as("u-admin").post("/", { name: "QA", category: "active" });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    expect(status(id)).toMatchObject({ workspace_id: "ws-A", name: "QA", category: "active", is_default: 0, sort_order: 4 });
    expect(String(status(id).color)).toMatch(/^#/);
    expect(defaults()).toEqual(["s-todo"]);
  });

  it("refuses a name that is already taken, ignoring case and spaces", async () => {
    const { as } = world();
    expect((await as("u-owner").post("/", { name: "  doing ", category: "active" })).status).toBe(409);
  });

  it("allows a name another workspace already uses", async () => {
    const { as } = world();
    expect((await as("u-owner").post("/", { name: "Elsewhere", category: "active" })).status).toBe(201);
  });
});

describe("PUT /:id", () => {
  it("renames a status", async () => {
    const { as, status } = world();
    expect((await as("u-owner").put("/s-doing", { name: "In progress" })).status).toBe(200);
    expect(status("s-doing").name).toBe("In progress");
  });

  it("refuses a rename onto another status's name", async () => {
    const { as, status } = world();
    expect((await as("u-owner").put("/s-doing", { name: "DONE" })).status).toBe(409);
    expect(status("s-doing").name).toBe("Doing");
  });

  it("answers 404 for another workspace's status and leaves it alone", async () => {
    const { as, status } = world();
    expect((await as("u-owner").put("/s-B", { name: "Hijacked" })).status).toBe(404);
    expect(status("s-B").name).toBe("Elsewhere");
  });

  it("gives the default to the status that claims it, so there is exactly one", async () => {
    const { as, defaults } = world();
    expect((await as("u-owner").put("/s-doing", { isDefault: true })).status).toBe(200);
    expect(defaults()).toEqual(["s-doing"]);
  });

  it("refuses to make a completed status the default for new tasks", async () => {
    const { as, defaults } = world();
    expect((await as("u-owner").put("/s-done", { isDefault: true })).status).toBe(400);
    expect(defaults()).toEqual(["s-todo"]);
  });

  it("keeps at least one completed status and at least one that is not", async () => {
    const { as, status } = world();
    expect((await as("u-owner").put("/s-done", { category: "active" })).status).toBe(400);
    expect(status("s-done").category).toBe("completed");
    // Only To do and Doing are open: turning one into completed is fine, the other is then the last open one.
    expect((await as("u-owner").put("/s-doing", { category: "completed" })).status).toBe(200);
    expect((await as("u-owner").put("/s-todo", { category: "completed" })).status).toBe(400);
  });

  it("carries the tasks in a status across the done line when its category changes, both ways", async () => {
    const { as, task } = world();
    await as("u-owner").put("/s-doing", { category: "completed" });
    expect(task("t-open")).toMatchObject({ active: 0 });
    expect(task("t-open").completed_at).not.toBeNull();
    await as("u-owner").put("/s-doing", { category: "active" });
    expect(task("t-open")).toMatchObject({ active: 1, completed_at: null });
  });
});

describe("POST /:id/archive", () => {
  it("archives an empty status and takes it out of the list", async () => {
    const { as, status } = world();
    await as("u-owner").post("/", { name: "Spare", category: "active" });
    const spare = ((await (await as("u-owner").get("/")).json()) as { id: string; name: string }[]).find((s) => s.name === "Spare")!;
    const res = await as("u-owner").post(`/${spare.id}/archive`, {});
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, moved: 0 });
    expect(status(spare.id).archived).toBe(1);
  });

  it("refuses to archive a status that still holds tasks unless it is told where they go", async () => {
    const { as, status } = world();
    const res = await as("u-owner").post("/s-doing/archive", {});
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ taskCount: 1 });
    expect(status("s-doing").archived).toBe(0);
  });

  it("moves the tasks to the chosen status and archives", async () => {
    const { as, status, task } = world();
    const res = await as("u-owner").post("/s-doing/archive", { moveTo: "s-todo" });
    expect(await res.json()).toEqual({ ok: true, moved: 1 });
    expect(task("t-open")).toMatchObject({ status_id: "s-todo", active: 1, completed_at: null });
    expect(status("s-doing").archived).toBe(1);
  });

  it("marks tasks completed when they are moved into a completed status", async () => {
    const { as, task } = world();
    await as("u-owner").post("/s-doing/archive", { moveTo: "s-done" });
    expect(task("t-open")).toMatchObject({ status_id: "s-done", active: 0 });
    expect(task("t-open").completed_at).not.toBeNull();
  });

  it("refuses to move tasks into the status being archived", async () => {
    const { as } = world();
    expect((await as("u-owner").post("/s-doing/archive", { moveTo: "s-doing" })).status).toBe(400);
  });

  it("refuses to move tasks into another workspace's status", async () => {
    const { as, task, status } = world();
    expect((await as("u-owner").post("/s-doing/archive", { moveTo: "s-B" })).status).toBe(400);
    expect(task("t-open").status_id).toBe("s-doing");
    expect(status("s-doing").archived).toBe(0);
  });

  it("keeps the last completed status and the last open one", async () => {
    const { as } = world();
    expect((await as("u-owner").post("/s-done/archive", { moveTo: "s-todo" })).status).toBe(400);
    await as("u-owner").post("/s-doing/archive", { moveTo: "s-todo" });
    expect((await as("u-owner").post("/s-todo/archive", { moveTo: "s-done" })).status).toBe(400);
  });

  it("passes the default flag to the next open status when the default is archived", async () => {
    const { as, defaults } = world();
    await as("u-owner").post("/s-todo/archive", { moveTo: "s-doing" });
    expect(defaults()).toEqual(["s-doing"]);
  });

  it("answers 404 for another workspace's status", async () => {
    const { as, status } = world();
    expect((await as("u-owner").post("/s-B/archive", {})).status).toBe(404);
    expect(status("s-B").archived).toBe(0);
  });
});
