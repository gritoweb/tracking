-- saved_reports.workspace_id had no FK/cascade: deleting a workspace left its
-- saved reports as unreachable orphan rows instead of being cleaned up (SECURITY.md pentest, S-29 follow-up).
CREATE TABLE saved_reports_new (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL,
  name         TEXT NOT NULL,
  config       TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Rows whose workspace is already gone are unreachable dead weight; the rebuild is also the cleanup.
INSERT INTO saved_reports_new
  SELECT sr.* FROM saved_reports sr
  WHERE EXISTS (SELECT 1 FROM workspaces w WHERE w.id = sr.workspace_id);

DROP TABLE saved_reports;
ALTER TABLE saved_reports_new RENAME TO saved_reports;

CREATE INDEX IF NOT EXISTS idx_saved_reports_ws_user
  ON saved_reports(workspace_id, user_id);
