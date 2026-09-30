import type { TaskActivity, TaskActivityKind } from "@shared/schemas";
import { sqliteUtcToIso } from "./sqlite-time";

interface ActivityRow {
  id: string;
  task_id: string;
  user_id: string | null;
  kind: TaskActivityKind;
  from_value: string | null;
  to_value: string | null;
  created_at: string;
  user_name: string | null;
  user_email: string | null;
  user_image: string | null;
}

export function formatActivity(row: ActivityRow): TaskActivity {
  return {
    id: row.id,
    taskId: row.task_id,
    userId: row.user_id,
    userName: row.user_name || row.user_email || "Someone",
    userImage: row.user_image ?? null,
    kind: row.kind,
    from: row.from_value,
    to: row.to_value,
    createdAt: sqliteUtcToIso(row.created_at),
  };
}

export async function listActivity(db: D1Database, workspaceId: string, taskId: string): Promise<TaskActivity[]> {
  const { results } = await db
    .prepare(
      `SELECT a.*, u.name AS user_name, u.email AS user_email, u.image AS user_image
         FROM task_activity a
         LEFT JOIN "user" u ON u.id = a.user_id
        WHERE a.task_id = ? AND a.workspace_id = ? ORDER BY a.created_at ASC, a.rowid ASC`
    )
    .bind(taskId, workspaceId)
    .all<ActivityRow>();
  return results.map(formatActivity);
}

export interface ActivityInput {
  kind: TaskActivityKind;
  from: string | null;
  to: string | null;
}

/** Writes every change of one edit in a single batch. The history is a nicety: a failure is logged and never blocks the edit itself. */
export async function recordActivity(
  db: D1Database,
  workspaceId: string,
  taskId: string,
  userId: string,
  changes: ActivityInput[]
): Promise<void> {
  if (!changes.length) return;
  try {
    await db.batch(
      changes.map((c) =>
        db
          .prepare(
            `INSERT INTO task_activity (workspace_id, task_id, user_id, kind, from_value, to_value) VALUES (?, ?, ?, ?, ?, ?)`
          )
          .bind(workspaceId, taskId, userId, c.kind, c.from, c.to)
      )
    );
  } catch (error) {
    console.error("task activity not recorded", error);
  }
}

/** A status id as the name to store; null when the task had none. */
export async function statusName(db: D1Database, workspaceId: string, statusId: string | null): Promise<string | null> {
  if (!statusId) return null;
  const row = await db
    .prepare(`SELECT name FROM task_statuses WHERE id = ? AND workspace_id = ?`)
    .bind(statusId, workspaceId)
    .first<{ name: string }>();
  return row?.name ?? null;
}

/** Member display names for a set of user ids, for the "added/removed" line. */
export async function memberNames(db: D1Database, userIds: string[]): Promise<string[]> {
  if (!userIds.length) return [];
  const { results } = await db
    .prepare(`SELECT COALESCE(NULLIF(name, ''), email) AS name FROM "user" WHERE id IN (${userIds.map(() => "?").join(",")})`)
    .bind(...userIds)
    .all<{ name: string }>();
  return results.map((r) => r.name);
}
