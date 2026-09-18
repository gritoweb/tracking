-- Every workspace gets the same seven statuses a new one is born with (DEFAULT_STATUSES in
-- lib/task-statuses.ts, kept in step by lib/task-statuses.test.ts). Databases that predate them
-- were seeded by 0038 with five (Backlog, To do, In progress, Feedback, Done) and may have been edited since.
-- Only the workspace-wide set (project_id IS NULL) is touched; a project's own fork is its owner's choice.

-- 1) A live status that already has a canonical name is brought to its canonical colour, category and place.
UPDATE task_statuses SET color = '#64748b', category = 'not_started', sort_order = 1 WHERE project_id IS NULL AND archived = 0 AND lower(name) = 'backlog';
UPDATE task_statuses SET color = '#ef4444', category = 'active',      sort_order = 2 WHERE project_id IS NULL AND archived = 0 AND lower(name) = 'on hold';
UPDATE task_statuses SET color = '#3b82f6', category = 'not_started', sort_order = 3 WHERE project_id IS NULL AND archived = 0 AND lower(name) = 'pendente';
UPDATE task_statuses SET color = '#8b5cf6', category = 'active',      sort_order = 4 WHERE project_id IS NULL AND archived = 0 AND lower(name) = 'em progresso';
UPDATE task_statuses SET color = '#f97316', category = 'active',      sort_order = 5 WHERE project_id IS NULL AND archived = 0 AND lower(name) = 'qa';
UPDATE task_statuses SET color = '#ec4899', category = 'active',      sort_order = 6 WHERE project_id IS NULL AND archived = 0 AND lower(name) = 'client review';
UPDATE task_statuses SET color = '#22c55e', category = 'completed',   sort_order = 7 WHERE project_id IS NULL AND archived = 0 AND lower(name) = 'closed';

-- 2) Any of the seven a workspace lacks is created (one statement each: D1 caps the terms of a compound SELECT).
INSERT INTO task_statuses (id, workspace_id, project_id, name, color, category, sort_order, is_default)
  SELECT lower(hex(randomblob(16))), ws.workspace_id, NULL, 'Backlog', '#64748b', 'not_started', 1, 0
    FROM (SELECT DISTINCT workspace_id FROM task_statuses WHERE project_id IS NULL) ws
   WHERE NOT EXISTS (
     SELECT 1 FROM task_statuses s
      WHERE s.workspace_id = ws.workspace_id AND s.project_id IS NULL AND s.archived = 0 AND lower(s.name) = lower('Backlog')
   );
INSERT INTO task_statuses (id, workspace_id, project_id, name, color, category, sort_order, is_default)
  SELECT lower(hex(randomblob(16))), ws.workspace_id, NULL, 'On hold', '#ef4444', 'active', 2, 0
    FROM (SELECT DISTINCT workspace_id FROM task_statuses WHERE project_id IS NULL) ws
   WHERE NOT EXISTS (
     SELECT 1 FROM task_statuses s
      WHERE s.workspace_id = ws.workspace_id AND s.project_id IS NULL AND s.archived = 0 AND lower(s.name) = lower('On hold')
   );
INSERT INTO task_statuses (id, workspace_id, project_id, name, color, category, sort_order, is_default)
  SELECT lower(hex(randomblob(16))), ws.workspace_id, NULL, 'Pendente', '#3b82f6', 'not_started', 3, 0
    FROM (SELECT DISTINCT workspace_id FROM task_statuses WHERE project_id IS NULL) ws
   WHERE NOT EXISTS (
     SELECT 1 FROM task_statuses s
      WHERE s.workspace_id = ws.workspace_id AND s.project_id IS NULL AND s.archived = 0 AND lower(s.name) = lower('Pendente')
   );
