-- One-time cleanup for assignee rows left behind before removeMemberFromTasks existed.
DELETE FROM task_assignees
 WHERE NOT EXISTS (
   SELECT 1 FROM "member" m WHERE m.userId = task_assignees.user_id AND m.organizationId = task_assignees.workspace_id
 );
