import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import type { CreateTaskComment, UpdateTaskComment } from "@shared/schemas";

/** Flat, single-level comments on one task — no reply/thread. */
export function useTaskComments(taskId: string | null) {
  return useQuery({
    queryKey: ["task-comments", taskId],
    queryFn: () => api.tasks.comments.list(taskId as string),
    enabled: !!taskId,
  });
}

function useCommentInvalidation(taskId: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["task-comments", taskId] });
}

export function useCreateTaskComment(taskId: string) {
  const invalidate = useCommentInvalidation(taskId);
  return useMutation({
    mutationFn: (data: CreateTaskComment) => api.tasks.comments.create(taskId, data),
    onSuccess: () => invalidate(),
    onError: (error: Error) => toast.error(error.message || "Failed to post comment"),
  });
}

export function useUpdateTaskComment(taskId: string) {
  const invalidate = useCommentInvalidation(taskId);
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTaskComment }) =>
      api.tasks.comments.update(taskId, id, data),
    onSuccess: () => invalidate(),
    onError: (error: Error) => toast.error(error.message || "Failed to edit comment"),
  });
}

export function useDeleteTaskComment(taskId: string) {
  const invalidate = useCommentInvalidation(taskId);
  return useMutation({
    mutationFn: (id: string) => api.tasks.comments.delete(taskId, id),
    onSuccess: () => invalidate(),
    onError: (error: Error) => toast.error(error.message || "Failed to delete comment"),
  });
}
