-- What changed on a task, shown between its comments. Names are stored, not ids, so an entry
-- still reads right after a status is renamed or a member leaves.
CREATE TABLE IF NOT EXISTS task_activity (
  id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  task_id      TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id      TEXT,
  -- status | due_date | priority | assignees
  kind         TEXT NOT NULL,
  -- status/due_date/priority: the old and new value. assignees: from = removed names, to = added names.
  from_value   TEXT,
  to_value     TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_task_activity_task
  ON task_activity(task_id, created_at ASC);
