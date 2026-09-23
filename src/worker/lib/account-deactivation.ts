// "Deleting" an account deactivates it: the user row stays, so no FK cascade ever reaches tracked time (docs/ARCHITECTURE.md).

/** Marks a ban as a self/admin deactivation rather than a moderation ban, so an invitation may lift it. */
export const DEACTIVATED_REASON = "Account deactivated";

/** Workspaces the user is the only owner of; deactivating them would leave the workspace ownerless. */
export async function soleOwnedWorkspaces(db: D1Database, userId: string): Promise<string[]> {
  const { results } = await db
    .prepare(
      `SELECT w.name FROM "member" m
       JOIN workspaces w ON w.id = m.organizationId
       WHERE m.userId = ? AND (',' || replace(m.role, ' ', '') || ',') LIKE '%,owner,%'
         AND NOT EXISTS (
           SELECT 1 FROM "member" o
           WHERE o.organizationId = m.organizationId AND o.id <> m.id
             AND (',' || replace(o.role, ' ', '') || ',') LIKE '%,owner,%'
         )`
    )
    .bind(userId)
    .all<{ name: string }>();
  return results.map((r) => r.name);
}

/** Bans the account, signs it out everywhere and takes it out of every workspace; deletes no record the workspace owns. */
export async function deactivateAccount(db: D1Database, userId: string): Promise<void> {
  const now = new Date().toISOString();
  await db.batch([
    db
      .prepare(`UPDATE "user" SET banned = 1, banReason = ?, banExpires = NULL, digest_daily = 0, digest_weekly = 0, updatedAt = ? WHERE id = ?`)
      .bind(DEACTIVATED_REASON, now, userId),
    // The crons would otherwise keep writing entries for someone who left.
    db.prepare(`UPDATE recurring_entries SET active = 0 WHERE user_id = ?`).bind(userId),
    db.prepare(`UPDATE integrations SET auto_track = 0 WHERE user_id = ?`).bind(userId),
    db.prepare(`DELETE FROM "member" WHERE userId = ?`).bind(userId),
    db.prepare(`DELETE FROM session WHERE userId = ?`).bind(userId),
  ]);
}

/** Lifts a deactivation (never a moderation ban) when the person is invited back; true if it did. */
export async function reactivateIfDeactivated(db: D1Database, email: string): Promise<boolean> {
  const { meta } = await db
    .prepare(`UPDATE "user" SET banned = 0, banReason = NULL, banExpires = NULL, updatedAt = ? WHERE lower(email) = lower(?) AND banned = 1 AND banReason = ?`)
    .bind(new Date().toISOString(), email, DEACTIVATED_REASON)
    .run();
  return (meta?.changes ?? 0) > 0;
}
