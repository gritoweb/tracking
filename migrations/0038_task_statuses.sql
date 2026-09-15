-- Configurable task statuses, and the board order that goes with them (D4).
--
-- A task used to be open or done and nothing else, so "what is in progress" and
-- "what is waiting on the client" had nowhere to live. `active`/`completed_at`
-- stay on the row as a *mirror* of the status category — every existing reader
-- (lib/ai.ts, TaskRail, the subtask counts, recurrence) keeps working untouched.
CREATE TABLE IF NOT EXISTS task_statuses (
  id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  color        TEXT NOT NULL,
  -- 'not_started' | 'active' | 'completed'. Only the category is behaviour;
  -- the name is the workspace's own vocabulary.
  category     TEXT NOT NULL,
  -- Fractional, like tasks.sort_order: moving a column rewrites one row.
  sort_order   REAL NOT NULL,
  archived     INTEGER NOT NULL DEFAULT 0,
  -- Where a new task lands. Exactly one per workspace, enforced in the route.
  is_default   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Two live columns may not share a name; an archived one keeps its history.
CREATE UNIQUE INDEX IF NOT EXISTS idx_task_statuses_name
  ON task_statuses(workspace_id, lower(name)) WHERE archived = 0;
CREATE INDEX IF NOT EXISTS idx_task_statuses_ws ON task_statuses(workspace_id, sort_order);

ALTER TABLE tasks ADD COLUMN status_id TEXT REFERENCES task_statuses(id);

-- The board's own order, deliberately NOT tasks.sort_order: that one is the
-- manual sequence inside a project and is what "Sort: Plan order" renders.
-- Sharing a single number would make tidying the board silently reshuffle the list.
ALTER TABLE tasks ADD COLUMN board_order REAL;

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(workspace_id, status_id, board_order);

-- Seed the five defaults for every workspace that already exists. Colors come
-- from the shared swatch palette (src/shared/colors.ts).
INSERT INTO task_statuses (id, workspace_id, name, color, category, sort_order, is_default)
  SELECT lower(hex(randomblob(16))), w.id, 'Backlog',     '#64748b', 'not_started', 1, 0 FROM workspaces w;
INSERT INTO task_statuses (id, workspace_id, name, color, category, sort_order, is_default)
  SELECT lower(hex(randomblob(16))), w.id, 'To do',       '#3b82f6', 'not_started', 2, 1 FROM workspaces w;
INSERT INTO task_statuses (id, workspace_id, name, color, category, sort_order, is_default)
  SELECT lower(hex(randomblob(16))), w.id, 'In progress', '#f59e0b', 'active',      3, 0 FROM workspaces w;
INSERT INTO task_statuses (id, workspace_id, name, color, category, sort_order, is_default)
  SELECT lower(hex(randomblob(16))), w.id, 'Feedback',    '#8b5cf6', 'active',      4, 0 FROM workspaces w;
INSERT INTO task_statuses (id, workspace_id, name, color, category, sort_order, is_default)
  SELECT lower(hex(randomblob(16))), w.id, 'Done',        '#22c55e', 'completed',   5, 0 FROM workspaces w;

-- Existing tasks: open ones become "To do", finished ones "Done".
UPDATE tasks SET status_id = (
  SELECT s.id FROM task_statuses s
  WHERE s.workspace_id = tasks.workspace_id AND s.name = 'To do'
) WHERE active = 1 AND status_id IS NULL;

UPDATE tasks SET status_id = (
  SELECT s.id FROM task_statuses s
  WHERE s.workspace_id = tasks.workspace_id AND s.name = 'Done'
) WHERE active = 0 AND status_id IS NULL;

-- The board starts out in the order the list already had.
UPDATE tasks SET board_order = COALESCE(sort_order, rowid * 1.0) WHERE board_order IS NULL;
