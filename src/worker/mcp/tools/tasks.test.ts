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

type ToolResult = { content: { type: string; text: string }[]; isError?: boolean };
type Handler = (args: Record<string, unknown>) => Promise<ToolResult>;

/** A workspace with an admin and a member, driven through the real MCP tools and the real REST bridge. */
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
  `);
  const events: string[] = [];
  const env = {
    DB: db,
    APP_URL: "http://localhost:5173",
    TIMER_ROOM: {
      idFromName: () => "room",
      get: () => ({
        fetch: async (req: Request) => {
          events.push(((await req.json()) as { event: string }).event);
          return new Response(null, { status: 200 });
        },
      }),
    },
  } as unknown as Env;
  const pending: Promise<unknown>[] = [];
  const executionCtx = { waitUntil: (p: Promise<unknown>) => pending.push(p), passThroughOnException: () => {} } as unknown as ExecutionContext;

  const toolsFor = (userId: string, scope: "read" | "read_write" = "read_write") => {
    const tools = new Map<string, Handler>();
    const registrar = { registerTool: (name: string, _c: unknown, h: Handler) => tools.set(name, h) } as unknown as ToolRegistrar;
    registerAllTools(registrar, { env, workspaceId: "ws-A", userId, scope, executionCtx });
    return tools;
  };
  const call = async (tools: Map<string, Handler>, name: string, args: Record<string, unknown> = {}) => {
    const handler = tools.get(name);
    if (!handler) throw new Error(`tool ${name} is not registered`);
    const result = await handler(args);
    await Promise.all(pending.splice(0));
    const body = result.content[0]?.text ?? "";
    return { error: result.isError ? body : null, data: result.isError ? null : (JSON.parse(body) as Record<string, unknown>) };
  };
  const row = (id: string) =>
    raw.prepare(`SELECT active, status_id, board_order, recur_rule FROM tasks WHERE id = ?`).get(id) as {
      active: number; status_id: string; board_order: number; recur_rule: string | null;
    };
  return { raw, events, toolsFor, call, row };
}

async function closedStatusId(w: ReturnType<typeof world>, tools: Map<string, Handler>) {
  const { data } = await w.call(tools, "list_task_statuses", {});
  const list = data as unknown as { id: string; category: string }[];
  return list.find((s) => s.category === "completed")!.id;
}

describe("MCP move_task does what dragging the card on the board does", () => {
  it("closes the subtasks with their parent, records it in the history and tells open boards", async () => {
    const w = world();
    const admin = w.toolsFor("u-admin");
    const parent = (await w.call(admin, "create_task", { name: "Cutover", projectId: "p1" })).data!;
    const kid = (await w.call(admin, "create_task", { name: "Freeze", projectId: "p1", parentId: parent.id })).data!;
    const closed = await closedStatusId(w, admin);
    w.events.length = 0;

    const moved = await w.call(admin, "move_task", { taskId: parent.id, statusId: closed });

    expect(moved.error).toBeNull();
    expect(w.row(kid.id as string)).toMatchObject({ active: 0, status_id: closed });
    const history = w.raw.prepare(`SELECT kind FROM task_activity WHERE task_id = ?`).all(parent.id as string) as { kind: string }[];
    expect(history.map((h) => h.kind)).toContain("status");
    expect(w.events).toContain("tasks:changed");
  });

  it("lands the card at the end of its new column", async () => {
    const w = world();
    const admin = w.toolsFor("u-admin");
    const closed = await closedStatusId(w, admin);
    // B is created first, so only a move that appends to the new column can put it after A.
    const b = (await w.call(admin, "create_task", { name: "B", projectId: "p1" })).data!;
    const a = (await w.call(admin, "create_task", { name: "A", projectId: "p1" })).data!;
    await w.call(admin, "move_task", { taskId: a.id, statusId: closed });
    await w.call(admin, "move_task", { taskId: b.id, statusId: closed });
    expect(w.row(b.id as string).board_order).toBeGreaterThan(w.row(a.id as string).board_order);
  });

  it("schedules a repeating task's next occurrence when it is closed", async () => {
    const w = world();
    const admin = w.toolsFor("u-admin");
    const closed = await closedStatusId(w, admin);
    const weekly = (await w.call(admin, "create_task", { name: "Standup notes", projectId: "p1", recurRule: "daily", dueDate: "2026-09-24" })).data!;

    await w.call(admin, "move_task", { taskId: weekly.id, statusId: closed, completedOn: "2026-09-24" });

    const next = w.raw.prepare(`SELECT due_date, recur_rule FROM tasks WHERE name = 'Standup notes' AND id != ?`).get(weekly.id as string) as
      | { due_date: string; recur_rule: string }
      | undefined;
    expect(next).toEqual({ due_date: "2026-09-25", recur_rule: "daily" });
  });
});

describe("MCP create_task", () => {
  it("tells open boards a task arrived", async () => {
    const w = world();
    const admin = w.toolsFor("u-admin");
    await w.call(admin, "create_task", { name: "New", projectId: "p1" });
    expect(w.events).toContain("tasks:changed");
  });
});

describe("MCP task history and project statuses", () => {
  it("lists a task's history", async () => {
    const w = world();
    const admin = w.toolsFor("u-admin");
    const closed = await closedStatusId(w, admin);
    const t = (await w.call(admin, "create_task", { name: "T", projectId: "p1" })).data!;
    await w.call(admin, "move_task", { taskId: t.id, statusId: closed });
    const history = await w.call(admin, "list_task_activity", { taskId: t.id });
    expect(history.error).toBeNull();
    expect(JSON.stringify(history.data)).toContain("status");
  });

  it("gives a project its own columns for an admin, and refuses a member", async () => {
    const w = world();
    const forked = await w.call(w.toolsFor("u-admin"), "fork_task_statuses", { projectId: "p1" });
    expect(forked.error).toBeNull();
    const refused = await w.call(w.toolsFor("u-member"), "fork_task_statuses", { projectId: "p1" });
    expect(refused.error).not.toBeNull();
  });

  it("shows a read-only key none of the task write tools", () => {
    const w = world();
    const read = w.toolsFor("u-admin", "read");
    for (const name of ["create_task", "move_task", "update_task", "fork_task_statuses"]) expect(read.has(name)).toBe(false);
    expect(read.has("list_task_activity")).toBe(true);
  });
});

describe("the same tools take a list: several items, one call, one approval", () => {
  it("creates several tasks through create_task's items and reports each", async () => {
    const w = world();
    const admin = w.toolsFor("u-admin");
    const res = await w.call(admin, "create_task", {
      items: [
        { name: "One", projectId: "p1" },
        { name: "Two", projectId: "p1" },
        { name: "Nope", projectId: "missing" },
      ],
    });
    expect(res.error).toBeNull();
    expect(res.data).toMatchObject({ done: 2, failed: [{ index: 2 }] });
    const names = (w.raw.prepare(`SELECT name FROM tasks ORDER BY name`).all() as { name: string }[]).map((r) => r.name);
    expect(names).toEqual(["One", "Two"]);
  });

  it("still takes one item exactly as before, and refuses one missing a required field", async () => {
    const w = world();
    const admin = w.toolsFor("u-admin");
    const one = await w.call(admin, "create_task", { name: "Solo", projectId: "p1" });
    expect(one.data).toMatchObject({ name: "Solo" });
    const bad = await w.call(admin, "create_task", { name: "No project" });
    expect(bad.error).toContain("projectId");
  });

  it("is an error only when nothing went through", async () => {
    const w = world();
    const res = await w.call(w.toolsFor("u-admin"), "create_task", { items: [{ name: "X", projectId: "missing" }] });
    expect(res.error).toContain("None of the 1 went through");
  });

  it("moves several tasks with the board's rules for each", async () => {
    const w = world();
    const admin = w.toolsFor("u-admin");
    const closed = await closedStatusId(w, admin);
    const p = (await w.call(admin, "create_task", { name: "P", projectId: "p1" })).data!;
    const k = (await w.call(admin, "create_task", { name: "K", projectId: "p1", parentId: p.id })).data!;
    const q = (await w.call(admin, "create_task", { name: "Q", projectId: "p1" })).data!;
    const res = await w.call(admin, "move_task", { items: [{ taskId: p.id, statusId: closed }, { taskId: q.id, statusId: closed }] });
    expect(res.data).toMatchObject({ done: 2, failed: [] });
    expect(w.row(k.id as string).active).toBe(0);
  });

  it("deletes several tasks in one call", async () => {
    const w = world();
    const admin = w.toolsFor("u-admin");
    const a = (await w.call(admin, "create_task", { name: "A", projectId: "p1" })).data!;
    const b = (await w.call(admin, "create_task", { name: "B", projectId: "p1" })).data!;
    const res = await w.call(admin, "delete_task", { items: [{ taskId: a.id }, { taskId: b.id }] });
    expect(res.data).toMatchObject({ done: 2 });
    expect((w.raw.prepare(`SELECT COUNT(*) AS n FROM tasks`).get() as { n: number }).n).toBe(0);
  });

  it("logs several entries through log_time, then deletes them all in one delete_time_entry call", async () => {
    const w = world();
    const admin = w.toolsFor("u-admin");
    const logged = await w.call(admin, "log_time", {
      items: [
        { description: "Standup", start: "2026-09-24T12:00:00Z", stop: "2026-09-24T12:15:00Z", projectId: "p1" },
        { description: "Review", start: "2026-09-24T13:00:00Z", stop: "2026-09-24T14:00:00Z", projectId: "p1" },
        { description: "Backwards", start: "2026-09-24T15:00:00Z", stop: "2026-09-24T14:00:00Z", projectId: "p1" },
      ],
    });
    expect(logged.data).toMatchObject({ done: 2, failed: [{ index: 2, error: "stop must be after start." }] });
    const ids = (w.raw.prepare(`SELECT id FROM time_entries`).all() as { id: string }[]).map((r) => r.id);
    const removed = await w.call(admin, "delete_time_entry", { items: ids.map((entryId) => ({ entryId })) });
    expect(removed.error).toBeNull();
    expect((w.raw.prepare(`SELECT COUNT(*) AS n FROM time_entries`).get() as { n: number }).n).toBe(0);
  });

  it("has no duplicated batch twins in the catalog", () => {
    const tools = world().toolsFor("u-admin");
    for (const name of ["create_tasks", "move_tasks", "update_tasks", "delete_tasks", "log_times", "update_time_entries", "delete_time_entries"]) {
      expect(tools.has(name)).toBe(false);
    }
  });
});

describe("list_tasks answers 'my tasks' with every open task, as a list of links", () => {
  it("returns every open task whatever its due date, in board column order, without the completed ones", async () => {
    const w = world();
    const admin = w.toolsFor("u-admin");
    const closed = await closedStatusId(w, admin);
    await w.call(admin, "create_task", { name: "Due next month", projectId: "p1", dueDate: "2026-10-30" });
    await w.call(admin, "create_task", { name: "No date", projectId: "p1" });
    const done = (await w.call(admin, "create_task", { name: "Finished", projectId: "p1" })).data!;
    await w.call(admin, "move_task", { taskId: done.id, statusId: closed });

    const listed = (await w.call(admin, "list_tasks", {})).data as unknown as { name: string; url: string; done?: boolean }[];

    expect(listed.map((t) => t.name)).toEqual(expect.arrayContaining(["Due next month", "No date"]));
    expect(listed.map((t) => t.name)).not.toContain("Finished");
    // Each is its own item with a url, which is what the Assistant's card turns into a link.
    expect(listed.every((t) => t.url.startsWith("http://localhost:5173/tasks/"))).toBe(true);

    const withDone = (await w.call(admin, "list_tasks", { includeDone: true })).data as unknown as { name: string; done?: boolean }[];
    expect(withDone.at(-1)).toMatchObject({ name: "Finished", done: true });
  });
});

describe("get_task reads one task, not the whole workspace", () => {
  it("returns the task with its subtasks", async () => {
    const w = world();
    const admin = w.toolsFor("u-admin");
    const parent = (await w.call(admin, "create_task", { name: "Parent", projectId: "p1" })).data!;
    await w.call(admin, "create_task", { name: "Kid", projectId: "p1", parentId: parent.id });
    const got = await w.call(admin, "get_task", { taskId: parent.id });
    expect(got.data).toMatchObject({ name: "Parent", subtaskList: [{ name: "Kid" }] });
  });

  it("refuses a task from another workspace as not found, revealing nothing", async () => {
    const w = world();
    w.raw.exec(`
      INSERT INTO workspaces (id, name) VALUES ('ws-B', 'B');
      INSERT INTO clients (id, workspace_id, name) VALUES ('cl-B', 'ws-B', 'Other');
      INSERT INTO projects (id, workspace_id, name, client_id) VALUES ('pB', 'ws-B', 'Other', 'cl-B');
      INSERT INTO tasks (id, workspace_id, project_id, name) VALUES ('secret', 'ws-B', 'pB', 'Secret plan');
    `);
    const got = await w.call(w.toolsFor("u-admin"), "get_task", { taskId: "secret" });
    expect(got.error).toContain("No task with id secret");
    expect(got.error).not.toContain("Secret plan");
  });
});

describe("a task only takes a column of its own board", () => {
  async function forkedWorld() {
    const w = world();
    w.raw.exec(`INSERT INTO projects (id, workspace_id, name, client_id) VALUES ('p2', 'ws-A', 'Two', 'cl-A');`);
    const admin = w.toolsFor("u-admin");
    const forked = (await w.call(admin, "fork_task_statuses", { projectId: "p2" })).data as unknown as { id: string; category: string; sortOrder: number }[];
    const global = (await w.call(admin, "list_task_statuses", {})).data as unknown as { id: string; category: string; sortOrder: number }[];
    return { w, admin, forked, global };
  }

  it("refuses a move to another board's column, lists the valid ones, and leaves the task where it was", async () => {
    const { w, admin, forked } = await forkedWorld();
    const t = (await w.call(admin, "create_task", { name: "On the global board", projectId: "p1" })).data!;
    const before = w.row(t.id as string).status_id;
    const res = await w.call(admin, "move_task", { taskId: t.id, statusId: forked[3].id });
    expect(res.error).toContain("isn't a column on this task's board");
    expect(res.error).toContain("Its columns:");
    expect(w.row(t.id as string).status_id).toBe(before);
  });

  it("refuses to create a task in another board's column", async () => {
    const { w, admin, global } = await forkedWorld();
    const res = await w.call(admin, "create_task", { name: "Wrong column", projectId: "p2", statusId: global[0].id });
    expect(res.error).toContain("isn't a column on this task's board");
  });

  it("moves a task and its subtasks into the matching column when the task changes project", async () => {
    const { w, admin, forked, global } = await forkedWorld();
    // Columns come in board order; the fourth is the active one after the default (the MCP drops sortOrder as noise).
    const inProgress = global[3];
    const parent = (await w.call(admin, "create_task", { name: "Moves project", projectId: "p1", statusId: inProgress.id })).data!;
    const kid = (await w.call(admin, "create_task", { name: "Kid", projectId: "p1", parentId: parent.id, statusId: inProgress.id })).data!;

    await w.call(admin, "update_task", { taskId: parent.id, projectId: "p2" });

    const twin = forked[3];
    expect(w.row(parent.id as string).status_id).toBe(twin.id);
    expect(w.row(kid.id as string).status_id).toBe(twin.id);
  });

  it("refuses to archive a column into another board's column", async () => {
    const { w, admin, forked, global } = await forkedWorld();
    const qa = global[4];
    await w.call(admin, "create_task", { name: "Sits in QA", projectId: "p1", statusId: qa.id });
    const res = await w.call(admin, "archive_task_status", { statusId: qa.id, moveTo: forked[0].id });
    expect(res.error).toContain("isn't a column on this task's board");
  });
});

describe("create_task through the MCP doesn't duplicate a task made minutes ago", () => {
  it("returns the task already made instead of a second one with the same name", async () => {
    const w = world();
    const admin = w.toolsFor("u-admin");
    const first = (await w.call(admin, "create_task", { name: "Deploy tracking", projectId: "p1" })).data!;
    const again = await w.call(admin, "create_task", { name: "  deploy TRACKING ", projectId: "p1", description: "retry" });
    expect(again.data).toMatchObject({ id: first.id, alreadyExisted: true });
    expect((w.raw.prepare(`SELECT COUNT(*) AS n FROM tasks WHERE lower(name) = 'deploy tracking'`).get() as { n: number }).n).toBe(1);
  });

  it("still creates it in another project, under another parent, once the first is done, or once it's old", async () => {
    const w = world();
    const admin = w.toolsFor("u-admin");
    w.raw.exec(`INSERT INTO projects (id, workspace_id, name, client_id) VALUES ('p2', 'ws-A', 'Two', 'cl-A');`);
    const closed = await closedStatusId(w, admin);
    const first = (await w.call(admin, "create_task", { name: "Standup", projectId: "p1" })).data!;
    expect((await w.call(admin, "create_task", { name: "Standup", projectId: "p2" })).data).not.toHaveProperty("alreadyExisted");
    const parent = (await w.call(admin, "create_task", { name: "Parent", projectId: "p1" })).data!;
    expect((await w.call(admin, "create_task", { name: "Standup", projectId: "p1", parentId: parent.id })).data).not.toHaveProperty("alreadyExisted");

    await w.call(admin, "move_task", { taskId: first.id, statusId: closed });
    const afterDone = (await w.call(admin, "create_task", { name: "Standup", projectId: "p1" })).data!;
    expect(afterDone).not.toHaveProperty("alreadyExisted");

    w.raw.prepare(`UPDATE tasks SET created_at = '2020-01-01T00:00:00.000Z' WHERE id = ?`).run(afterDone.id as string);
    expect((await w.call(admin, "create_task", { name: "Standup", projectId: "p1" })).data).not.toHaveProperty("alreadyExisted");
  });

  it("dedupes repeated names inside one list of items too", async () => {
    const w = world();
    const res = await w.call(w.toolsFor("u-admin"), "create_task", {
      items: [{ name: "Twice", projectId: "p1" }, { name: "Twice", projectId: "p1" }],
    });
    expect(res.data).toMatchObject({ done: 2 });
    expect((w.raw.prepare(`SELECT COUNT(*) AS n FROM tasks WHERE name = 'Twice'`).get() as { n: number }).n).toBe(1);
  });
});
