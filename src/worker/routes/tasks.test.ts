import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { createD1Stub, type D1StubHandlers } from "../../test/d1-stub";

// tasks.ts imports lib/image.ts, which loads a real WASM module outside vitest — stub it out (same as image.test.ts).
vi.mock("@cf-wasm/photon/workerd", () => ({
  PhotonImage: class {},
  SamplingFilter: { Lanczos3: 1 },
  resize: vi.fn(),
}));

const { taskAndSubtaskIds, tasksRouter } = await import("./tasks");

function mountedApp(handlers: D1StubHandlers) {
  const { db, calls } = createD1Stub(handlers);
  const app = new Hono<{ Bindings: Env; Variables: { workspaceId: string; userId: string } }>()
    .use("*", async (c, next) => {
      c.set("workspaceId", "workspace-A");
      c.set("userId", "user-1");
      await next();
    })
    .route("/", tasksRouter);
  return { app, env: { DB: db } as unknown as Env, calls };
}

describe("taskAndSubtaskIds (P0-2)", () => {
  it("returns the task and every one of its subtasks, not just the first", async () => {
    // SQLite's `IN (a, (SELECT …))` is scalar — it only matched "P,S1" for subtasks S1/S2/S3.
    const { db, calls } = createD1Stub({
      all: () => ({ results: [{ id: "P" }, { id: "S1" }, { id: "S2" }, { id: "S3" }] }),
    });
    const ids = await taskAndSubtaskIds(db, "workspace-1", "P");
    expect(ids).toEqual(["P", "S1", "S2", "S3"]);
    expect(calls[0]?.params).toEqual(["workspace-1", "P", "P"]);
  });

  it("returns just the task itself when it has no subtasks", async () => {
    const { db } = createD1Stub({ all: () => ({ results: [{ id: "P" }] }) });
    expect(await taskAndSubtaskIds(db, "workspace-1", "P")).toEqual(["P"]);
  });
});

describe("GET / — formatTask's assignees_json (TYPE-2: typed rows, parsed via parseJsonColumn)", () => {
  const baseRow = {
    id: "task-1",
    workspace_id: "workspace-A",
    project_id: "project-1",
    project_name: "Acme",
    project_color: "#000000",
    name: "Write report",
    description: null,
    active: 1,
    status_id: "status-1",
    status_name: "To do",
    status_color: "#3b82f6",
    status_category: "not_started",
    estimated_seconds: null,
    tracked_seconds: 0,
    due_date: null,
    priority: 4,
    sort_order: 1,
    board_order: 1,
    parent_id: null,
    completed_at: null,
    recur_rule: null,
    subtask_total: 0,
    subtask_done: 0,
    created_at: "2026-01-01T00:00:00.000Z",
  };

  it("parses a well-formed assignees_json array", async () => {
    const { app, env } = mountedApp({
      first: () => ({ role: "member" }),
      all: (call) =>
        call.sql.includes("FROM tasks tk")
          ? {
              results: [
                {
                  ...baseRow,
                  assignees_json: JSON.stringify([{ userId: "u1", name: "Ana", image: null }]),
                },
              ],
            }
          : { results: [] },
    });
    const res = await app.request("/", {}, env);
    const body = (await res.json()) as Array<{ assignees: unknown }>;
    expect(body[0]?.assignees).toEqual([{ userId: "u1", name: "Ana", image: null }]);
  });

  it("reports how many comments a task has, counted by the query itself (D8)", async () => {
    const { app, env, calls } = mountedApp({
      first: () => ({ role: "member" }),
      all: (call) =>
        call.sql.includes("FROM tasks tk")
          ? { results: [{ ...baseRow, comment_count: 3, assignees_json: null }, { ...baseRow, id: "task-2", assignees_json: null }] }
          : { results: [] },
    });
    const res = await app.request("/", {}, env);
    const body = (await res.json()) as Array<{ id: string; commentCount: number }>;
    expect(body.find((t) => t.id === "task-1")?.commentCount).toBe(3);
    expect(body.find((t) => t.id === "task-2")?.commentCount).toBe(0);
    expect(calls.some((c) => c.sql.includes("FROM task_comments") && c.sql.includes("comment_count"))).toBe(true);
  });

  it("falls back to an empty list rather than throwing on malformed assignees_json", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { app, env } = mountedApp({
      first: () => ({ role: "member" }),
      all: (call) =>
        call.sql.includes("FROM tasks tk")
          ? { results: [{ ...baseRow, assignees_json: "not json" }] }
          : { results: [] },
    });
    const res = await app.request("/", {}, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ assignees: unknown }>;
    expect(body[0]?.assignees).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("falls back to an empty list when assignees_json is null (no assignees)", async () => {
    const { app, env } = mountedApp({
      first: () => ({ role: "member" }),
      all: (call) =>
        call.sql.includes("FROM tasks tk")
          ? { results: [{ ...baseRow, assignees_json: null }] }
          : { results: [] },
    });
    const res = await app.request("/", {}, env);
    const body = (await res.json()) as Array<{ assignees: unknown }>;
    expect(body[0]?.assignees).toEqual([]);
  });
});

describe("POST /:id/comments — mentions written in the text", () => {
  const commentRow = {
    id: "c1", workspace_id: "workspace-A", task_id: "task-1", user_id: "user-1", body: "",
    mentioned_user_ids: "", attachment_id: null, created_at: "2026-01-01 00:00:00", edited_at: null,
    user_name: "Author", user_email: "a@x.test", user_image: null, attachment_filename: null,
  };

  function post(body: string, memberIds: string[], extra: Record<string, unknown> = {}) {
    const inserts: { params: unknown[] }[] = [];
    const { app, env } = mountedApp({
      first: (call) => {
        if (call.sql.includes("FROM tasks WHERE id")) return { id: "task-1", name: "Write report" };
        if (call.sql.includes("FROM task_comments tc")) return { ...commentRow, body };
        return null;
      },
      all: (call) => (call.sql.includes('FROM "member"') ? { results: memberIds.map((userId) => ({ userId })) } : { results: [] }),
      run: (call) => {
        if (call.sql.includes("INSERT INTO task_comments")) inserts.push({ params: call.params });
        return { success: true };
      },
    });
    const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;
    const timerRoom = { idFromName: () => "room", get: () => ({ fetch: async () => new Response("ok") }) };
    return { inserts, request: () => app.request("/task-1/comments", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body, ...extra }),
    }, { ...env, TIMER_ROOM: timerRoom } as unknown as Env, ctx) };
  }

  it("stores the members tagged in the text, without the client sending any ids", async () => {
    const { inserts, request } = post("oi @[Ana](user:u-ana) e @[Bo](user:u-bo)", ["u-ana", "u-bo"]);
    const res = await request();
    expect(res.status).toBe(201);
    expect(inserts[0].params[5]).toBe("u-ana,u-bo");
  });

  it("drops a tag whose id is not a member of the workspace", async () => {
    const { inserts, request } = post("oi @[Eve](user:u-outsider) e @[Ana](user:u-ana)", ["u-ana"]);
    await request();
    expect(inserts[0].params[5]).toBe("u-ana");
  });

  it("still honours the ids a client sends (the MCP tool), next to the ones in the text", async () => {
    const { inserts, request } = post("oi @[Ana](user:u-ana)", ["u-ana", "u-bo"], { mentionedUserIds: ["u-bo"] });
    await request();
    expect(String(inserts[0].params[5]).split(",").sort()).toEqual(["u-ana", "u-bo"]);
  });
});

