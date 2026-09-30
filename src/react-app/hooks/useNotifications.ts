import { useEffect } from "react";
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

/** While a task is open in a visible tab, its notifications count as read — also those that arrive while it is open (so Slack never repeats them). */
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

  useEffect(() => {
    if (!open || !taskId || !unreadHere) return;
    const read = () => {
      if (document.visibilityState === "visible") mutate(taskId);
    };
    read();
    document.addEventListener("visibilitychange", read);
    return () => document.removeEventListener("visibilitychange", read);
  }, [open, taskId, unreadHere, mutate]);
}
