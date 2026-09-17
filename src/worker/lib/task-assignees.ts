import { broadcast } from "../db/queries";

// A former member disappears from every task assignee list, but never loses their tracked hours (see auth.ts).
export async function removeMemberFromTasks(env: Env, workspaceId: string, userId: string): Promise<void> {
  const result = await env.DB
    .prepare(`DELETE FROM task_assignees WHERE workspace_id = ? AND user_id = ?`)
    .bind(workspaceId, userId)
    .run();
  if (!(result.meta.changes ?? 0)) return;
  await broadcast(env, workspaceId, "tasks:changed", null);
}
