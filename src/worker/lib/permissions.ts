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
