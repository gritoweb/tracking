import { describe, expect, it, vi } from "vitest";
import { createMigratedD1 } from "../../test/sqlite-d1";
import { routeClient } from "../../test/route-harness";

// tasks.ts imports lib/image.ts, which loads a real WASM module outside vitest — stub it out (same as tasks.test.ts).
vi.mock("@cf-wasm/photon/workerd", () => ({
  PhotonImage: class {},
  SamplingFilter: { Lanczos3: 1 },
  resize: vi.fn(),
}));

const { tasksRouter } = await import("./tasks");

/** ws-A: owner u-owner, member u-member (author of t-mine), admin u-admin. ws-B holds t-foreign. */
function archivingWorld() {
  const { db, raw } = createMigratedD1();
  const now = "2026-01-01 00:00:00";
  raw.exec(`
    INSERT INTO workspaces (id, name) VALUES ('ws-A', 'A'), ('ws-B', 'B');
    INSERT INTO "user" (id, name, email, createdAt, updatedAt) VALUES
      ('u-owner', 'Owner', 'o@x.test', '${now}', '${now}'),
      ('u-admin', 'Admin', 'a@x.test', '${now}', '${now}'),
      ('u-member', 'Member', 'm@x.test', '${now}', '${now}');
    INSERT INTO "member" (id, organizationId, userId, role, createdAt) VALUES
      ('m-owner', 'ws-A', 'u-owner', 'owner', '${now}'),
      ('m-admin', 'ws-A', 'u-admin', 'admin', '${now}'),
      ('m-member', 'ws-A', 'u-member', 'member', '${now}');
    INSERT INTO clients (id, workspace_id, name) VALUES ('cl-A', 'ws-A', 'Client A'), ('cl-B', 'ws-B', 'Client B');
    INSERT INTO projects (id, workspace_id, name, client_id) VALUES ('p-A', 'ws-A', 'Project A', 'cl-A'), ('p-B', 'ws-B', 'Project B', 'cl-B');
    INSERT INTO task_statuses (id, workspace_id, project_id, name, color, category, sort_order, is_default) VALUES
      ('s-todo', 'ws-A', NULL, 'To do', '#3b82f6', 'not_started', 1, 1),
      ('s-done', 'ws-A', NULL, 'Done', '#22c55e', 'completed', 2, 0),
      ('s-todo-B', 'ws-B', NULL, 'To do', '#3b82f6', 'not_started', 1, 1);
    INSERT INTO tasks (id, workspace_id, project_id, name, status_id, created_by, parent_id) VALUES
      ('t-owner', 'ws-A', 'p-A', 'Owner task', 's-todo', 'u-owner', NULL),
      ('t-owner-sub', 'ws-A', 'p-A', 'Owner subtask', 's-todo', 'u-owner', 't-owner'),
      ('t-mine', 'ws-A', 'p-A', 'Member task', 's-todo', 'u-member', NULL),
      ('t-foreign', 'ws-B', 'p-B', 'Foreign task', 's-todo-B', NULL, NULL);
  `);
  const as = (userId: string) => routeClient(tasksRouter, db, { workspaceId: "ws-A", userId });
  const archivedAt = (id: string) =>
    (raw.prepare(`SELECT archived_at FROM tasks WHERE id = ?`).get(id) as { archived_at: string | null } | undefined)?.archived_at;
  return { db, raw, as, archivedAt };
}

async function ids(res: Response): Promise<string[]> {
  return ((await res.json()) as Array<{ id: string }>).map((t) => t.id).sort();
}

describe("task archiving — listing", () => {
  it("hides archived tasks unless includeArchived is asked for", async () => {
    const { raw, as } = archivingWorld();
    raw.exec(`UPDATE tasks SET archived_at = '2026-02-01T00:00:00.000Z' WHERE id IN ('t-owner', 't-owner-sub')`);
    const owner = as("u-owner");

    expect(await ids(await owner.get("/?includeInactive=true"))).toEqual(["t-mine"]);
    const all = await owner.get("/?includeInactive=true&includeArchived=true");
    const body = (await all.json()) as Array<{ id: string; archivedAt: string | null }>;
    expect(body.map((t) => t.id).sort()).toEqual(["t-mine", "t-owner", "t-owner-sub"]);
    expect(body.find((t) => t.id === "t-owner")?.archivedAt).toBe("2026-02-01T00:00:00.000Z");
  });

  it("still opens an archived task by id", async () => {
    const { raw, as } = archivingWorld();
    raw.exec(`UPDATE tasks SET archived_at = '2026-02-01T00:00:00.000Z' WHERE id = 't-owner'`);
    expect((await as("u-owner").get("/t-owner")).status).toBe(200);
  });
});

