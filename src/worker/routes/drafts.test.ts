import { describe, expect, it } from "vitest";
import { createMigratedD1 } from "../../test/sqlite-d1";
import { routeClient } from "../../test/route-harness";
import { draftsRouter } from "./drafts";

const at = (time: string) => `2026-01-05T${time}.000Z`;

function world() {
  const { db, raw } = createMigratedD1();
  raw.exec(`
    INSERT INTO workspaces (id, name) VALUES ('ws-A', 'A'), ('ws-B', 'B');
    INSERT INTO clients (id, workspace_id, name) VALUES ('cl-B', 'ws-B', 'Client B');
    INSERT INTO projects (id, workspace_id, name, client_id, active) VALUES ('p-B', 'ws-B', 'Elsewhere', 'cl-B', 1);

    INSERT INTO "user" (id, name, email, createdAt, updatedAt) VALUES
      ('u-ana', 'ana', 'ana@x.test', '2026-01-01 00:00:00', '2026-01-01 00:00:00'),
      ('u-bo', 'bo', 'bo@x.test', '2026-01-01 00:00:00', '2026-01-01 00:00:00');
    INSERT INTO clients (id, workspace_id, name) VALUES ('cl-A', 'ws-A', 'Client A');
    INSERT INTO projects (id, workspace_id, name, client_id, active) VALUES ('p1', 'ws-A', 'One', 'cl-A', 1);
    INSERT INTO tasks (id, workspace_id, project_id, name) VALUES ('t-A', 'ws-A', 'p1', 'Task A'), ('t-B', 'ws-B', 'p-B', 'Task B');
    INSERT INTO draft_entries (id, workspace_id, user_id, local_date, project_id, description, start, stop, duration, billable, source)
      VALUES ('d1', 'ws-A', 'u-ana', '2026-01-05', 'p1', 'first', '${at("09:00:00")}', '${at("10:00:00")}', 3600, 1, 'gap'),
             ('d2', 'ws-A', 'u-ana', '2026-01-05', 'p1', 'second', '${at("11:00:00")}', '${at("12:00:00")}', 3600, 1, 'gap');
  `);
  const as = (userId: string) => routeClient(draftsRouter, db, { workspaceId: "ws-A", userId });
  const entries = () => raw.prepare(`SELECT description, duration FROM time_entries ORDER BY start`).all() as { description: string; duration: number }[];
  const taskIdOf = (table: "time_entries" | "draft_entries", description: string) =>
    (raw.prepare(`SELECT task_id FROM ${table} WHERE description = ?`).get(description) as { task_id: string | null } | undefined)?.task_id;
  const drafts = () => (raw.prepare(`SELECT COUNT(*) AS n FROM draft_entries`).get() as { n: number }).n;
  return { as, entries, drafts, raw, taskIdOf };
}

describe("POST /confirm — a draft becomes exactly one entry", () => {
  it("confirms drafts into entries and consumes them", async () => {
    const { as, entries, drafts } = world();
    const res = await as("u-ana").post("/confirm", { ids: ["d1", "d2"] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ confirmed: 2, totalSeconds: 7200 });
    expect(entries()).toHaveLength(2);
    expect(drafts()).toBe(0);
  });

  it("creates one entry when two confirmations of the same draft race", async () => {
    const { as, entries } = world();
    const call = () => as("u-ana").post("/confirm", { ids: ["d1"] });
    const [a, b] = await Promise.all([call(), call()]);
    expect(entries()).toHaveLength(1);
    expect([a.status, b.status].sort()).toEqual([200, 404]);
    const winner = a.status === 200 ? a : b;
    expect(await winner.json()).toEqual({ confirmed: 1, totalSeconds: 3600 });
  });

  it("keeps the scaled durations when the whole batch races twice", async () => {
    const { as, entries } = world();
    const call = () => as("u-ana").post("/confirm", { ids: ["d1", "d2"], reportedTotalSeconds: 3600 });
    await Promise.all([call(), call()]);
    expect(entries().map((e) => e.duration)).toEqual([1800, 1800]);
  });

  it("does not confirm another person's draft", async () => {
    const { as, entries, drafts } = world();
    expect((await as("u-bo").post("/confirm", { ids: ["d1"] })).status).toBe(404);
    expect(entries()).toHaveLength(0);
    expect(drafts()).toBe(2);
  });
});

describe("a draft's task must belong to the workspace (S-19)", () => {
  it("PATCH refuses another workspace's task and leaves the draft as it was", async () => {
    const { as, taskIdOf } = world();
    expect((await as("u-ana").patch("/d1", { taskId: "t-B" })).status).toBe(400);
    expect((await as("u-ana").patch("/d1", { taskId: "no-such-task" })).status).toBe(400);
    expect(taskIdOf("draft_entries", "first")).toBeNull();
  });

  it("PATCH still accepts this workspace's task and a null one", async () => {
    const { as, taskIdOf } = world();
    expect((await as("u-ana").patch("/d1", { taskId: "t-A" })).status).toBe(200);
    expect(taskIdOf("draft_entries", "first")).toBe("t-A");
    expect((await as("u-ana").patch("/d1", { taskId: null })).status).toBe(200);
    expect(taskIdOf("draft_entries", "first")).toBeNull();
  });

  it("confirm does not copy a foreign task id from a forged draft into the entry", async () => {
    const { as, raw, taskIdOf } = world();
    raw.exec(`UPDATE draft_entries SET task_id = 't-B' WHERE id = 'd1'; UPDATE draft_entries SET task_id = 't-A' WHERE id = 'd2'`);
    expect((await as("u-ana").post("/confirm", { ids: ["d1", "d2"] })).status).toBe(200);
    expect(taskIdOf("time_entries", "first")).toBeNull();
    expect(taskIdOf("time_entries", "second")).toBe("t-A");
  });
});
