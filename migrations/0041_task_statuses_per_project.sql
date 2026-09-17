-- Per-project status override on top of the workspace's global default (D4 follow-up).
--
-- `project_id IS NULL` is the workspace's global default set every board falls back to.
-- `project_id = X` is a fork specific to project X — created on demand (see
-- lib/task-statuses.ts `ensureProjectFork`) the first time someone customizes a
-- project's board rather than eagerly for every project, so a workspace that never
-- customizes anything never grows extra rows.
ALTER TABLE task_statuses ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE CASCADE;

-- The old name-uniqueness index only ever covered one (global) set per workspace.
-- Widened so the same name can exist once globally AND once per project fork.
DROP INDEX IF EXISTS idx_task_statuses_name;
CREATE UNIQUE INDEX IF NOT EXISTS idx_task_statuses_name
  ON task_statuses(workspace_id, COALESCE(project_id, ''), lower(name)) WHERE archived = 0;

CREATE INDEX IF NOT EXISTS idx_task_statuses_project
  ON task_statuses(project_id, sort_order) WHERE project_id IS NOT NULL;
