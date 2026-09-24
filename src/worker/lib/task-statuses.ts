import { nextUnusedColor, SWATCH_COLORS, SWATCH_COLOR_NAMES } from "@shared/colors";
import type { TaskStatus, TaskStatusCategory } from "@shared/schemas";
import type { TaskStatusRow } from "../db/rows";

// Status is the source of truth; active/completed_at is its mirror — see CLAUDE.md.
//
// A workspace has one GLOBAL default set (project_id IS NULL). A project may FORK it —
// its own copy, `project_id = <project>` — the first time someone customizes that
// project's board. Until then every project reads the global set. See `ensureProjectFork`.

function swatch(name: string): string {
  const found = SWATCH_COLORS.find((c) => SWATCH_COLOR_NAMES[c] === name);
  if (!found) throw new Error(`Unknown swatch: ${name}`);
  return found;
}

/** The seven a workspace is born with. */
export const DEFAULT_STATUSES: {
  name: string;
  color: string;
  category: TaskStatusCategory;
  isDefault: boolean;
}[] = [
  { name: "Backlog", color: swatch("Slate"), category: "not_started", isDefault: false },
  { name: "On hold / Stuck", color: swatch("Red"), category: "active", isDefault: false },
  { name: "To do", color: swatch("Blue"), category: "not_started", isDefault: true }, // capture lands here
  { name: "In progress", color: swatch("Violet"), category: "active", isDefault: false },
  { name: "QA", color: swatch("Orange"), category: "active", isDefault: false },
  // A darker pink than the picker's stock swatch, short of purple — asked for by name.
  { name: "Client review", color: swatch("Pink"), category: "active", isDefault: false },
  { name: "Closed", color: swatch("Green"), category: "completed", isDefault: false },
];

export function formatStatus(row: TaskStatusRow): TaskStatus {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id ?? null,
    name: row.name,
    color: row.color,
    category: row.category,
    sortOrder: row.sort_order ?? 0,
    archived: Boolean(row.archived),
    isDefault: Boolean(row.is_default),
  };
}

/** Seed the defaults for a workspace that has none — a lazy repair, belt and braces with the creation hook. */
export async function ensureStatuses(db: D1Database, workspaceId: string): Promise<void> {
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM task_statuses WHERE workspace_id = ? AND project_id IS NULL`)
    .bind(workspaceId)
    .first<{ n: number }>();
  if ((row?.n ?? 0) > 0) return;

  await db.batch(
    DEFAULT_STATUSES.map((s, i) =>
      db
        .prepare(
          `INSERT INTO task_statuses (id, workspace_id, project_id, name, color, category, sort_order, is_default)
           VALUES (?, ?, NULL, ?, ?, ?, ?, ?)`
        )
        .bind(crypto.randomUUID(), workspaceId, s.name, s.color, s.category, i + 1, s.isDefault ? 1 : 0)
    )
  );
}

/**
 * Every live status of a project's *effective* set: its own fork if it has one,
 * else the workspace's global default. `projectId` null means "the global set
 * itself" — the unfiltered board, and the scope a fork doesn't apply to.
 */
export async function listStatuses(
  db: D1Database,
  workspaceId: string,
  projectId: string | null
): Promise<TaskStatus[]> {
  await ensureStatuses(db, workspaceId);

  if (projectId) {
    const { results: forked } = await db
      .prepare(
        `SELECT * FROM task_statuses
          WHERE workspace_id = ? AND project_id = ? AND archived = 0
          ORDER BY sort_order ASC, name ASC`
      )
      .bind(workspaceId, projectId)
      .all<TaskStatusRow>();
    if (forked.length) return forked.map(formatStatus);
  }

  const { results } = await db
    .prepare(
      `SELECT * FROM task_statuses
        WHERE workspace_id = ? AND project_id IS NULL AND archived = 0
        ORDER BY sort_order ASC, name ASC`
    )
    .bind(workspaceId)
    .all<TaskStatusRow>();
  return results.map(formatStatus);
}

/**
 * Clones the global set into `project_id`-scoped rows, idempotently — a no-op if the
 * project already has its own fork. Returns the effective (now certainly project-owned)
 * set, so a caller translating a global id into its forked counterpart can match by name.
 */
export async function ensureProjectFork(
  db: D1Database,
  workspaceId: string,
  projectId: string
): Promise<TaskStatus[]> {
  const existing = await db
    .prepare(`SELECT * FROM task_statuses WHERE workspace_id = ? AND project_id = ? AND archived = 0`)
    .bind(workspaceId, projectId)
    .all<TaskStatusRow>();
  if (existing.results.length) return existing.results.map(formatStatus);

  const global = await listStatuses(db, workspaceId, null);
  const rows = global.map((s) => ({ ...s, id: crypto.randomUUID() }));
  await db.batch(
    rows.map((s) =>
      db
        .prepare(
          `INSERT INTO task_statuses (id, workspace_id, project_id, name, color, category, sort_order, is_default)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(s.id, workspaceId, projectId, s.name, s.color, s.category, s.sortOrder, s.isDefault ? 1 : 0)
    )
  );
  return rows.map((s) => ({ ...s, projectId }));
}