INSERT INTO task_statuses (id, workspace_id, project_id, name, color, category, sort_order, is_default)
  SELECT lower(hex(randomblob(16))), ws.workspace_id, NULL, 'Em progresso', '#8b5cf6', 'active', 4, 0
    FROM (SELECT DISTINCT workspace_id FROM task_statuses WHERE project_id IS NULL) ws
   WHERE NOT EXISTS (
     SELECT 1 FROM task_statuses s
      WHERE s.workspace_id = ws.workspace_id AND s.project_id IS NULL AND s.archived = 0 AND lower(s.name) = lower('Em progresso')
   );
INSERT INTO task_statuses (id, workspace_id, project_id, name, color, category, sort_order, is_default)
  SELECT lower(hex(randomblob(16))), ws.workspace_id, NULL, 'QA', '#f97316', 'active', 5, 0
    FROM (SELECT DISTINCT workspace_id FROM task_statuses WHERE project_id IS NULL) ws
   WHERE NOT EXISTS (
     SELECT 1 FROM task_statuses s
      WHERE s.workspace_id = ws.workspace_id AND s.project_id IS NULL AND s.archived = 0 AND lower(s.name) = lower('QA')
   );
INSERT INTO task_statuses (id, workspace_id, project_id, name, color, category, sort_order, is_default)
  SELECT lower(hex(randomblob(16))), ws.workspace_id, NULL, 'Client review', '#ec4899', 'active', 6, 0
    FROM (SELECT DISTINCT workspace_id FROM task_statuses WHERE project_id IS NULL) ws
   WHERE NOT EXISTS (
     SELECT 1 FROM task_statuses s
      WHERE s.workspace_id = ws.workspace_id AND s.project_id IS NULL AND s.archived = 0 AND lower(s.name) = lower('Client review')
   );
INSERT INTO task_statuses (id, workspace_id, project_id, name, color, category, sort_order, is_default)
  SELECT lower(hex(randomblob(16))), ws.workspace_id, NULL, 'Closed', '#22c55e', 'completed', 7, 0
    FROM (SELECT DISTINCT workspace_id FROM task_statuses WHERE project_id IS NULL) ws
   WHERE NOT EXISTS (
     SELECT 1 FROM task_statuses s
      WHERE s.workspace_id = ws.workspace_id AND s.project_id IS NULL AND s.archived = 0 AND lower(s.name) = lower('Closed')
   );

-- 3) Tasks sitting in any other workspace-wide status move to the closest of the seven: by the old
--    default names first, otherwise by category (open -> Pendente, active -> Em progresso, done -> Closed).
UPDATE tasks SET status_id = (
  SELECT target.id
    FROM task_statuses old
    JOIN task_statuses target
      ON target.workspace_id = old.workspace_id AND target.project_id IS NULL AND target.archived = 0
     AND lower(target.name) = CASE lower(old.name)
           WHEN 'to do'       THEN 'pendente'
           WHEN 'in progress' THEN 'em progresso'
           WHEN 'feedback'    THEN 'client review'
           WHEN 'done'        THEN 'closed'
           ELSE CASE old.category WHEN 'not_started' THEN 'pendente' WHEN 'active' THEN 'em progresso' ELSE 'closed' END
         END
   WHERE old.id = tasks.status_id
)
WHERE status_id IN (
  SELECT id FROM task_statuses
   WHERE project_id IS NULL AND archived = 0
     AND lower(name) NOT IN ('backlog', 'on hold', 'pendente', 'em progresso', 'qa', 'client review', 'closed')
);

-- 4) The leftovers are archived, not deleted: their names stay in history and no live column shares a name.
UPDATE task_statuses SET archived = 1
 WHERE project_id IS NULL AND archived = 0
   AND lower(name) NOT IN ('backlog', 'on hold', 'pendente', 'em progresso', 'qa', 'client review', 'closed');

-- 5) Exactly one default per workspace: where a new task lands.
UPDATE task_statuses SET is_default = CASE WHEN lower(name) = 'pendente' THEN 1 ELSE 0 END
 WHERE project_id IS NULL AND archived = 0;
