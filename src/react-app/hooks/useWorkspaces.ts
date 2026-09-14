import { useQuery } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";

export const workspacesQueryKey = ["workspaces"] as const;

/** The signed-in user's workspaces, keyed by user so a different account in the same tab never reuses them. */
export function useWorkspaces(userId: string | undefined) {
  return useQuery({
    queryKey: [...workspacesQueryKey, userId],
    queryFn: async () => {
      const { data, error } = await authClient.organization.list();
      if (error) throw new Error(error.message ?? "Couldn't load workspaces");
      return data ?? [];
    },
    enabled: Boolean(userId),
  });
}
