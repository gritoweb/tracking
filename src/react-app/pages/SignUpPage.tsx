import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { authClient } from "@/lib/auth-client";
import { BrandMark } from "@/components/brand/BrandMark";
import { INVITE_ONLY_MESSAGE, isInviteOnlyError } from "@shared/invite-only";
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

export function SignUpPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  // True once better-auth requires the person to click the verification email
  // before a session exists — dev/e2e sign in immediately instead (see auth.ts).
  const [awaitingVerification, setAwaitingVerification] = useState(false);

  useEffect(() => {
    if (user) navigate("/");
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      setError("Enter your name and email");
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }
    setError("");
    setPending(true);
    const { data, error: signUpError } = await authClient.signUp.email({
      name,
      email,
      password,
      callbackURL: "/",
    });
    setPending(false);
    if (signUpError) {
      setError(
        isInviteOnlyError(signUpError.code) ? INVITE_ONLY_MESSAGE : signUpError.message ?? "Failed to create account"
      );
      return;
    }
    // Prod requires email verification first (no session yet); dev/e2e sign in immediately —
    // the useEffect above then navigates once `user` catches up.
    if (!data?.token) setAwaitingVerification(true);
  };

  return (
    <CenteredPage>
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-2">
          <BrandMark className="h-9 w-9" />
          <span className="text-xl font-bold">Time Tracker</span>
        </div>

        <Card>
          <CardHeader className="space-y-1 pb-4">
            <CardTitle as="h1" className="text-xl">Create your account</CardTitle>
            <CardDescription>You'll need a pending invite to a workspace.</CardDescription>
          </CardHeader>
          <CardContent>
            {awaitingVerification ? (
              <p className="text-sm text-muted-foreground">
                Check {email} for a verification link, then come back and sign in.
              </p>
            ) : (
              <form className="space-y-3" noValidate onSubmit={handleSubmit}>
                <div className="space-y-1.5">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Jamie Rivera"
                    required
                    autoComplete="name"
                    autoFocus
                  />
                </div>
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
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <PasswordInput
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" className="w-full" disabled={pending}>
                  {pending ? "Creating…" : "Create account"}
                </Button>
              </form>
            )}
          </CardContent>
          <CardFooter className="pt-0">
            <p className="text-center text-sm text-muted-foreground w-full">
              Already have an account?{" "}
              <Link to="/login" className="underline underline-offset-4">
                Sign in
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </CenteredPage>
  );
}
