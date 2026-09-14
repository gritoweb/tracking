import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspaces } from "@/hooks/useWorkspaces";
import { Skeleton } from "@/components/ui/skeleton";
import { NoWorkspacePage } from "@/pages/NoWorkspacePage";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const { data: workspaces, isPending: workspacesPending } = useWorkspaces(user?.id);

  if (isLoading || (user && workspacesPending)) {
    return (
      <div className="flex h-screen items-center justify-center p-8">
        <div className="w-full max-w-sm space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-3/4" />
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // An invitee has no workspace until they accept, and every workspace API would 404 without one.
  if (workspaces?.length === 0) {
    return <NoWorkspacePage />;
  }

  return <>{children}</>;
}
