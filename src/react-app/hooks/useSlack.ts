import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { toastApiError } from "@/lib/toastApiError";

/** The workspace's Slack installation plus the caller's own delivery preference. */
export function useSlackStatus() {
  return useQuery({
    queryKey: ["slack", "status"],
    queryFn: () => api.slack.status(),
    staleTime: 30_000,
  });
}

export function useSetSlackNotify() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (notify: boolean) => api.slack.setNotify(notify),
    onSuccess: (_data, notify) => {
      queryClient.invalidateQueries({ queryKey: ["slack", "status"] });
      toast.success(notify ? "Unread notifications will reach you on Slack" : "Slack notifications turned off");
    },
    onError: (error) => toastApiError(error, "Failed to update Slack notifications"),
  });
}

export function useSendSlackTest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.slack.sendTest(),
    onSuccess: () => toast.success("Test message sent — check your Slack DMs"),
    onError: (error) => toastApiError(error, "Couldn't send the test message"),
    // The test resolves the email match either way, so the "not found" hint can appear.
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["slack", "status"] }),
  });
}

export function useDisconnectSlack() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.slack.disconnect(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["slack", "status"] });
      toast.success("Slack disconnected");
    },
    onError: (error) => toastApiError(error, "Failed to disconnect Slack"),
  });
}
