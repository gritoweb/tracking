import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { CreateTaskStatus, TaskStatus, UpdateTaskStatus } from "@shared/schemas";

/** The board's columns — cached longer than tasks, since statuses change rarely. */
export function useTaskStatuses() {
  return useQuery({
    queryKey: ["task-statuses"],
    queryFn: () => api.taskStatuses.list() as Promise<TaskStatus[]>,
    staleTime: 5 * 60_000,
  });
}

/** Every status write also moves tasks, so both caches are invalidated together. */
function useStatusInvalidation() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["task-statuses"] });
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
  };
}

export function useCreateTaskStatus() {
  const invalidate = useStatusInvalidation();
  return useMutation({
    mutationFn: (data: CreateTaskStatus) =>
      api.taskStatuses.create(data as unknown as Record<string, unknown>) as Promise<TaskStatus>,
    onSuccess: (status) => {
      invalidate();
      toast.success(`Status "${status.name}" added`);
    },
    // The server's message names the rule that refused — a generic toast would lose it.
    onError: (error: Error) => toast.error(error.message || "Failed to add status"),
  });
}

export function useUpdateTaskStatus() {
  const invalidate = useStatusInvalidation();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTaskStatus }) =>
      api.taskStatuses.update(id, data as unknown as Record<string, unknown>) as Promise<TaskStatus>,
    onSuccess: () => invalidate(),
    onError: (error: Error) => toast.error(error.message || "Failed to update status"),
  });
}

export function useArchiveTaskStatus() {
  const invalidate = useStatusInvalidation();
  return useMutation({
    mutationFn: ({ id, moveTo }: { id: string; moveTo?: string }) =>
      api.taskStatuses.archive(id, { moveTo }),
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
