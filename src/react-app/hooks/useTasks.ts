import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Archive, ArchiveRestore } from "lucide-react";
import { api } from "@/lib/api-client";
import { announceAttachmentDeleted } from "@/lib/attachmentEvents";
import { toastApiError } from "@/lib/toastApiError";
import { useUIStore } from "@/stores/uiStore";
import { formatDueDate } from "@/lib/taskUtils";
import {
  describeRecurRule,
  nextOccurrence,
  todayLocalDate,
} from "@shared/task-recurrence";
import { BULK_TASK_IDS_MAX, BULK_UPDATE_ITEMS_MAX, type Task, type CreateTask, type TaskStatus, type UpdateTask, type BulkTaskAction, type BulkUpdateTasks } from "@shared/schemas";

// The API hides inactive (done) tasks unless asked, so every list here opts in:
// the Tasks page offers an All/Active/Done filter and a "Done" group, and without
// this the done tasks never arrive — marking one done made it vanish with no way
// to see it again, and the Done filter was permanently empty.
export function useTasks(projectId?: string | null) {
  return useQuery({
    queryKey: ["tasks", projectId ?? "all", "withDone"],
    queryFn: () =>
      api.tasks.list({
        ...(projectId ? { projectId } : {}),
        includeInactive: "true",
      }),
    staleTime: 30_000,
    enabled: projectId !== undefined, // allow null (returns all) but not skip entirely
  });
}

export function useAllTasks() {
  return useQuery({
    queryKey: ["tasks", "all", "withDone"],
    queryFn: () => api.tasks.list({ includeInactive: "true" }),
    staleTime: 30_000,
  });
}

/** Reports' task filter: every task, archived included, as a light list (no hour or count rollups). */
export function useTaskOptions() {
  return useQuery({
    queryKey: ["tasks", "options"],
    queryFn: () => api.tasks.options(),
    staleTime: 30_000,
  });
}

/** "Show archived": the archive alone, the `limit` most recently archived parents ("Load more" raises it). */
export function useArchivedTasks(enabled: boolean, limit: number) {
  return useQuery({
    queryKey: ["tasks", "archived", limit],
    queryFn: () => api.tasks.list({ includeInactive: "true", archivedOnly: "true", archiveLimit: String(limit) }),
    staleTime: 30_000,
    enabled,
    // Keeps the board on screen while the next step loads, instead of flashing the skeleton.
    placeholderData: (previous) => previous,
  });
}

/** One task by id — an archived one opened from a link, or an entry's archived task. */
export function useTask(id: string | null, enabled = true) {
  return useQuery({
    queryKey: ["tasks", "one", id],
    queryFn: () => api.tasks.get(id!),
    staleTime: 30_000,
    enabled: enabled && !!id,
    retry: false,
  });
}

/** A task's subtasks, archived ones included — an archived parent's list isn't in the live one. */
export function useSubtasks(parentId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["tasks", "subtasks", parentId],
    queryFn: () => api.tasks.list({ parentId: parentId!, includeInactive: "true", includeArchived: "true" }),
    staleTime: 30_000,
    enabled: enabled && !!parentId,
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateTask) => api.tasks.create(data),
    onSuccess: (task) => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] }); // updates trackedSeconds
      toast.success(`Task "${task.name}" created`);
    },
    onError: (error) => toastApiError(error, "Failed to create task"),
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTask; optimisticAssignees?: Task["assignees"] }) =>
      api.tasks.update(id, data),
    // Patch the cached lists first so a checkbox, a due chip or a drag settles
    // on the frame it was clicked. Every task list shares the ["tasks"] prefix,
    // so one pass covers the page, the rail and the in-project list.
    onMutate: async ({ id, data, optimisticAssignees }) => {
      await queryClient.cancelQueries({ queryKey: ["tasks"] });
      const snapshot = queryClient.getQueriesData<Task[]>({ queryKey: ["tasks"] });
      queryClient.setQueriesData<Task[]>({ queryKey: ["tasks"] }, (old) =>
        old?.map((t) => {
          if (t.id === id) {
            return {
              ...t,
              ...(data.name !== undefined ? { name: data.name } : {}),
              ...(data.active !== undefined ? { active: data.active } : {}),
              ...(data.dueDate !== undefined ? { dueDate: data.dueDate } : {}),
              ...(data.priority !== undefined ? { priority: data.priority } : {}),
              ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
              ...(data.statusId !== undefined ? { statusId: data.statusId } : {}),
              ...(data.estimatedSeconds !== undefined
                ? { estimatedSeconds: data.estimatedSeconds }
                : {}),
              // Resolved client-side (the mutation only sends ids) — undefined skips the patch entirely.
              ...(optimisticAssignees !== undefined ? { assignees: optimisticAssignees } : {}),
            };
          }
          // Ticking a parent ticks its children server-side; mirror that here or
          // the subtask rows stay open until the refetch lands.
          if (data.active !== undefined && t.parentId === id) {
            return { ...t, active: data.active };
          }
          return t;
        })
      );
      return { snapshot };
    },
    onError: (err, _vars, context) => {
      for (const [key, data] of context?.snapshot ?? []) {
        queryClient.setQueryData(key, data);
      }
      toastApiError(err, "Failed to update task");
    },
    onSettled: (_data, _error, { id, data }) => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      // A change to the task is a new line in its comments feed.
      queryClient.invalidateQueries({ queryKey: ["task-activity"] });
      // A file taken out of the description leaves the task's Attachments too.
      if (data.description !== undefined) queryClient.invalidateQueries({ queryKey: ["task-attachments", id] });
    },
  });
}

