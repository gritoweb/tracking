export type WorkspaceRole = "owner" | "admin" | "member";

export async function getMemberRole(
  db: D1Database,
  workspaceId: string,
  userId: string
): Promise<WorkspaceRole | null> {
  const row = await db
    .prepare(`SELECT role FROM "member" WHERE organizationId = ? AND userId = ?`)
    .bind(workspaceId, userId)
    .first<{ role: string }>();
  return (row?.role as WorkspaceRole | undefined) ?? null;
}

/** Owner and admin manage everyone's data; a plain member only their own. */
export function canManageWorkspace(role: WorkspaceRole | null): boolean {
  return role === "owner" || role === "admin";
}

/**
 * Whether `requestingUserId` may edit/delete a time entry logged by
 * `entryUserId`. `entryUserId === null` means no single person is recorded as
 * having logged it — a row from before this column existed, or materialized
 * by a cron job (recurring templates, calendar auto-track) rather than a
 * person — so it stays editable by anyone in the workspace, same as before
 * this restriction existed.
 */
export function canEditEntry(
  role: WorkspaceRole | null,
  entryUserId: string | null,
  requestingUserId: string
): boolean {
  if (canManageWorkspace(role)) return true;
  if (entryUserId === null) return true;
  return entryUserId === requestingUserId;
}

/** A running entry is its owner's live timer: nobody else may stop, edit or delete it, managers included. */
export function canWriteEntry(
  role: WorkspaceRole | null,
  entry: { user_id: string | null; stop: string | null },
  requestingUserId: string
): boolean {
  if (entry.stop === null) return entry.user_id === requestingUserId;
  return canEditEntry(role, entry.user_id, requestingUserId);
}

/** Whose hours a read may cover: null (whole workspace) for owner/admin, the caller's own id for a member. */
export function entryScopeUserId(role: WorkspaceRole | null, userId: string): string | null {
  return canManageWorkspace(role) ? null : userId;
}

/** Unlike `canEditEntry`, a missing author falls back to manager-only — the column is new and nothing backfills it. */
export function canDeleteTask(
  role: WorkspaceRole | null,
  createdBy: string | null,
  requestingUserId: string
): boolean {
  if (canManageWorkspace(role)) return true;
  return createdBy !== null && createdBy === requestingUserId;
}

/** Same author-or-manager rule as `canDeleteTask`, for a single attachment's uploader. */
export function canDeleteAttachment(
  role: WorkspaceRole | null,
  uploaderId: string | null,
  requestingUserId: string
): boolean {
  if (canManageWorkspace(role)) return true;
  return uploaderId !== null && uploaderId === requestingUserId;
}

/** Same author-or-manager rule as `canDeleteAttachment`, for a comment's author. */
export function canDeleteComment(
  role: WorkspaceRole | null,
  authorId: string | null,
  requestingUserId: string
): boolean {
  return canDeleteAttachment(role, authorId, requestingUserId);
}

export async function isManager(db: D1Database, workspaceId: string, userId: string): Promise<boolean> {
  return canManageWorkspace(await getMemberRole(db, workspaceId, userId));
}

/** Drops any id that isn't currently a member (D6) — an assignee/mention is never trusted from the client. */
export async function currentMemberIds(db: D1Database, workspaceId: string, ids: string[]): Promise<string[]> {
  const unique = [...new Set(ids)];
  if (!unique.length) return [];
  const { results } = await db
    .prepare(`SELECT DISTINCT userId FROM "member" WHERE organizationId = ? AND userId IN (${unique.map(() => "?").join(",")})`)
    .bind(workspaceId, ...unique)
    .all<{ userId: string }>();
  return results.map((r) => r.userId);
}

export const MANAGER_ONLY_ERROR = "Only workspace owners and admins can do this";
