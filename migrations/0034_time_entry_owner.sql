-- Who logged each entry — needed both to show it and to enforce that a plain
-- member can't edit/delete someone else's. Nullable on purpose: existing rows
-- and cron-materialized entries (recurring templates, calendar auto-track)
-- have no single human creator, and backfilling a guess would be a lie.
ALTER TABLE time_entries ADD COLUMN user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_time_entries_user ON time_entries(workspace_id, user_id);