/** Commit a board drop — takes the whole target status, not just its id, so the optimistic patch can repaint the card fully. */
export function useMoveTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, boardOrder }: { id: string; status: TaskStatus; boardOrder: number }) =>
      api.tasks.move(id, {
        statusId: status.id,
        boardOrder,
        completedOn: todayLocalDate(),
      }),
    onMutate: async ({ id, status, boardOrder }) => {
      await queryClient.cancelQueries({ queryKey: ["tasks"] });
      const snapshot = queryClient.getQueriesData<Task[]>({ queryKey: ["tasks"] });
      const done = status.category === "completed";
      const patch = (t: Task): Task => ({
        ...t,
        statusId: status.id,
        statusName: status.name,
        statusColor: status.color,
        statusCategory: status.category,
        active: !done,
        completedAt: done ? (t.completedAt ?? new Date().toISOString()) : null,
      });
      queryClient.setQueriesData<Task[]>({ queryKey: ["tasks"] }, (old) =>
        old?.map((t) => {
          if (t.id === id) return { ...patch(t), boardOrder };
          // A parent's children follow it server-side; mirror that so rows don't contradict.
          if (t.parentId === id) return patch(t);
          return t;
        })
      );
      return { snapshot };
    },
    onError: (err, _vars, context) => {
      for (const [key, data] of context?.snapshot ?? []) {
        queryClient.setQueryData(key, data);
      }
      toastApiError(err, "Failed to move task");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      // A change to the task is a new line in its comments feed.
      queryClient.invalidateQueries({ queryKey: ["task-activity"] });
    },
  });
}

/**
 * Tick a task done (or reopen it), and close the loop back to tracked time.
 *
 * Two things happen here that a bare `active: false` can't do:
 *
 * 1. It sends `completedOn` — the browser's own local date — which is what the
 *    worker measures the next recurrence from. The worker runs in UTC and must
 *    never derive "the next weekday" from its own clock.
 * 2. A task completed with **no tracked time at all** raises a toast offering to
 *    log it. A done task with zero hours is the failure mode this whole feature
 *    exists to prevent, and it is invisible everywhere else in the app. It's a
 *    toast rather than a dialog on purpose: the common case is that you already
 *    tracked the time, and that case must cost nothing.
 */
export function useCompleteTask() {
  const update = useUpdateTask();
  const openTaskLogTime = useUIStore((s) => s.openTaskLogTime);

  return (task: Task, done: boolean) => {
    update.mutate(
      {
        id: task.id,
        data: done ? { active: false, completedOn: todayLocalDate() } : { active: true },
      },
      {
        onSuccess: () => {
          if (!done) return;

          if (task.recurRule) {
            const due = nextOccurrence(task.recurRule, todayLocalDate());
            toast.success(`${task.name} — done`, {
              description: due
                ? `${describeRecurRule(task.recurRule)}. Next due ${formatDueDate(due)}.`
                : undefined,
            });
            return;
          }

          if (task.trackedSeconds === 0) {
            toast(`${task.name} — done`, {
              description: "No time is tracked against this task.",
              action: { label: "Log time", onClick: () => openTaskLogTime(task.id) },
            });
          }
        },
      }
    );
  };
}

