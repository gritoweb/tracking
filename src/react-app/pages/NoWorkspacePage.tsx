import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/hooks/useAuth";
import { workspacesQueryKey } from "@/hooks/useWorkspaces";
import { authClient } from "@/lib/auth-client";

// Better Auth lists invitations only for a verified address; a code sign-in verifies it.
const VERIFICATION_REQUIRED = "EMAIL_VERIFICATION_REQUIRED_FOR_INVITATION";

export function NoWorkspacePage() {
  const { user, signOut } = useAuth();
  const queryClient = useQueryClient();
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [joinError, setJoinError] = useState("");

  const { data, isPending, error: listError, refetch } = useQuery({
    queryKey: ["user-invitations", user?.id],
    queryFn: async () => {
      const { data: invitations, error } = await authClient.organization.listUserInvitations();
      if (error?.code === VERIFICATION_REQUIRED) return { invitations: [], needsVerification: true };
      if (error) throw new Error(error.message ?? "Couldn't load your invitations");
      const now = Date.now();
      return {
        invitations: (invitations ?? []).filter(
          (invitation) =>
            invitation.status === "pending" && new Date(invitation.expiresAt).getTime() > now
        ),
        needsVerification: false,
      };
    },
    retry: false,
  });

  const handleJoin = async (invitationId: string) => {
    setJoiningId(invitationId);
    setJoinError("");
    const { error } = await authClient.organization.acceptInvitation({ invitationId });
    if (error) {
      setJoiningId(null);
      setJoinError(error.message ?? "This invitation is invalid or has expired.");
      void refetch();
      return;
    }
    await authClient.getSession({ query: { disableCookieCache: true } });
    authClient.$store.notify("$listOrg");
    await queryClient.invalidateQueries({ queryKey: workspacesQueryKey });
  };

  const invitations = data?.invitations ?? [];

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-1">
          <CardTitle as="h1" className="text-xl">
            You're not in a workspace yet
          </CardTitle>
          <CardDescription>
            Access is by invitation only. Join a workspace that invited{" "}
            <span className="wrap-anywhere">{user?.email}</span>, or ask a workspace admin to send
            an invitation.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          {isPending ? (
            <Skeleton className="h-9 w-full" />
          ) : data?.needsVerification ? (
            <p className="text-sm text-muted-foreground">
              Confirm this address first: sign out, then sign in with an email code to see your
              invitations.
            </p>
          ) : listError ? (
            <p className="text-sm text-destructive">{listError.message}</p>
          ) : invitations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending invitations for this email.</p>
          ) : (
            <ul className="space-y-2">
              {invitations.map((invitation) => (
                <li key={invitation.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate font-medium">
                    {invitation.organizationName ?? "Workspace"}
                  </span>
                  <Button
                    size="sm"
                    className="gap-2"
                    disabled={joiningId !== null}
                    onClick={() => void handleJoin(invitation.id)}
                  >
                    {joiningId === invitation.id && <Spinner size="sm" />}
                    Join
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {joinError && <p className="text-sm text-destructive">{joinError}</p>}
        </CardContent>

        <CardFooter>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full text-muted-foreground"
            onClick={() => void signOut()}
          >
            Sign out
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
