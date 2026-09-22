import { KeyRound } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { GoogleMark } from "@/components/brand/GoogleMark";

interface LoginFormCardProps {
  email: string;
  onEmailChange: (value: string) => void;
  password: string;
  onPasswordChange: (value: string) => void;
  usePassword: boolean;
  onToggleUsePassword: () => void;
  code: string;
  onCodeChange: (value: string) => void;
  codeSent: boolean;
  linkSent: boolean;
  pending: boolean;
  passkeyPending: boolean;
  error: string;
  onGoogleSignIn: () => void;
  onPasskeySignIn: () => void;
  onSendMagicLink: () => void;
  onSubmit: () => void;
}

/** Pure view for the login card — all state and network calls live in LoginPage. */
export function LoginFormCard({
  email,
  onEmailChange,
  password,
  onPasswordChange,
  usePassword,
  onToggleUsePassword,
  code,
  onCodeChange,
  codeSent,
  linkSent,
  pending,
  passkeyPending,
  error,
  onGoogleSignIn,
  onPasskeySignIn,
  onSendMagicLink,
  onSubmit,
}: LoginFormCardProps) {
  return (
    <Card>
      <CardHeader className="space-y-1 pb-4">
        <CardTitle as="h1" className="text-xl">Welcome back, clock-watcher</CardTitle>
        <CardDescription>
          Those billable hours won't track themselves. Sign in and let's
          make time accountable.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <Button type="button" variant="outline" className="w-full gap-2" onClick={onGoogleSignIn}>
          <GoogleMark />
          Continue with Google
        </Button>

        <Button
          type="button"
          variant="outline"
          className="w-full gap-2"
          onClick={onPasskeySignIn}
          disabled={passkeyPending}
        >
          <KeyRound className="h-4 w-4" />
          {passkeyPending ? "Waiting for passkey…" : "Sign in with a passkey"}
        </Button>

        <div className="flex items-center gap-2">
          <Separator className="flex-1" />
          <span className="text-xs text-muted-foreground">or</span>
          <Separator className="flex-1" />
        </div>

        <form
          className="space-y-3"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => onEmailChange(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
            />
          </div>

          {usePassword ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link
                  to="/reset-password"
                  className="text-xs text-muted-foreground underline underline-offset-4"
                >
                  Forgot password?
                </Link>
              </div>
              <PasswordInput
                id="password"
                value={password}
                onChange={(e) => onPasswordChange(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                autoFocus
              />
            </div>
          ) : null}

          {codeSent && !usePassword ? (
            <div className="space-y-1.5">
              <Label htmlFor="otp">6-digit code</Label>
              <Input
                id="otp"
                inputMode="numeric"
                value={code}
                onChange={(e) => onCodeChange(e.target.value)}
                placeholder="123456"
                autoComplete="one-time-code"
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                We emailed a code to {email}.
              </p>
            </div>
          ) : null}

          {error && <p className="text-sm text-destructive">{error}</p>}
          {linkSent && (
            <p className="text-sm text-muted-foreground">
              Magic link deployed. Check your inbox — no password
              memorization required.
            </p>
          )}

          {usePassword ? (
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Signing in…" : "Sign in"}
            </Button>
          ) : codeSent ? (
            <Button type="submit" className="w-full" disabled={pending || !code.trim()}>
              {pending ? "Verifying…" : "Verify code"}
            </Button>
          ) : (
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Sending…" : "Email me a code"}
            </Button>
          )}

          {!usePassword && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground"
              disabled={pending}
              onClick={onSendMagicLink}
            >
              Or send me a magic link instead
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full text-muted-foreground"
            disabled={pending}
            onClick={onToggleUsePassword}
          >
            {usePassword ? "Use email code instead" : "Sign in with password instead"}
          </Button>
        </form>
      </CardContent>

      <CardFooter className="flex flex-col gap-3 pt-0">
        <p className="text-center text-sm text-muted-foreground">
          New here?{" "}
          <Link to="/sign-up" className="underline underline-offset-4">
            Create an account
          </Link>
        </p>
        <p className="text-center text-xs text-muted-foreground">
          Access is by invitation only — you'll need a pending invite to a workspace.
        </p>
      </CardFooter>
    </Card>
  );
}
