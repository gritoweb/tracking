import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { taskPath } from "@shared/task-links";
import { api } from "@/lib/api-client";

/** The bell's own list — polls every 60s (paused while the tab is hidden), the live socket just makes it feel instant. */
export function useNotifications() {
  return useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.notifications.list(),
    refetchInterval: 60_000,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.notifications.markRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.notifications.markAllRead(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useDeleteNotification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.notifications.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useClearAllNotifications() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.notifications.clearAll(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

/** Opening a task reads the notifications it already has; one that arrives while it stays open waits for a click or a reopen. */
export function useReadTaskNotifications(taskId: string | null, open: boolean) {
  const queryClient = useQueryClient();
  const { data } = useNotifications();
  const { mutate } = useMutation({
    mutationFn: (id: string) => api.notifications.markTaskRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const path = taskId ? taskPath(taskId) : null;
  const unreadHere =
    !!path && (data?.notifications ?? []).some((n) => !n.isRead && (n.link === path || n.link?.startsWith(`${path}/`)));

  // The task this open has already read; cleared on close, so reopening reads again.
  const readFor = useRef<string | null>(null);

  useEffect(() => {
    if (!open || !taskId) {
      readFor.current = null;
      return;
    }
    if (readFor.current === taskId || !data) return;
    readFor.current = taskId;
    if (unreadHere) mutate(taskId);
  }, [open, taskId, data, unreadHere, mutate]);
}
