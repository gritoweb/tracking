// D1 row shapes per table (booleans are D1's 0|1); ad-hoc aggregation rows live next to their own query instead.
import type { DraftSource, IntegrationType, TaskStatusCategory } from "@shared/schemas";

// ─── time_entries ────────────────────────────────────────────────────────────

/** Raw `time_entries` columns, no joins — what an ownership/guard `SELECT` reads before a write. */
export interface TimeEntryRow {
  id: string;
  workspace_id: string;
  user_id: string | null;
  project_id: string | null;
  task_id: string | null;
  description: string;
  start: string;
  stop: string | null;
  duration: number | null;
  billable: number;
  sync_status: "synced" | "error" | null;
  external_id: string | null;
  synced_at: string | null;
  sync_error: string | null;
  calendar_event_id: string | null;
  created_at: string;
  updated_at: string;
}

/** `ENTRY_SELECT` (db/queries.ts): every `time_entries` column plus its joined display fields. */
export interface TimeEntryJoinRow extends TimeEntryRow {
  project_name: string | null;
  project_color: string | null;
  client_name: string | null;
  task_name: string | null;
  user_name: string | null;
  user_email: string | null;
  user_image: string | null;
  tag_names: string | null;
}

// ─── clients ─────────────────────────────────────────────────────────────────

export interface ClientRow {
  id: string;
  workspace_id: string;
  name: string;
  archived: number;
  created_at: string;
  notes: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
}

// ─── projects ────────────────────────────────────────────────────────────────

/** `projectSelect()`/`PROJECT_SELECT` (lib/projects.ts): `projects.*` plus the client name and two computed totals. */
export interface ProjectRow {
  id: string;
  workspace_id: string;
  client_id: string | null;
  name: string;
  color: string;
  billable: number;
  rate: number | null;
  active: number;
  created_at: string;
  start_date: string | null;
  end_date: string | null;
  estimated_hours: number | null;
  integration_id: string | null;
  external_project_id: string | null;
  external_task_id: string | null;
  client_name: string | null;
  tracked_seconds: number;
  budget_seconds: number;
}

// ─── tags ────────────────────────────────────────────────────────────────────

export interface TagRow {
  id: string;
  workspace_id: string;
  name: string;
  color: string | null;
}

// ─── favorites ───────────────────────────────────────────────────────────────

/** `FAVORITE_SELECT` (routes/favorites.ts): `favorites.*` plus project/task display names. */
export interface FavoriteRow {
  id: string;
  workspace_id: string;
  description: string;
  project_id: string | null;
  task_id: string | null;
  tags: string; // JSON array
  billable: number;
  created_at: string;
  project_name: string | null;
  project_color: string | null;
  task_name: string | null;
}

// ─── recurring_entries ───────────────────────────────────────────────────────

/** Raw `recurring_entries` columns, no joins — what the cron sweep (`lib/recurring.ts`) reads. */
export interface RecurringEntryRow {
  id: string;
  workspace_id: string;
  user_id: string | null;
  description: string;
  project_id: string | null;
  task_id: string | null;
  tags: string; // JSON array
  billable: number;
  duration_seconds: number;
  days_of_week: string; // comma-separated weekday numbers
  time_utc: number;
  active: number;
  last_materialized: string | null;
  created_at: string;
}

/** `RECURRING_SELECT` (routes/recurring.ts): every `recurring_entries` column plus project/task display names. */
export interface RecurringEntryJoinRow extends RecurringEntryRow {
  project_name: string | null;
  project_color: string | null;
  task_name: string | null;
}

// ─── notifications ───────────────────────────────────────────────────────────

export interface NotificationRow {
  id: string;
  workspace_id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  is_read: number;
  created_at: string;
}

// ─── task_statuses ───────────────────────────────────────────────────────────

export interface TaskStatusRow {
  id: string;
  workspace_id: string;
  project_id: string | null;
  name: string;
  color: string;
  category: TaskStatusCategory;
  sort_order: number;
  archived: number;
  is_default: number;
  created_at: string;
}

// ─── tasks ───────────────────────────────────────────────────────────────────

