-- Archiving takes a task off the board without deleting it; NULL = not archived. Additive: no existing row changes.
ALTER TABLE tasks ADD COLUMN archived_at TEXT;
-- Set when someone unarchives a task, so the auto-archive job leaves it alone until it is completed again.
ALTER TABLE tasks ADD COLUMN unarchived_at TEXT;
-- The auto-archive sweep reads only live, completed top-level tasks.
CREATE INDEX IF NOT EXISTS idx_tasks_auto_archive ON tasks(completed_at) WHERE archived_at IS NULL AND parent_id IS NULL;
