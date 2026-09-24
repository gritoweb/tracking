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