/** Raw `tasks` columns, no joins — what an ownership/guard `SELECT *` reads before a write. */
export interface TaskRow {
  id: string;
  workspace_id: string;
  project_id: string;
  name: string;
  description: string | null;
  active: number;
  estimated_seconds: number | null;
  due_date: string | null;
  priority: number;
  sort_order: number | null;
  board_order: number | null;
  status_id: string | null;
  completed_at: string | null;
  parent_id: string | null;
  recur_rule: string | null;
  created_by: string | null;
  created_at: string;
  // Present only on rows read via `taskSelect()` — see TaskJoinRow.
  status_name?: string | null;
  status_color?: string | null;
  status_category?: TaskStatusCategory | null;
  subtask_total?: number;
}

/** `taskSelect()` (routes/tasks.ts): every `tasks` column plus status/project display fields and computed rollups. */
export interface TaskJoinRow extends TaskRow {
  project_name: string | null;
  project_color: string | null;
  status_name: string | null;
  status_color: string | null;
  status_category: TaskStatusCategory | null;
  tracked_seconds: number;
  subtask_total: number;
  subtask_done: number;
  assignees_json: string | null;
}

/** A task row selected together with its columns needed to spawn a recurring child (routes/tasks.ts). */
export interface TaskChildRow {
  name: string;
  description: string | null;
  estimated_seconds: number | null;
  priority: number | null;
  sort_order: number | null;
}

// ─── task_attachments ────────────────────────────────────────────────────────

export interface TaskAttachmentRow {
  id: string;
  workspace_id: string;
  task_id: string;
  user_id: string | null;
  r2_key: string;
  filename: string;
  content_type: string;
  size: number;
  width: number | null;
  height: number | null;
  created_at: string;
}

// ─── task_comments ───────────────────────────────────────────────────────────

/** A `task_comments` row joined with its author and (optional) attachment's filename (routes/tasks.ts). */
export interface TaskCommentRow {
  id: string;
  workspace_id: string;
  task_id: string;
  user_id: string;
  body: string;
  mentioned_user_ids: string; // comma-separated
  attachment_id: string | null;
  created_at: string;
  edited_at: string | null;
  // INNER JOIN "user" — the author always resolves, unlike the LEFT JOINs elsewhere.
  user_name: string;
  user_email: string;
  user_image: string | null;
  attachment_filename: string | null;
}

// ─── draft_entries ───────────────────────────────────────────────────────────

/** `DRAFT_SELECT` (lib/drafts.ts): `draft_entries.*` plus project/task display names. */
export interface DraftEntryRow {
  id: string;
  workspace_id: string;
  user_id: string;
  local_date: string;
  project_id: string | null;
  task_id: string | null;
  description: string;
  start: string;
  stop: string;
  duration: number;
  billable: number;
  source: DraftSource;
  confidence: "high" | "medium" | "low";
  reason: string | null;
  calendar_event_id: string | null;
  created_at: string;
  updated_at: string;
  project_name: string | null;
  project_color: string | null;
  task_name: string | null;
}

/** The subset of `draft_entries` columns `POST /drafts/confirm` reads before inserting real entries. */
export interface DraftConfirmRow {
  id: string;
  project_id: string | null;
  task_id: string | null;
  description: string;
  start: string;
  stop: string;
  duration: number | null;
  billable: number;
  calendar_event_id: string | null;
}

// ─── project_allocations ─────────────────────────────────────────────────────

/** `ALLOCATION_SELECT` (routes/planner.ts): the columns the Planner grid reads, plus project/task display names. */
export interface AllocationRow {
  id: string;
  project_id: string;
  task_id: string; // '' means "no task" — see migration 0026
  date: string;
  planned_seconds: number;
  updated_at: string;
  project_name: string | null;
  project_color: string | null;
  task_name: string | null;
}

// ─── integrations ────────────────────────────────────────────────────────────

export interface IntegrationRow {
  id: string;
  workspace_id: string;
  type: IntegrationType;
  name: string;
  base_url: string;
  credentials: string;
  created_at: string;
  user_id: string | null;
  auto_track: number;
}

// ─── saved_reports ───────────────────────────────────────────────────────────

/** The subset `routes/saved-reports.ts` selects — `config` is client-owned JSON, parsed via `parseJsonColumn`. */
export interface SavedReportRow {
  id: string;
  name: string;
  config: string;
  created_at: string;
  updated_at: string;
}
