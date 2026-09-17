import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { CreateTaskStatus, TaskStatus, UpdateTaskStatus } from "@shared/schemas";

/**
 * A project's effective columns: its own fork if it has customized them, else the
 * workspace's global default. `projectId` null/undefined means the global set itself
 * (the unfiltered "All tasks" board falls back to this). Cached longer than tasks,
 * since statuses change rarely.
 */
export function useTaskStatuses(projectId?: string | null) {
  return useQuery({
    queryKey: ["task-statuses", projectId ?? "global"],
    queryFn: () => api.taskStatuses.list(projectId) as Promise<TaskStatus[]>,
    staleTime: 5 * 60_000,
  });
}

/** Every status write also moves tasks, so both caches are invalidated together. */
function useStatusInvalidation() {
  const queryClient = useQueryClient();
  return () => {
    // Prefix match — every project-scoped variant, not just this hook's own.
    queryClient.invalidateQueries({ queryKey: ["task-statuses"] });
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
  };
}

export function useCreateTaskStatus(projectId?: string | null) {
  const invalidate = useStatusInvalidation();
  return useMutation({
    mutationFn: (data: CreateTaskStatus) =>
      api.taskStatuses.create({
        ...data,
        ...(projectId ? { projectId } : {}),
      } as unknown as Record<string, unknown>) as Promise<TaskStatus>,
    onSuccess: (status) => {
      invalidate();
      toast.success(`Status "${status.name}" added`);
    },
    // The server's message names the rule that refused — a generic toast would lose it.
    onError: (error: Error) => toast.error(error.message || "Failed to add status"),
  });
}

/**
 * Renaming/recoloring/etc. a column shown as a project's fallback to the global set
 * forks it first — the same self-serve customization Luis asked for, invisible to the
 * menu that triggers it: it just calls this with the id it sees, same as always.
 */
async function forkedTargetId(
  queryClient: ReturnType<typeof useQueryClient>,
  projectId: string | null | undefined,
  id: string
): Promise<string> {
  if (!projectId) return id;
  const current = queryClient.getQueryData<TaskStatus[]>(["task-statuses", projectId]);
  const editing = current?.find((s) => s.id === id);
  if (!editing || editing.projectId) return id; // already project-owned, or unknown — leave as-is
  const forked = (await api.taskStatuses.fork(projectId)) as TaskStatus[];
  return forked.find((s) => s.name === editing.name)?.id ?? id;
}

export function useUpdateTaskStatus(projectId?: string | null) {
  const queryClient = useQueryClient();
  const invalidate = useStatusInvalidation();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateTaskStatus }) => {
      const targetId = await forkedTargetId(queryClient, projectId, id);
      return api.taskStatuses.update(targetId, data as unknown as Record<string, unknown>) as Promise<TaskStatus>;
    },
    onSuccess: () => invalidate(),
    onError: (error: Error) => toast.error(error.message || "Failed to update status"),
  });
}

export function useArchiveTaskStatus(projectId?: string | null) {
  const queryClient = useQueryClient();
  const invalidate = useStatusInvalidation();
  return useMutation({
    mutationFn: async ({ id, moveTo }: { id: string; moveTo?: string }) => {
      const targetId = await forkedTargetId(queryClient, projectId, id);
      return api.taskStatuses.archive(targetId, { moveTo });
    },
    onSuccess: (result) => {
      invalidate();
      toast.success(
        result.moved > 0
          ? `Status archived — ${result.moved} task${result.moved === 1 ? "" : "s"} moved`
          : "Status archived"
      );
    },
    onError: (error: Error) => toast.error(error.message || "Failed to archive status"),
  });
}
