import { describe, expect, it, vi } from "vitest";
import { createMigratedD1 } from "../../test/sqlite-d1";
import { routeClient } from "../../test/route-harness";
import { Hono } from "hono";

// tasks.ts imports lib/image.ts, which loads a real WASM module outside vitest — stub it out (same as tasks.test.ts).
vi.mock("@cf-wasm/photon/workerd", () => ({
  PhotonImage: class {},
  SamplingFilter: { Lanczos3: 1 },
  resize: vi.fn(),
}));

const { tasksRouter } = await import("./tasks");
const { ARCHIVE_MAX_LIMIT, ARCHIVE_PAGE_LIMIT } = await import("@shared/schemas");

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

  it("archivedOnly returns just the archive, parents with their subtasks", async () => {
    const { raw, as } = archivingWorld();
    raw.exec(`UPDATE tasks SET archived_at = '2026-02-01T00:00:00.000Z' WHERE id IN ('t-owner', 't-owner-sub')`);
    expect(await ids(await as("u-owner").get("/?includeInactive=true&archivedOnly=true"))).toEqual(["t-owner", "t-owner-sub"]);
  });

  it("archivedOnly keeps the most recently archived parents up to the cap", async () => {
    const { raw, as } = archivingWorld();
    const rows = Array.from({ length: ARCHIVE_PAGE_LIMIT + 1 }, (_, i) => {
      const at = new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString();
      return `('t-a${i}', 'ws-A', 'p-A', 'Archived ${i}', 's-todo', 'u-owner', '${at}')`;
    });
    raw.exec(`INSERT INTO tasks (id, workspace_id, project_id, name, status_id, created_by, archived_at) VALUES ${rows.join(", ")}`);
    const listed = await ids(await as("u-owner").get("/?includeInactive=true&archivedOnly=true"));
    expect(listed).toHaveLength(ARCHIVE_PAGE_LIMIT);
    expect(listed).not.toContain("t-a0");
    expect(listed).toContain(`t-a${ARCHIVE_PAGE_LIMIT}`);
  });

  it("archiveLimit raises or lowers how many archived parents come back, within the ceiling", async () => {
    const { raw, as } = archivingWorld();
    const rows = Array.from({ length: 3 }, (_, i) => `('t-l${i}', 'ws-A', 'p-A', 'L${i}', 's-todo', 'u-owner', '2026-01-0${i + 1}T00:00:00.000Z')`);
    raw.exec(`INSERT INTO tasks (id, workspace_id, project_id, name, status_id, created_by, archived_at) VALUES ${rows.join(", ")}`);
    const owner = as("u-owner");
    expect(await ids(await owner.get("/?includeInactive=true&archivedOnly=true&archiveLimit=2"))).toEqual(["t-l1", "t-l2"]);
    expect(await ids(await owner.get("/?includeInactive=true&archivedOnly=true&archiveLimit=abc"))).toHaveLength(3);
    expect(await ids(await owner.get(`/?includeInactive=true&archivedOnly=true&archiveLimit=${ARCHIVE_MAX_LIMIT * 10}`))).toHaveLength(3);
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

  it("unarchives the task and its subtasks", async () => {
    const { raw, as, archivedAt } = archivingWorld();
    raw.exec(`UPDATE tasks SET archived_at = '2026-02-01T00:00:00.000Z' WHERE id IN ('t-owner', 't-owner-sub')`);
    const res = await as("u-owner").post("/bulk", { ids: ["t-owner"], action: "unarchive" });
    expect(res.status).toBe(200);
    expect(archivedAt("t-owner")).toBeNull();
    expect(archivedAt("t-owner-sub")).toBeNull();
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

describe("POST /bulk-update — each item is the task's own PUT, notifications grouped per person", () => {
  function bulkWorld() {
    const w = archivingWorld();
    const pending: Promise<unknown>[] = [];
    const ctx = { waitUntil: (p: Promise<unknown>) => void pending.push(p), passThroughOnException: () => {} } as unknown as ExecutionContext;
    const events: string[] = [];
    const room = { idFromName: () => "room", get: () => ({ fetch: async () => new Response("ok") }) };
    const timerRoom = {
      idFromName: () => "room",
      get: () => ({ fetch: async (req: Request) => (events.push(((await req.json()) as { event: string }).event), new Response("ok")) }),
    };
    const env = { DB: w.db, TIMER_ROOM: timerRoom, NOTIFICATION_ROOM: room } as unknown as Env;
    const app = new Hono<{ Bindings: Env; Variables: { workspaceId: string; userId: string } }>()
      .use("*", async (c, next) => {
        c.set("workspaceId", "ws-A");
        c.set("userId", "u-owner");
        await next();
      })
      .route("/", tasksRouter);
    const post = async (body: unknown) => {
      const res = await app.request("/bulk-update", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, env, ctx);
      while (pending.length) await Promise.all(pending.splice(0));
      return res;
    };
    return { ...w, post, events };
  }

  it("broadcasts once for the whole batch, not once (or twice) per task", async () => {
    const { post, events } = bulkWorld();
    await post({
      items: [
        { id: "t-owner", patch: { priority: 1 } },
        { id: "t-mine", patch: { priority: 1 } },
        { id: "t-owner-sub", patch: { dueDate: "2026-10-01" } },
      ],
    });
    expect(events).toEqual(["tasks:changed"]);
  });

  it("assigns several tasks and sends the assignee ONE notification naming them", async () => {
    const { raw, post } = bulkWorld();
    const res = await post({
      items: [
        { id: "t-owner", patch: { assigneeIds: ["u-member"] } },
        { id: "t-mine", patch: { assigneeIds: ["u-member"] } },
      ],
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { updated: number }).updated).toBe(2);
    expect(raw.prepare(`SELECT task_id FROM task_assignees WHERE user_id = 'u-member' ORDER BY task_id`).all()).toEqual([
      { task_id: "t-mine" }, { task_id: "t-owner" },
    ]);
    const notes = raw.prepare(`SELECT title, body, link FROM notifications WHERE user_id = 'u-member'`).all();
    expect(notes).toEqual([{ title: "Owner assigned you 2 tasks", body: '"Owner task", "Member task"', link: "/tasks" }]);
  });

  it("keeps the usual single notification when only one task changes", async () => {
    const { raw, post } = bulkWorld();
    await post({ items: [{ id: "t-owner", patch: { assigneeIds: ["u-member"] } }] });
    const notes = raw.prepare(`SELECT title FROM notifications WHERE user_id = 'u-member'`).all();
    expect(notes).toEqual([{ title: 'Owner assigned you "Owner task"' }]);
  });

  it("moves status through the same rules (mirror + history) and reports a failed item without stopping", async () => {
    const { raw, post } = bulkWorld();
    const res = await post({
      items: [
        { id: "t-owner", patch: { statusId: "s-done" } },
        { id: "t-foreign", patch: { statusId: "s-done" } },
      ],
    });
    const body = (await res.json()) as { results: Array<{ id: string; ok: boolean }> };
    expect(body.results).toEqual([
      { id: "t-owner", ok: true },
      expect.objectContaining({ id: "t-foreign", ok: false }),
    ]);
    const row = raw.prepare(`SELECT active, completed_at FROM tasks WHERE id = 't-owner'`).get() as { active: number; completed_at: string | null };
    expect(row.active).toBe(0);
    expect(row.completed_at).toBeTruthy();
    expect(raw.prepare(`SELECT kind FROM task_activity WHERE task_id = 't-owner'`).all()).toEqual([{ kind: "status" }]);
    expect(raw.prepare(`SELECT status_id FROM tasks WHERE id = 't-foreign'`).get()).toEqual({ status_id: "s-todo-B" });
  });
});

describe("GET /options — Reports' light task list", () => {
  it("lists every task of the workspace, archived ones flagged, without rollups", async () => {
    const { raw, as } = archivingWorld();
    raw.exec(`UPDATE tasks SET archived_at = '2026-02-01T00:00:00.000Z' WHERE id IN ('t-owner', 't-owner-sub')`);
    const res = await as("u-member").get("/options");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<Record<string, unknown>>;
    expect(body.map((t) => t.id).sort()).toEqual(["t-mine", "t-owner", "t-owner-sub"]);
    expect(body.find((t) => t.id === "t-owner")).toEqual({
      id: "t-owner", name: "Owner task", projectId: "p-A", parentId: null, archived: true,
    });
    expect(Object.keys(body[0]).sort()).toEqual(["archived", "id", "name", "parentId", "projectId"]);
  });
});
