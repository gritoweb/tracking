import type { Notification } from "@shared/schemas";
import { currentMemberIds } from "./permissions";

type Row = Record<string, unknown>;

export function formatNotification(row: Row): Notification {
  return {
    id: row.id as string,
    type: row.type as string,
    title: row.title as string,
    body: row.body as string,
    link: (row.link as string | null) ?? null,
    isRead: Boolean(row.is_read),
    createdAt: row.created_at as string,
  };
}

/** Pushes a notification live to a user's own NotificationRoom — separate DO from the workspace's TimerRoom. */
async function pushLive(env: Env, userId: string, notification: Notification): Promise<void> {
  try {
    const id = env.NOTIFICATION_ROOM.idFromName(userId);
    const stub = env.NOTIFICATION_ROOM.get(id);
    const res = await stub.fetch(
      new Request("http://do/notify", {
        method: "POST",
        body: JSON.stringify({ event: "notification:new", data: notification }),
        headers: { "Content-Type": "application/json" },
      })
    );
    // `sent: 0` means no open socket for this user right now — the bell's poll still catches it,
    // but this is the fastest way to tell "nobody was connected" apart from "the push itself broke".
    const { sent } = (await res.json()) as { sent: number };
    console.log("notification pushed live", { userId, type: notification.type, sent });
  } catch (e) {
    // Non-critical — the bell's own poll is the backstop — but must be visible in Workers Logs.
    console.warn("notification push failed", { userId, error: String(e) });
  }
}

/** The name every notification's title quotes as the actor — falls back to email, then "Someone". */
export async function actorDisplayName(db: D1Database, userId: string): Promise<string> {
  const row = await db.prepare(`SELECT name, email FROM "user" WHERE id = ?`).bind(userId).first<Row>();
  return (row?.name as string) || (row?.email as string) || "Someone";
}

export interface NotificationTemplate {
  type: string;
  title: string;
  body: string;
  link?: string | null;
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
    .bind(id, workspaceId, userId, template.type, template.title, template.body, template.link ?? null)
    .run();

  const row = await env.DB.prepare(`SELECT * FROM notifications WHERE id = ?`).bind(id).first<Row>();
  if (row) await pushLive(env, userId, formatNotification(row));
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
        link: `/tasks/${taskId}`,
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
        link: `/tasks/${taskId}`,
      })
    )
  );
}
