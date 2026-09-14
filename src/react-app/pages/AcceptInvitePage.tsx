import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { workspacesQueryKey } from "@/hooks/useWorkspaces";
import { authClient } from "@/lib/auth-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function AcceptInvitePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, isLoading } = useAuth();
  // The id, not the user object: the session refetch after accepting must not re-run the accept.
  const userId = user?.id;
  const [status, setStatus] = useState<"pending" | "error">("pending");
  const [error, setError] = useState("");

  const invitationId = params.get("id");

  useEffect(() => {
    if (isLoading || !invitationId) return;

    if (!userId) {
      // Signing in creates the invited account, then the login page bounces back here.
      navigate(`/login?redirect=${encodeURIComponent(`/accept-invite?id=${invitationId}`)}`);
      return;
    }

    authClient.organization.acceptInvitation({ invitationId }).then(async ({ error: acceptError }) => {
      if (acceptError) {
        setStatus("error");
        setError(acceptError.message ?? "This invitation is invalid or has expired.");
        return;
      }
      await authClient.getSession({ query: { disableCookieCache: true } });
      // Accepting refreshes neither Better Auth's organization list nor the guard's workspace query.
      authClient.$store.notify("$listOrg");
      await queryClient.invalidateQueries({ queryKey: workspacesQueryKey });
      navigate("/");
    });
  }, [isLoading, userId, invitationId, navigate, queryClient]);

  if (!invitationId) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <p className="text-sm text-muted-foreground">Missing invitation.</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle as="h1" className="text-xl">Joining workspace…</CardTitle>
        </CardHeader>
        <CardContent>
          {status === "error" ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : (
            <p className="text-sm text-muted-foreground">Please wait a moment.</p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
