-- A running timer belongs to one person, not to the workspace (D2): look it up per user.
DROP INDEX IF EXISTS idx_te_running;
CREATE INDEX IF NOT EXISTS idx_te_running_user ON time_entries(workspace_id, user_id) WHERE stop IS NULL;