export function useTaskAttachments(taskId: string | null) {
  return useQuery({
    queryKey: ["task-attachments", taskId],
    queryFn: () => api.tasks.attachments.list(taskId!),
    enabled: !!taskId,
    staleTime: 30_000,
  });
}

export function useUploadTaskAttachment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, file }: { taskId: string; file: File }) =>
      api.tasks.attachments.upload(taskId, file),
    onSuccess: (_result, { taskId }) => {
      queryClient.invalidateQueries({ queryKey: ["task-attachments", taskId] });
    },
    onError: (error) => toastApiError(error, "Failed to upload file"),
  });
}

export function useDeleteTaskAttachment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { taskId: string; id: string }) => api.tasks.attachments.delete(id),
    onSuccess: (_result, { taskId, id }) => {
      queryClient.invalidateQueries({ queryKey: ["task-attachments", taskId] });
      // The server also took the file out of the description and comments that showed it; open editors drop it too.
      announceAttachmentDeleted(id);
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["task-comments", taskId] });
    },
    onError: (error) => toastApiError(error, "Failed to delete attachment"),
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.tasks.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Task deleted");
    },
    onError: (error) => toastApiError(error, "Failed to delete task"),
  });
}

const BULK_DONE: Record<BulkTaskAction["action"], string> = { archive: "archived", unarchive: "unarchived", delete: "deleted" };
const plural = (n: number) => `${n} task${n === 1 ? "" : "s"}`;

/** Archive, unarchive or delete a selection — the server refuses the whole batch if one task isn't the person's to change. */
export function useBulkTaskAction() {
  const queryClient = useQueryClient();
  return useMutation({
    // "Archive all tasks" on a long column can pass the server's cap: consecutive requests, each still all or nothing.
    mutationFn: async ({ ids, action }: BulkTaskAction) => {
      for (let i = 0; i < ids.length; i += BULK_TASK_IDS_MAX) await api.tasks.bulk({ ids: ids.slice(i, i + BULK_TASK_IDS_MAX), action });
    },
    onSuccess: (_data, { action, ids }) => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["task-activity"] });
      toast.success(`${plural(ids.length)} ${BULK_DONE[action]}`);
    },
    onError: (error) => toastApiError(error, "Couldn't change those tasks"),
  });
}

/** Status, assignees, dates… over a selection; each item succeeds or fails on its own. */
export function useBulkUpdateTasks() {
  const queryClient = useQueryClient();
  return useMutation({
    // A bigger selection goes in consecutive requests of the server's cap, reported as one.
    mutationFn: async (body: BulkUpdateTasks) => {
      const results: Awaited<ReturnType<typeof api.tasks.bulkUpdate>>["results"] = [];
      for (let i = 0; i < body.items.length; i += BULK_UPDATE_ITEMS_MAX) {
        results.push(...(await api.tasks.bulkUpdate({ items: body.items.slice(i, i + BULK_UPDATE_ITEMS_MAX) })).results);
      }
      return { results, updated: results.filter((r) => r.ok).length };
    },
    onSuccess: ({ results, updated }) => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["task-activity"] });
      const failed = results.filter((r) => !r.ok);
      if (!failed.length) toast.success(`${plural(updated)} updated`);
      else toast.error(`${plural(updated)} updated, ${failed.length} not changed: ${failed[0].error}`);
    },
    onError: (error) => toastApiError(error, "Couldn't update those tasks"),
  });
}

/** One task's Archive/Unarchive as every menu shows it: label, icon and action, from its archived state. */
export function useArchiveToggle() {
  const bulk = useBulkTaskAction();
  return (task: Pick<Task, "id" | "archivedAt">) => ({
    label: task.archivedAt ? "Unarchive" : "Archive",
    icon: task.archivedAt ? ArchiveRestore : Archive,
    run: () => bulk.mutate({ ids: [task.id], action: task.archivedAt ? "unarchive" : "archive" }),
  });
}
