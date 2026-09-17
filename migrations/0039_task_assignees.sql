-- One or more responsible people per task (D6); membership is checked in routes/tasks.ts, not here.
CREATE TABLE IF NOT EXISTS task_assignees (
  task_id      TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (task_id, user_id)
);

-- "Assigned to me" and the board/list filter both scan by person first.
CREATE INDEX IF NOT EXISTS idx_task_assignees_user ON task_assignees(workspace_id, user_id);
