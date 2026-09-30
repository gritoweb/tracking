-- Archiving takes a task off the board without deleting it; NULL = not archived. Additive: no existing row changes.
ALTER TABLE tasks ADD COLUMN archived_at TEXT;
