import { broadcast } from "../db/queries";
import { chunked, placeholdersFor } from "./sql-chunks";

/** A task that stayed in a completed column this long leaves the board by itself. */
export const AUTO_ARCHIVE_AFTER_MS = 72 * 60 * 60 * 1000;
/** Per sweep, so a first run over a large backlog stays a small write; the rest goes next hour. */
export const AUTO_ARCHIVE_BATCH = 500;

/** Hourly: archives top-level tasks completed 72h+ ago (with subtasks), skipping any unarchived since; see CHANGELOG 2026-09-30. */
export async function runTaskAutoArchive(env: Env, now = new Date()): Promise<void> {
  if (now.getUTCMinutes() >= 5) return;
  try {
    const stamp = now.toISOString();
    const cutoff = new Date(now.getTime() - AUTO_ARCHIVE_AFTER_MS).toISOString();
    const { results } = await env.DB.prepare(
      `UPDATE tasks SET archived_at = ?
        WHERE id IN (
          SELECT id FROM tasks
           WHERE archived_at IS NULL AND parent_id IS NULL AND completed_at IS NOT NULL AND completed_at <= ?
             AND (unarchived_at IS NULL OR unarchived_at < completed_at)
           LIMIT ?)
        RETURNING id, workspace_id`
    )
      .bind(stamp, cutoff, AUTO_ARCHIVE_BATCH)
      .all<{ id: string; workspace_id: string }>();
    if (!results.length) return;

    const ids = results.map((r) => r.id);
    await env.DB.batch(
      chunked(ids).flatMap((part) => [
        env.DB.prepare(
          `UPDATE tasks SET archived_at = ? WHERE archived_at IS NULL AND parent_id IN (${placeholdersFor(part)})`
        ).bind(stamp, ...part),
        // No user: the history shows it as TimeTracker's doing, not a person's.
        env.DB.prepare(
          `INSERT INTO task_activity (workspace_id, task_id, user_id, kind) SELECT workspace_id, id, NULL, 'archived' FROM tasks WHERE id IN (${placeholdersFor(part)})`
        ).bind(...part),
      ])
    );
    const workspaces = new Set(results.map((r) => r.workspace_id));
    await Promise.all([...workspaces].map((ws) => broadcast(env, ws, "tasks:changed", null)));
  } catch (e) {
    console.warn("task auto-archive sweep failed", { error: String(e) });
  }
}
