import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { useAuth } from "@/hooks/useAuth";

/** The caller's role in the active workspace; `canManage` stays false until known, so manager-only UI never flashes. */
export function useWorkspaceRole() {
  const { user, session } = useAuth();
  const query = useQuery({
    queryKey: ["me", user?.id, session?.activeOrganizationId ?? null],
    queryFn: () => api.me(),
    enabled: Boolean(user),
    staleTime: 60_000,
  });
  return {
    role: query.data?.role ?? null,
    canManage: query.data?.canManage ?? false,
    isLoading: query.isPending,
  };
}

export interface WorkspaceMember {
  userId: string;
  name: string;
  email: string;
}

/** Members of the active workspace, for the owner/admin-only Person filter. */
export function useWorkspaceMembers(enabled: boolean) {
  const { session } = useAuth();
  const organizationId = session?.activeOrganizationId ?? undefined;
  return useQuery({
    queryKey: ["workspace-members", organizationId ?? "active"],
    queryFn: async (): Promise<WorkspaceMember[]> => {
      const { data } = await authClient.organization.getFullOrganization({
        query: { organizationId },
      });
      return (data?.members ?? []).map((m) => ({
        userId: m.userId,
        name: m.user?.name || m.user?.email || "Unknown",
        email: m.user?.email ?? "",
      }));
    },
    enabled,
    staleTime: 60_000,
  });
}
