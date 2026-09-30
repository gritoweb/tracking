-- Archiving takes a task off the board without deleting it; NULL = not archived. Additive: no existing row changes.
ALTER TABLE tasks ADD COLUMN archived_at TEXT;
-- Set when someone unarchives a task (kept for an automatic archive, which is off for now).
ALTER TABLE tasks ADD COLUMN unarchived_at TEXT;
-- For an automatic archive of long-completed top-level tasks, if it is turned on again.
CREATE INDEX IF NOT EXISTS idx_tasks_auto_archive ON tasks(completed_at) WHERE archived_at IS NULL AND parent_id IS NULL;
