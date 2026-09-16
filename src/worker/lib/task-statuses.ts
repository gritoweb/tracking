import { SWATCH_COLORS, SWATCH_COLOR_NAMES } from "@shared/colors";
import type { TaskStatus, TaskStatusCategory } from "@shared/schemas";

// Status is the source of truth; active/completed_at is its mirror — see CLAUDE.md.

function swatch(name: string): string {
  const found = SWATCH_COLORS.find((c) => SWATCH_COLOR_NAMES[c] === name);
  if (!found) throw new Error(`Unknown swatch: ${name}`);
  return found;
}

/** The five a workspace is born with. */
const DEFAULT_STATUSES: {
  name: string;
  color: string;
  category: TaskStatusCategory;
  isDefault: boolean;
}[] = [
  { name: "Backlog", color: swatch("Slate"), category: "not_started", isDefault: false },
  { name: "To do", color: swatch("Blue"), category: "not_started", isDefault: true }, // capture lands here
  { name: "In progress", color: swatch("Amber"), category: "active", isDefault: false },
  { name: "Feedback", color: swatch("Violet"), category: "active", isDefault: false },
  { name: "Done", color: swatch("Green"), category: "completed", isDefault: false },
];

type Row = Record<string, unknown>;

export function formatStatus(row: Row): TaskStatus {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    name: row.name as string,
    color: row.color as string,
    category: row.category as TaskStatusCategory,
    sortOrder: (row.sort_order as number) ?? 0,
    archived: Boolean(row.archived),
    isDefault: Boolean(row.is_default),
  };
}

/** Seed the defaults for a workspace that has none — a lazy repair, belt and braces with the creation hook. */
export async function ensureStatuses(db: D1Database, workspaceId: string): Promise<void> {
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM task_statuses WHERE workspace_id = ?`)
    .bind(workspaceId)
    .first<{ n: number }>();
  if ((row?.n ?? 0) > 0) return;

  await db.batch(
    DEFAULT_STATUSES.map((s, i) =>
      db
        .prepare(
          `INSERT INTO task_statuses (id, workspace_id, name, color, category, sort_order, is_default)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(crypto.randomUUID(), workspaceId, s.name, s.color, s.category, i + 1, s.isDefault ? 1 : 0)
    )
  );
}

/** Every live status of a workspace, in column order. */
export async function listStatuses(db: D1Database, workspaceId: string): Promise<TaskStatus[]> {
  await ensureStatuses(db, workspaceId);
  const { results } = await db
    .prepare(
      `SELECT * FROM task_statuses
        WHERE workspace_id = ? AND archived = 0
        ORDER BY sort_order ASC, name ASC`
    )
    .bind(workspaceId)
    .all<Row>();
  return results.map(formatStatus);
}

/** The status a requested id really is — same workspace, not archived; `null` means 400 it. */
export async function resolveStatus(
  db: D1Database,
  workspaceId: string,
  statusId: string
): Promise<TaskStatus | null> {
  const row = await db
    .prepare(`SELECT * FROM task_statuses WHERE id = ? AND workspace_id = ? AND archived = 0`)
    .bind(statusId, workspaceId)
    .first<Row>();
  return row ? formatStatus(row) : null;
}

/** Where a new task lands, and where a reopened one returns to. */
export async function defaultStatus(db: D1Database, workspaceId: string): Promise<TaskStatus> {
  const live = await listStatuses(db, workspaceId);
  return live.find((s) => s.isDefault && s.category !== "completed") ?? live.find((s) => s.category !== "completed") ?? live[0];
}

/** Where the done checkbox sends a task: the first `completed` column. */
export async function completedStatus(db: D1Database, workspaceId: string): Promise<TaskStatus | null> {
  const live = await listStatuses(db, workspaceId);
  return live.find((s) => s.category === "completed") ?? null;
}

/** The mirror. `wasActive` stops `completed_at` from refreshing on every edit of an already-done task. */
export function syncFromCategory(
  category: TaskStatusCategory,
  wasActive: boolean,
  previousCompletedAt: string | null
): { active: 0 | 1; completedAt: string | null } {
  if (category !== "completed") return { active: 1, completedAt: null };
  return {
    active: 0,
    completedAt: wasActive ? new Date().toISOString() : previousCompletedAt,
  };
}

/** Next free column position, so a new status lands at the end of the board. */
export async function nextStatusOrder(db: D1Database, workspaceId: string): Promise<number> {
  const row = await db
    .prepare(`SELECT COALESCE(MAX(sort_order), 0) AS m FROM task_statuses WHERE workspace_id = ?`)
    .bind(workspaceId)
    .first<{ m: number }>();
  return ((row?.m as number) ?? 0) + 1;
}