/** Live colours already in use in a set, for `nextUnusedColor` — same rule tags use. */
function usedColors(statuses: TaskStatus[]): string[] {
  return statuses.map((s) => s.color);
}

export { nextUnusedColor };

/** The status a requested id really is — same workspace, not archived; `null` means 400 it. */
export async function resolveStatus(
  db: D1Database,
  workspaceId: string,
  statusId: string
): Promise<TaskStatus | null> {
  const row = await db
    .prepare(`SELECT * FROM task_statuses WHERE id = ? AND workspace_id = ? AND archived = 0`)
    .bind(statusId, workspaceId)
    .first<TaskStatusRow>();
  return row ? formatStatus(row) : null;
}

/**
 * A column on the board of `projectId` (its own columns if it forked them, else the workspace's), or null: a column from
 * another project's board, an archived one or an unknown id is refused, whatever the client — app, MCP or Assistant.
 */
export async function statusOnBoard(
  db: D1Database,
  workspaceId: string,
  projectId: string | null,
  statusId: string
): Promise<{ status: TaskStatus | null; board: TaskStatus[] }> {
  const board = await listStatuses(db, workspaceId, projectId);
  return { status: board.find((s) => s.id === statusId) ?? null, board };
}

/** The refusal for a column that isn't on the task's board, listing the ones that are, so any client can pick again. */
export function offBoardError(board: TaskStatus[]): string {
  return `That status isn't a column on this task's board. Its columns: ${board.map((s) => `${s.name} (${s.id}, ${s.category})`).join("; ")}.`;
}

/** Where a new task lands, and where a reopened one returns to. */
export async function defaultStatus(
  db: D1Database,
  workspaceId: string,
  projectId: string | null
): Promise<TaskStatus> {
  const live = await listStatuses(db, workspaceId, projectId);
  return live.find((s) => s.isDefault && s.category !== "completed") ?? live.find((s) => s.category !== "completed") ?? live[0];
}

/** Where the done checkbox sends a task: the first `completed` column. */
export async function completedStatus(
  db: D1Database,
  workspaceId: string,
  projectId: string | null
): Promise<TaskStatus | null> {
  const live = await listStatuses(db, workspaceId, projectId);
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

/** Next free column position in a set, so a new status lands at the end of its board. */
export async function nextStatusOrder(
  db: D1Database,
  workspaceId: string,
  projectId: string | null
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COALESCE(MAX(sort_order), 0) AS m FROM task_statuses
        WHERE workspace_id = ? AND ${projectId ? "project_id = ?" : "project_id IS NULL"}`
    )
    .bind(...(projectId ? [workspaceId, projectId] : [workspaceId]))
    .first<{ m: number }>();
  return ((row?.m as number) ?? 0) + 1;
}

/** The colour a new status in this set gets when none was chosen — the next one not already in play. */
export function nextStatusColor(existing: TaskStatus[]): string {
  return nextUnusedColor(usedColors(existing));
}
