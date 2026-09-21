import { describe, expect, it } from "vitest";
import { removeMemberFromTasks } from "./task-assignees";
import { createD1Stub } from "../../test/d1-stub";
import { createMigratedD1 } from "../../test/sqlite-d1";

describe("removeMemberFromTasks (P0-4: notifications don't outlive membership)", () => {
  it("deletes the user's notifications for this workspace alongside their task assignments", async () => {
    const { db, calls } = createD1Stub({ run: () => ({ meta: { changes: 2 } }) });
    const env = { DB: db } as unknown as Env;

    await removeMemberFromTasks(env, "workspace-1", "user-1");

    const notificationDelete = calls.find((c) => c.sql.includes("DELETE FROM notifications"));
    expect(notificationDelete?.params).toEqual(["workspace-1", "user-1"]);
  });

  it("still deletes notifications for a user who had no task assignments left", async () => {
    // A mention alone can create a notification without ever assigning the task.
    const { db, calls } = createD1Stub({ run: () => ({ meta: { changes: 0 } }) });
    const env = { DB: db } as unknown as Env;

    await removeMemberFromTasks(env, "workspace-1", "user-1");

    expect(calls.some((c) => c.sql.includes("DELETE FROM notifications"))).toBe(true);
  });
});

describe("removeMemberFromTasks against the real schema (D6)", () => {
  function workspaceWithTwoMembers() {
    const { db, raw } = createMigratedD1();
    const timerRoom = { idFromName: () => "room", get: () => ({ fetch: async () => new Response("ok") }) };
    const env = { DB: db, TIMER_ROOM: timerRoom } as unknown as Env;
    const now = "2026-01-01 00:00:00";
    raw.exec(`
      INSERT INTO workspaces (id, name) VALUES ('ws-A', 'A');
      INSERT INTO workspaces (id, name) VALUES ('ws-B', 'B');
      INSERT INTO "user" (id, name, email, createdAt, updatedAt) VALUES ('u-ana', 'Ana', 'ana@x.test', '${now}', '${now}');
      INSERT INTO "user" (id, name, email, createdAt, updatedAt) VALUES ('u-bo', 'Bo', 'bo@x.test', '${now}', '${now}');
      INSERT INTO "member" (id, organizationId, userId, role, createdAt) VALUES ('m1', 'ws-A', 'u-ana', 'member', '${now}');
      INSERT INTO "member" (id, organizationId, userId, role, createdAt) VALUES ('m2', 'ws-A', 'u-bo', 'member', '${now}');
      INSERT INTO clients (id, workspace_id, name) VALUES ('cl-A', 'ws-A', 'Client');
      INSERT INTO projects (id, workspace_id, name, client_id) VALUES ('p-A', 'ws-A', 'Project', 'cl-A');
      INSERT INTO tasks (id, workspace_id, project_id, name) VALUES ('t1', 'ws-A', 'p-A', 'One');
      INSERT INTO tasks (id, workspace_id, project_id, name) VALUES ('t2', 'ws-A', 'p-A', 'Two');
      INSERT INTO task_assignees (task_id, user_id, workspace_id) VALUES ('t1', 'u-ana', 'ws-A');
      INSERT INTO task_assignees (task_id, user_id, workspace_id) VALUES ('t2', 'u-ana', 'ws-A');
      INSERT INTO task_assignees (task_id, user_id, workspace_id) VALUES ('t2', 'u-bo', 'ws-A');
      INSERT INTO notifications (id, workspace_id, user_id, type, title, body) VALUES ('n-ana', 'ws-A', 'u-ana', 'task_mention', 't', 'b');
      INSERT INTO notifications (id, workspace_id, user_id, type, title, body) VALUES ('n-bo', 'ws-A', 'u-bo', 'task_mention', 't', 'b');
    `);
    const assignees = () =>
      (raw.prepare(`SELECT task_id, user_id FROM task_assignees ORDER BY task_id, user_id`).all() as { task_id: string; user_id: string }[])
        .map((r) => `${r.task_id}:${r.user_id}`);
    return { env, raw, assignees };
  }

  it("takes the person off every task they were on, and leaves the others alone", async () => {
    const { env, assignees } = workspaceWithTwoMembers();
    expect(assignees()).toEqual(["t1:u-ana", "t2:u-ana", "t2:u-bo"]);
    await removeMemberFromTasks(env, "ws-A", "u-ana");
    expect(assignees()).toEqual(["t2:u-bo"]);
  });

  it("drops their notifications in that workspace only", async () => {
    const { env, raw } = workspaceWithTwoMembers();
    await removeMemberFromTasks(env, "ws-A", "u-ana");
    const left = (raw.prepare(`SELECT id FROM notifications ORDER BY id`).all() as { id: string }[]).map((r) => r.id);
    expect(left).toEqual(["n-bo"]);
  });

  it("does not touch the same person's assignments in another workspace", async () => {
    const { env, raw, assignees } = workspaceWithTwoMembers();
    raw.exec(`
      INSERT INTO projects (id, workspace_id, name, client_id) VALUES ('p-B', 'ws-B', 'Other', NULL);
      INSERT INTO tasks (id, workspace_id, project_id, name) VALUES ('t9', 'ws-B', 'p-B', 'Elsewhere');
      INSERT INTO task_assignees (task_id, user_id, workspace_id) VALUES ('t9', 'u-ana', 'ws-B');
    `);
    await removeMemberFromTasks(env, "ws-A", "u-ana");
    expect(assignees()).toEqual(["t2:u-bo", "t9:u-ana"]);
  });

  it("keeps their tracked hours", async () => {
    const { env, raw } = workspaceWithTwoMembers();
    raw.exec(`INSERT INTO time_entries (id, workspace_id, start, user_id, project_id) VALUES ('e1', 'ws-A', '2026-01-01T09:00:00Z', 'u-ana', 'p-A')`);
    await removeMemberFromTasks(env, "ws-A", "u-ana");
    expect((raw.prepare(`SELECT COUNT(*) AS n FROM time_entries WHERE user_id = 'u-ana'`).get() as { n: number }).n).toBe(1);
  });
});