describe("POST /bulk — archive, unarchive, delete", () => {
  it("archives a task with its subtasks and records it in the history", async () => {
    const { raw, as, archivedAt } = archivingWorld();
    const res = await as("u-owner").post("/bulk", { ids: ["t-owner"], action: "archive" });
    expect(res.status).toBe(200);
    expect(archivedAt("t-owner")).toBeTruthy();
    expect(archivedAt("t-owner-sub")).toBeTruthy();
    expect(archivedAt("t-mine")).toBeNull();
    const kinds = raw.prepare(`SELECT kind, user_id FROM task_activity WHERE task_id = 't-owner'`).all();
    expect(kinds).toEqual([{ kind: "archived", user_id: "u-owner" }]);
  });

  it("unarchives the task and its subtasks and marks when it was unarchived", async () => {
    const { raw, as, archivedAt } = archivingWorld();
    raw.exec(`UPDATE tasks SET archived_at = '2026-02-01T00:00:00.000Z' WHERE id IN ('t-owner', 't-owner-sub')`);
    const res = await as("u-owner").post("/bulk", { ids: ["t-owner"], action: "unarchive" });
    expect(res.status).toBe(200);
    expect(archivedAt("t-owner")).toBeNull();
    expect(archivedAt("t-owner-sub")).toBeNull();
    const row = raw.prepare(`SELECT unarchived_at FROM tasks WHERE id = 't-owner'`).get() as { unarchived_at: string | null };
    expect(row.unarchived_at).toBeTruthy();
  });

  it("lets a member archive their own task", async () => {
    const { as, archivedAt } = archivingWorld();
    expect((await as("u-member").post("/bulk", { ids: ["t-mine"], action: "archive" })).status).toBe(200);
    expect(archivedAt("t-mine")).toBeTruthy();
  });

  it("refuses a member the whole batch when one task isn't theirs, changing nothing", async () => {
    const { as, archivedAt } = archivingWorld();
    const res = await as("u-member").post("/bulk", { ids: ["t-mine", "t-owner"], action: "archive" });
    expect(res.status).toBe(403);
    expect(archivedAt("t-mine")).toBeNull();
    expect(archivedAt("t-owner")).toBeNull();
  });

  it("lets owner and admin archive anyone's task", async () => {
    const { as, archivedAt } = archivingWorld();
    expect((await as("u-admin").post("/bulk", { ids: ["t-mine"], action: "archive" })).status).toBe(200);
    expect(archivedAt("t-mine")).toBeTruthy();
    expect((await as("u-owner").post("/bulk", { ids: ["t-mine"], action: "unarchive" })).status).toBe(200);
    expect(archivedAt("t-mine")).toBeNull();
  });

  it("refuses to archive a subtask on its own", async () => {
    const { as, archivedAt } = archivingWorld();
    expect((await as("u-owner").post("/bulk", { ids: ["t-owner-sub"], action: "archive" })).status).toBe(400);
    expect(archivedAt("t-owner-sub")).toBeNull();
  });

  it("treats another workspace's task as not found and touches nothing", async () => {
    const { as, archivedAt } = archivingWorld();
    for (const action of ["archive", "delete"] as const) {
      const res = await as("u-owner").post("/bulk", { ids: ["t-owner", "t-foreign"], action });
      expect(res.status).toBe(404);
    }
    expect(archivedAt("t-owner")).toBeNull();
    expect(archivedAt("t-foreign")).toBeNull();
  });

  it("deletes tasks with every subtask and leaves their time entries' hours and project alone", async () => {
    const { raw, as } = archivingWorld();
    raw.exec(`
      INSERT INTO tasks (id, workspace_id, project_id, name, status_id, created_by, parent_id) VALUES
        ('t-owner-sub2', 'ws-A', 'p-A', 'Second', 's-todo', 'u-owner', 't-owner'),
        ('t-owner-sub3', 'ws-A', 'p-A', 'Third', 's-todo', 'u-owner', 't-owner');
      INSERT INTO time_entries (id, workspace_id, project_id, user_id, description, start, stop, duration, task_id) VALUES
        ('e-1', 'ws-A', 'p-A', 'u-owner', 'Work', '2026-01-02T09:00:00Z', '2026-01-02T11:00:00Z', 7200, 't-owner-sub3');
    `);
    const res = await as("u-owner").post("/bulk", { ids: ["t-owner", "t-mine"], action: "delete" });
    expect(res.status).toBe(200);
    const left = raw.prepare(`SELECT id FROM tasks WHERE workspace_id = 'ws-A'`).all();
    expect(left).toEqual([]);
    expect(raw.prepare(`SELECT project_id, duration, description, task_id FROM time_entries WHERE id = 'e-1'`).get()).toEqual({
      project_id: "p-A", duration: 7200, description: "Work", task_id: null,
    });
  });

  it("archives more tasks than one statement's bind limit allows", async () => {
    const { raw, as } = archivingWorld();
    const many = Array.from({ length: 95 }, (_, i) => `t-bulk-${i}`);
    raw.exec(
      `INSERT INTO tasks (id, workspace_id, project_id, name, status_id, created_by) VALUES ` +
        many.map((id) => `('${id}', 'ws-A', 'p-A', '${id}', 's-todo', 'u-owner')`).join(", ")
    );
    expect((await as("u-owner").post("/bulk", { ids: many, action: "archive" })).status).toBe(200);
    const archived = raw.prepare(`SELECT COUNT(*) AS n FROM tasks WHERE archived_at IS NOT NULL`).get() as { n: number };
    expect(archived.n).toBe(95);
  });
});

describe("DELETE /:id — shares the bulk deletion", () => {
  it("removes the task and every one of its subtasks, not just the first", async () => {
    const { raw, as } = archivingWorld();
    raw.exec(`INSERT INTO tasks (id, workspace_id, project_id, name, status_id, created_by, parent_id) VALUES
      ('t-owner-sub2', 'ws-A', 'p-A', 'Second', 's-todo', 'u-owner', 't-owner')`);
    expect((await as("u-owner").del("/t-owner")).status).toBe(200);
    expect(raw.prepare(`SELECT id FROM tasks WHERE workspace_id = 'ws-A' ORDER BY id`).all()).toEqual([{ id: "t-mine" }]);
  });

  it("still refuses a member deleting someone else's task", async () => {
    const { as } = archivingWorld();
    expect((await as("u-member").del("/t-owner")).status).toBe(403);
  });
});