describe("PUT /:id — people tagged in the description", () => {
  const taskRow = (description: string | null) => ({
    id: "task-1", workspace_id: "workspace-A", project_id: "project-1", name: "Write report", description,
    active: 1, status_id: "s1", due_date: null, priority: 4, parent_id: null, recur_rule: null,
    estimated_seconds: null, completed_at: null, subtask_total: 0,
  });
  const joinRow = {
    ...taskRow(null), project_name: "Acme", project_color: "#000000", status_name: "To do", status_color: "#3b82f6",
    status_category: "not_started", tracked_seconds: 0, sort_order: 1, board_order: 1, subtask_done: 0,
    created_at: "2026-01-01T00:00:00.000Z", assignees_json: "[]",
  };
  const doc = (...ids: string[]) =>
    JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: ids.map((id) => ({ type: "mention", attrs: { id, label: id } })) }] });

  function put(before: string | null, after: string) {
    const notified: unknown[][] = [];
    const pending: Promise<unknown>[] = [];
    const { app, env } = mountedApp({
      first: (call) => {
        if (call.sql.includes("SELECT * FROM tasks WHERE id")) return taskRow(before);
        if (call.sql.includes('FROM "member"') && call.sql.includes("role")) return { role: "owner" };
        if (call.sql.includes('FROM "user"')) return { name: "Author", email: "a@x.test" };
        return null;
      },
      all: (call) => {
        if (call.sql.includes('DISTINCT userId FROM "member"')) return { results: call.params.slice(1).map((userId) => ({ userId })) };
        if (call.sql.includes("FROM tasks tk")) return { results: [joinRow] };
        return { results: [] };
      },
      run: (call) => {
        if (call.sql.includes("INSERT INTO notifications")) notified.push(call.params);
        return { success: true };
      },
    });
    const ctx = { waitUntil: (p: Promise<unknown>) => pending.push(p), passThroughOnException: () => {} } as unknown as ExecutionContext;
    const timerRoom = { idFromName: () => "room", get: () => ({ fetch: async () => new Response("ok") }) };
    const notifyRoom = { idFromName: () => "n", get: () => ({ fetch: async () => new Response("ok") }) };
    return {
      notified,
      run: async () => {
        const res = await app.request("/task-1", {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ description: after }),
        }, { ...env, TIMER_ROOM: timerRoom, NOTIFICATION_ROOM: notifyRoom } as unknown as Env, ctx);
        await Promise.all(pending);
        return res;
      },
    };
  }

  it("notifies a person newly tagged, with a link to the task", async () => {
    const t = put(null, doc("u-ana"));
    const res = await t.run();
    expect(res.status).toBe(200);
    expect(t.notified).toHaveLength(1);
    expect(t.notified[0]).toContain("u-ana");
    expect(JSON.stringify(t.notified[0])).toContain("/tasks/task-1");
  });

  it("does not notify someone who was already tagged, nor the author", async () => {
    const t = put(doc("u-ana"), doc("u-ana", "user-1", "u-bo"));
    await t.run();
    expect(t.notified).toHaveLength(1);
    expect(t.notified[0]).toContain("u-bo");
  });

  it("notifies nobody when the description has no tags", async () => {
    const t = put(null, JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] }));
    await t.run();
    expect(t.notified).toHaveLength(0);
  });
});
