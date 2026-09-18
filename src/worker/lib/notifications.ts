import type { Notification } from "@shared/schemas";
import type { NotificationRow } from "../db/rows";
import { currentMemberIds } from "./permissions";
import { taskPath } from "@shared/task-links";
import { sqliteUtcToIso } from "./sqlite-time";

export function formatNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    link: row.link ?? null,
    isRead: Boolean(row.is_read),
    createdAt: sqliteUtcToIso(row.created_at),
  };
}

/** Pushes a notification live to a user's own NotificationRoom — separate DO from the workspace's TimerRoom. */
async function pushLive(env: Env, userId: string, notification: Notification): Promise<void> {
  try {
    const id = env.NOTIFICATION_ROOM.idFromName(userId);
    const stub = env.NOTIFICATION_ROOM.get(id);
    await stub.fetch(
      new Request("http://do/notify", {
        method: "POST",
        body: JSON.stringify({ event: "notification:new", data: notification }),
        headers: { "Content-Type": "application/json" },
      })
    );
  } catch (e) {
    // Non-critical — the bell's own poll is the backstop — but must be visible in Workers Logs.
    console.warn("notification push failed", { userId, error: String(e) });
  }
}

/** The name every notification's title quotes as the actor — falls back to email, then "Someone". */
export async function actorDisplayName(db: D1Database, userId: string): Promise<string> {
  const row = await db
    .prepare(`SELECT name, email FROM "user" WHERE id = ?`)
    .bind(userId)
    .first<{ name: string | null; email: string | null }>();
  return row?.name || row?.email || "Someone";
}

export interface NotificationTemplate {
  type: string;
  title: string;
  body: string;
  link?: string | null;
}

const NOTIFICATION_BODY_MAX = 140;

/** A notification is a pointer to the real content, never a copy of it — truncated so an edited/deleted source can't leave a stale full copy behind. */
export function notificationExcerpt(text: string, max = NOTIFICATION_BODY_MAX): string {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

/** Writes the row and pushes it live in one call — every notification goes through this. */
export async function notifyUser(
  env: Env,
  workspaceId: string,
  userId: string,
  template: NotificationTemplate
): Promise<void> {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO notifications (id, workspace_id, user_id, type, title, body, link)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(id, workspaceId, userId, template.type, template.title, notificationExcerpt(template.body), template.link ?? null)
    .run();

  const row = await env.DB.prepare(`SELECT * FROM notifications WHERE id = ?`).bind(id).first<NotificationRow>();
  if (row) await pushLive(env, userId, formatNotification(row));
}

const NOTIFICATION_RETENTION_DAYS = 90;

/** Daily cron sweep — a notification is a pointer to content, not a permanent record. */
export async function pruneNotifications(env: Env): Promise<void> {
  try {
    await env.DB.prepare(`DELETE FROM notifications WHERE created_at < datetime('now', ?)`)
      .bind(`-${NOTIFICATION_RETENTION_DAYS} days`)
      .run();
  } catch (e) {
    console.warn("notification retention sweep failed", { error: String(e) });
  }
}

/**
 * A mention only notifies users who are still members of this workspace right now — fail closed:
 * any doubt about current membership means nobody gets notified, not everybody.
 */
export async function notifyMentions(
  env: Env,
  workspaceId: string,
  mentionedUserIds: string[],
  template: NotificationTemplate
): Promise<void> {
  const targets = await currentMemberIds(env.DB, workspaceId, mentionedUserIds);
  await Promise.all(targets.map((userId) => notifyUser(env, workspaceId, userId, template)));
}

/** Being added as an assignee notifies you — on creation or later — except when you added yourself. */
export async function notifyNewAssignees(
  env: Env,
  workspaceId: string,
  taskId: string,
  taskName: string,
  actorId: string,
  actorName: string,
  newAssigneeIds: string[]
): Promise<void> {
  const candidates = newAssigneeIds.filter((id) => id !== actorId);
  const targets = await currentMemberIds(env.DB, workspaceId, candidates);
  await Promise.all(
    targets.map((userId) =>
      notifyUser(env, workspaceId, userId, {
        type: "task_assigned",
        title: `${actorName} assigned you "${taskName}"`,
        body: "You're now responsible for this task",
        link: taskPath(taskId),
      })
    )
  );
}

/** Every assignee of a task hears when its status moves — except whoever moved it. */
export async function notifyAssigneesOfStatusChange(
  env: Env,
  workspaceId: string,
  taskId: string,
  taskName: string,
  actorId: string,
  actorName: string,
  statusName: string
): Promise<void> {
  const { results } = await env.DB.prepare(
    `SELECT ta.user_id AS userId FROM task_assignees ta
       JOIN "member" m ON m.organizationId = ? AND m.userId = ta.user_id
      WHERE ta.task_id = ?`
  )
    .bind(workspaceId, taskId)
    .all<{ userId: string }>();

  const targets = results.filter((r) => r.userId !== actorId);
  await Promise.all(
    targets.map((r) =>
      notifyUser(env, workspaceId, r.userId, {
        type: "task_status_changed",
        title: `${actorName} moved "${taskName}"`,
        body: `Now in ${statusName}`,
        link: taskPath(taskId),
      })
    )
  );
}
