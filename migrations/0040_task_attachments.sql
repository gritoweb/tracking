-- Images attached to a task (D7); the file itself lives in R2, this table is just the record.
CREATE TABLE IF NOT EXISTS task_attachments (
  id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  task_id      TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id      TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  r2_key       TEXT NOT NULL,
  filename     TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size         INTEGER NOT NULL,
  width        INTEGER,
  height       INTEGER,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_task_attachments_task ON task_attachments(task_id);
-- The R2 object itself is deleted explicitly in the route (waitUntil), not by a trigger.
