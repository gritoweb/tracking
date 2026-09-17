import { resolveEntryBillable } from "@shared/billable";
import type { TimeEntry } from "@shared/schemas";
import { ENTRY_SELECT, formatEntry } from "../db/queries";
import type { TimeEntryJoinRow } from "../db/rows";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface CopyWeekPlan {
  /** INSERTs for one `db.batch()` call in the route, so the whole week lands atomically. */
  statements: D1PreparedStatement[];
  createdIds: string[];
  /** Tag names per created id; applied after the batch (see routes/time-entries.ts). */
  tagsByCreatedId: Map<string, string[]>;
}

export type CopyWeekOutcome =
  | { ok: true; plan: CopyWeekPlan }
  | { ok: false; error: string; entryIds: string[] };

/** Copy-week is a personal action on one's own timesheet, so both weeks are scoped to `userId` regardless of role. */
export async function planCopyWeek(
  db: D1Database,
  workspaceId: string,
  userId: string,
  sourceWeekStart: string,
  targetWeekStart: string
): Promise<CopyWeekOutcome> {
  const offsetMs = new Date(targetWeekStart).getTime() - new Date(sourceWeekStart).getTime();
  const sourceWeekEnd = new Date(new Date(sourceWeekStart).getTime() + WEEK_MS).toISOString();

  const { results } = await db
    .prepare(
      `${ENTRY_SELECT}
       WHERE te.workspace_id = ? AND te.user_id = ? AND te.stop IS NOT NULL
         AND te.duration > 0 AND te.project_id IS NOT NULL
         AND te.start >= ? AND te.start < ?
       GROUP BY te.id ORDER BY te.start ASC`
    )
    .bind(workspaceId, userId, sourceWeekStart, sourceWeekEnd)
    .all<TimeEntryJoinRow>();
  const source: TimeEntry[] = results.map(formatEntry);

  if (!source.length) {
    return { ok: true, plan: { statements: [], createdIds: [], tagsByCreatedId: new Map() } };
  }

  // Every entry needs an active project on every write path (D3) — a copy is no exception.
  const projectIds = [...new Set(source.map((e) => e.projectId!))];
  const { results: active } = await db
    .prepare(
      `SELECT id FROM projects WHERE workspace_id = ? AND active = 1 AND client_id IS NOT NULL
         AND id IN (${projectIds.map(() => "?").join(",")})`
    )
    .bind(workspaceId, ...projectIds)
    .all<{ id: string }>();
  const activeIds = new Set(active.map((p) => p.id));
  const inactive = source.filter((e) => !activeIds.has(e.projectId!));
  if (inactive.length) {
    return {
      ok: false,
      error: "Choose an active project for every entry before copying",
      entryIds: inactive.map((e) => e.id),
    };
  }

  const now = new Date().toISOString();
  const insertSql = `INSERT INTO time_entries
       (id, workspace_id, user_id, project_id, task_id, description, start, stop, duration, billable, calendar_event_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`;

  const createdIds: string[] = [];
  const tagsByCreatedId = new Map<string, string[]>();
  // Prepared fresh per entry rather than one template re-bound in a loop, so each bound copy stays independent.
  const statements = source.map((e) => {
    const id = crypto.randomUUID();
    createdIds.push(id);
    if (e.tags.length) tagsByCreatedId.set(id, e.tags);
    const start = new Date(new Date(e.start).getTime() + offsetMs).toISOString();
    const stop = new Date(new Date(e.stop!).getTime() + offsetMs).toISOString();
    return db
      .prepare(insertSql)
      .bind(
        id,
        workspaceId,
        userId,
        e.projectId,
        e.taskId ?? null,
        e.description,
        start,
        stop,
        e.duration,
        resolveEntryBillable(e.billable) ? 1 : 0,
        now,
        now
      );
  });

  return { ok: true, plan: { statements, createdIds, tagsByCreatedId } };
}
