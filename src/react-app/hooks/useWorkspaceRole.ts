import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
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
    /** Live co-editing of descriptions; false until the server says the deploy turned it on. */
    collabDescriptions: query.data?.features.collabDescriptions ?? false,
    isLoading: query.isPending,
  };
}

export interface WorkspaceMember {
  userId: string;
  name: string;
  email: string;
  image: string | null;
  /** "owner", "admin" or "member" (Better Auth may join several with commas). */
  role: string;
}

/** Members of the active workspace (D3 Person filter, D6 assignee picker) — via `/api/me`, not `session.activeOrganizationId`, which a brand-new signup's first session never gets seeded with (see CHANGELOG). */
export function useWorkspaceMembers(enabled: boolean) {
  const { user } = useAuth();
  const me = useQuery({
    queryKey: ["me", user?.id],
    queryFn: () => api.me(),
    enabled: enabled && Boolean(user),
    staleTime: 60_000,
  });
  const workspaceId = me.data?.workspaceId;
  return useQuery({
    queryKey: ["workspace-members", workspaceId ?? "pending"],
    queryFn: async (): Promise<WorkspaceMember[]> => {
      const { data } = await authClient.organization.getFullOrganization({
        query: { organizationId: workspaceId },
      });
      return (data?.members ?? []).map((m) => ({
        userId: m.userId,
        name: m.user?.name || m.user?.email || "Unknown",
        email: m.user?.email ?? "",
        image: m.user?.image ?? null,
        role: m.role ?? "member",
      }));
    },
    enabled: enabled && Boolean(workspaceId),
    staleTime: 60_000,
  });
}
