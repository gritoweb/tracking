import { useAuth } from "@/hooks/useAuth";
import { useWorkspaceRole } from "@/hooks/useWorkspaceRole";
import type { Task } from "@shared/schemas";

/** Who may delete a task — its creator or a workspace owner/admin, the rule the server and MCP enforce (canDeleteTask). */
export function useCanDeleteTask(): (task: Pick<Task, "createdBy">) => boolean {
  const { user } = useAuth();
  const { canManage } = useWorkspaceRole();
  return (task) => canManage || (task.createdBy !== null && task.createdBy === user?.id);
}
