import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { workspacesQueryKey } from "@/hooks/useWorkspaces";
import { authClient } from "@/lib/auth-client";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CenteredPage } from "@/components/layout/CenteredPage";

const MIN_PASSWORD_LENGTH = 8;

/**
 * Offered once, right after accepting an invite that came in over a
 * passwordless magic link: the person is signed in but has no password yet.
 * Setting one here means they know it, so Google or a password both work
 * later — skippable, since Google/magic-link/OTP remain first-class.
 */
function SetPasswordCard({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match");
      return;
    }
    setError("");
    setPending(true);
    try {
      await api.settings.setPassword(password);
      onDone();
    } catch (err) {
      setPending(false);
      setError(err instanceof ApiError ? err.message : "Failed to set password");
    }
  };

  return (
    <Card>
      <CardHeader className="space-y-1 pb-4">
        <CardTitle as="h1" className="text-xl">You're in — set a password?</CardTitle>
        <CardDescription>
          Optional: add a password so you can also sign in without Google or an email code.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-3" noValidate onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <PasswordInput
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm">Confirm password</Label>
            <PasswordInput
              id="confirm"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Saving…" : "Set password"}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="pt-0">
        <Button type="button" variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={onDone}>
          Skip for now
        </Button>
      </CardFooter>
    </Card>
  );
}

export function AcceptInvitePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, isLoading } = useAuth();
  // The id, not the user object: the session refetch after accepting must not re-run the accept.
  const userId = user?.id;
  const [status, setStatus] = useState<"pending" | "error" | "set-password">("pending");
  const [error, setError] = useState("");

  const invitationId = params.get("id");

  useEffect(() => {
    if (isLoading || !invitationId) return;

    if (!userId) {
      // Signing in creates the invited account, then the login page bounces back here.
      // (The invite email itself is now a magic link, so this path only fires for a
      // stale email sent before that change, or a link opened in a different browser.)
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
      setStatus("set-password");
    });
  }, [isLoading, userId, invitationId, navigate, queryClient]);

  if (!invitationId) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <p className="text-sm text-muted-foreground">Missing invitation.</p>
      </main>
    );
  }

  if (status === "set-password") {
    return (
      <CenteredPage>
        <div className="w-full max-w-sm">
          <SetPasswordCard onDone={() => navigate("/")} />
        </div>
      </CenteredPage>
    );
  }

  return (
    <CenteredPage>
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
    </CenteredPage>
  );
}
