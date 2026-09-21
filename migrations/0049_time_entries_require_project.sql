-- Hours belong to a project (D3): the database refuses an entry without one, whichever code path wrote it.
CREATE TRIGGER IF NOT EXISTS time_entries_require_project_on_insert
BEFORE INSERT ON time_entries
WHEN NEW.project_id IS NULL
BEGIN
  SELECT RAISE(ABORT, 'A time entry needs a project');
END;

-- Also fires when a project is deleted under an entry (ON DELETE SET NULL): a project with hours is archived, never deleted.
CREATE TRIGGER IF NOT EXISTS time_entries_require_project_on_update
BEFORE UPDATE OF project_id ON time_entries
WHEN NEW.project_id IS NULL
BEGIN
  SELECT RAISE(ABORT, 'A time entry needs a project');
END;
