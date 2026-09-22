import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { authClient } from "@/lib/auth-client";
import { BrandMark } from "@/components/brand/BrandMark";
import { CenteredPage } from "@/components/layout/CenteredPage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

const MIN_PASSWORD_LENGTH = 8;

/** Step 1: no token yet — collect the email and ask better-auth to send the reset link. */
function RequestResetCard() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError("Enter your email first");
      return;
    }
    setError("");
    setPending(true);
    const { error: requestError } = await authClient.requestPasswordReset({
      email,
      redirectTo: "/reset-password",
    });
    setPending(false);
    if (requestError) {
      setError(requestError.message ?? "Failed to send the reset link");
      return;
    }
    setSent(true);
  };

  return (
    <Card>
      <CardHeader className="space-y-1 pb-4">
        <CardTitle as="h1" className="text-xl">Reset your password</CardTitle>
        <CardDescription>
          Enter your email and we'll send a link to set a new password.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sent ? (
          <p className="text-sm text-muted-foreground">
            If that email has an account, a reset link is on its way. Check your inbox.
          </p>
        ) : (
          <form className="space-y-3" noValidate onSubmit={handleSubmit}>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
                autoFocus
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Sending…" : "Send reset link"}
            </Button>
          </form>
        )}
      </CardContent>
      <CardFooter className="pt-0">
        <Link to="/login" className="text-sm text-muted-foreground underline underline-offset-4">
          Back to sign in
        </Link>
      </CardFooter>
    </Card>
  );
}

/** Step 2: token present — better-auth's redirect callback appended it after validating the link. */
function SetNewPasswordCard({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

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
    const { error: resetError } = await authClient.resetPassword({ newPassword: password, token });
    setPending(false);
    if (resetError) {
      setError(resetError.message ?? "This reset link is invalid or has expired");
      return;
    }
    setDone(true);
  };

  return (
    <Card>
      <CardHeader className="space-y-1 pb-4">
        <CardTitle as="h1" className="text-xl">Choose a new password</CardTitle>
        {!done && <CardDescription>At least {MIN_PASSWORD_LENGTH} characters.</CardDescription>}
      </CardHeader>
      <CardContent>
        {done ? (
          <p className="text-sm text-muted-foreground">
            Password updated. You can sign in with it now.
          </p>
        ) : (
          <form className="space-y-3" noValidate onSubmit={handleSubmit}>
            <div className="space-y-1.5">
              <Label htmlFor="password">New password</Label>
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
              {pending ? "Saving…" : "Save new password"}
            </Button>
          </form>
        )}
      </CardContent>
      <CardFooter className="pt-0">
        <Link to="/login" className="text-sm text-muted-foreground underline underline-offset-4">
          Back to sign in
        </Link>
      </CardFooter>
    </Card>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token");

  return (
    <CenteredPage>
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-2">
          <BrandMark className="h-9 w-9" />
          <span className="text-xl font-bold">Time Tracker</span>
        </div>
        {token ? <SetNewPasswordCard token={token} /> : <RequestResetCard />}
      </div>
    </CenteredPage>
  );
}
