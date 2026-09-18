import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { useAuth } from "@/hooks/useAuth";
import type { CreateTaskComment, TaskComment, UpdateTaskComment } from "@shared/schemas";

export const PENDING_COMMENT_PREFIX = "pending-";

/** What the composer sends: the API payload plus the image URL the optimistic row needs to show it. */
export type NewTaskComment = CreateTaskComment & { attachmentUrl?: string | null };

/** Flat, single-level comments on one task — no reply/thread. */
export function useTaskComments(taskId: string | null) {
  return useQuery({
    queryKey: ["task-comments", taskId],
    queryFn: () => api.tasks.comments.list(taskId as string),
    enabled: !!taskId,
  });
}

/** What changed on the task (status, due date, priority, assignees), shown between its comments. */
export function useTaskActivity(taskId: string | null) {
  return useQuery({
    queryKey: ["task-activity", taskId],
    queryFn: () => api.tasks.activity(taskId as string),
    enabled: !!taskId,
  });
}

function useCommentInvalidation(taskId: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["task-comments", taskId] });
}

export function useCreateTaskComment(taskId: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const key = ["task-comments", taskId];
  return useMutation({
    mutationFn: ({ body, mentionedUserIds, attachmentId }: NewTaskComment) =>
      api.tasks.comments.create(taskId, { body, mentionedUserIds, attachmentId }),
    // The comment shows up the instant it is sent; the server's row replaces it on settle.
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<TaskComment[]>(key);
      const pending: TaskComment = {
        id: `${PENDING_COMMENT_PREFIX}${crypto.randomUUID()}`,
        taskId,
        userId: user?.id ?? "",
        userName: user?.name ?? "",
        userImage: user?.image ?? null,
        body: data.body,
        mentionedUserIds: data.mentionedUserIds ?? [],
        attachmentId: data.attachmentId ?? null,
        attachmentUrl: data.attachmentUrl ?? null,
        attachmentFilename: null,
        createdAt: new Date().toISOString(),
        editedAt: null,
      };
      queryClient.setQueryData<TaskComment[]>(key, (old = []) => [...old, pending]);
      return { previous };
    },
    // The composer owns the message (it has the text to put back), so only the cache rolls back here.
    onError: (_error: Error, _data, context) => queryClient.setQueryData(key, context?.previous),
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
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
