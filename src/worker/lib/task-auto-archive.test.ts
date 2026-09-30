import { describe, expect, it } from "vitest";
import { createMigratedD1 } from "../../test/sqlite-d1";
import { AUTO_ARCHIVE_BATCH, runTaskAutoArchive } from "./task-auto-archive";

const NOW = new Date("2026-09-30T12:02:00.000Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000).toISOString();

function world() {
  const { db, raw } = createMigratedD1();
  raw.exec(`
    INSERT INTO workspaces (id, name) VALUES ('ws-A', 'A');
    INSERT INTO clients (id, workspace_id, name) VALUES ('cl-A', 'ws-A', 'Client');
    INSERT INTO projects (id, workspace_id, name, client_id) VALUES ('p-A', 'ws-A', 'Project', 'cl-A');
  `);
  const broadcasts: string[] = [];
  const room = { idFromName: (n: string) => n, get: (n: string) => ({ fetch: async () => (broadcasts.push(n), new Response("ok")) }) };
  const env = { DB: db, TIMER_ROOM: room } as unknown as Env;
  const task = (id: string, completedAt: string | null, extra: { parent?: string; unarchivedAt?: string } = {}) =>
    raw
      .prepare(
        `INSERT INTO tasks (id, workspace_id, project_id, name, active, completed_at, parent_id, unarchived_at) VALUES (?, 'ws-A', 'p-A', ?, ?, ?, ?, ?)`
      )
      .run(id, id, completedAt ? 0 : 1, completedAt, extra.parent ?? null, extra.unarchivedAt ?? null);
  const archived = (id: string) => Boolean((raw.prepare(`SELECT archived_at FROM tasks WHERE id = ?`).get(id) as { archived_at: string | null }).archived_at);
  return { raw, env, task, archived, broadcasts };
}

describe("runTaskAutoArchive", () => {
  it("archives a task completed more than 72h ago with its subtasks, not one completed sooner or still open", async () => {
    const w = world();
    w.task("old", hoursAgo(73));
    w.task("old-sub", null, { parent: "old" });
    w.task("recent", hoursAgo(71));
    w.task("open", null);
    await runTaskAutoArchive(w.env, NOW);
    expect([w.archived("old"), w.archived("old-sub"), w.archived("recent"), w.archived("open")]).toEqual([true, true, false, false]);
    expect(w.raw.prepare(`SELECT task_id, user_id, kind FROM task_activity`).all()).toEqual([{ task_id: "old", user_id: null, kind: "archived" }]);
    expect(w.broadcasts).toHaveLength(1);
  });

  it("never archives a completed subtask on its own while its parent is open", async () => {
    const w = world();
    w.task("parent", null);
    w.task("done-sub", hoursAgo(100), { parent: "parent" });
    await runTaskAutoArchive(w.env, NOW);
    expect(w.archived("done-sub")).toBe(false);
  });

  it("leaves alone a task someone unarchived after it was completed, until it is completed again", async () => {
    const w = world();
    w.task("kept", hoursAgo(100), { unarchivedAt: hoursAgo(80) });
    w.task("recompleted", hoursAgo(90), { unarchivedAt: hoursAgo(95) });
    await runTaskAutoArchive(w.env, NOW);
    expect(w.archived("kept")).toBe(false);
    expect(w.archived("recompleted")).toBe(true);
  });

  it("runs only on the first tick of each hour", async () => {
    const w = world();
    w.task("old", hoursAgo(100));
    await runTaskAutoArchive(w.env, new Date("2026-09-30T12:05:00.000Z"));
    expect(w.archived("old")).toBe(false);
  });

  it("archives at most one batch per sweep", async () => {
    const w = world();
    for (let i = 0; i < AUTO_ARCHIVE_BATCH + 3; i++) w.task(`t${i}`, hoursAgo(100));
    await runTaskAutoArchive(w.env, NOW);
    const n = (w.raw.prepare(`SELECT COUNT(*) AS n FROM tasks WHERE archived_at IS NOT NULL`).get() as { n: number }).n;
    expect(n).toBe(AUTO_ARCHIVE_BATCH);
  });
});
