import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { authClient } from "@/lib/auth-client";
import { BrandMark } from "@/components/brand/BrandMark";
import { INVITE_ONLY_MESSAGE, isInviteOnlyError } from "@shared/invite-only";
import { LoginFormCard } from "./LoginFormCard";

/** Same-origin path to return to after sign-in; anything else falls back to the app root. */
function safeRedirect(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/";
  // Returning to the login page itself would strand a signed-in user on it.
  if (value === "/login" || value.startsWith("/login?")) return "/";
  return value;
}

function errorFromRedirect(code: string | null): string {
  if (!code) return "";
  if (isInviteOnlyError(code)) return INVITE_ONLY_MESSAGE;
  if (code === "account_not_linked") {
    return "An account with this email already exists but isn't linked to Google yet. Sign in with an email code or magic link to continue.";
  }
  return "Sign-in failed. Please try again.";
}

export function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const redirect = safeRedirect(params.get("redirect"));
  // OAuth and magic-link failures come back here, keeping the invite link's destination.
  const errorCallbackURL = redirect === "/" ? "/login" : `/login?redirect=${encodeURIComponent(redirect)}`;
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [error, setError] = useState(() => errorFromRedirect(params.get("error")));

  // — Passwordless (email code / magic link) state
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [linkSent, setLinkSent] = useState(false);
  const [pending, setPending] = useState(false);

  const [password, setPassword] = useState("");
  const [usePassword, setUsePassword] = useState(true);

  // — Passkey state
  const [passkeyPending, setPasskeyPending] = useState(false);

  // Navigate only once the shared session store has actually caught up —
  // navigating right after a sign-in call resolves races AuthGuard's
  // useSession(), which can still read the stale "logged out" cache for a tick.
  useEffect(() => {
    if (user) navigate(redirect);
  }, [user, redirect, navigate]);

  const handlePasskeySignIn = async () => {
    setError("");
    setPasskeyPending(true);
    const res = await authClient.signIn.passkey();
    setPasskeyPending(false);
    if (res?.error) {
      setError(res.error.message ?? "Passkey sign-in failed");
    }
    // On success, the useEffect above navigates once `user` updates.
  };

  const handleGoogleSignIn = () => {
    authClient.signIn.social({ provider: "google", callbackURL: redirect, errorCallbackURL });
  };

  const handleSendCode = async () => {
    if (!email.trim()) {
      setError("Enter your email first");
      return;
    }
    setError("");
    setPending(true);
    const { error: sendError } = await authClient.emailOtp.sendVerificationOtp({
      email,
      type: "sign-in",
    });
    setPending(false);
    if (sendError) {
      setError(sendError.message ?? "Failed to send code");
      return;
    }
    setCodeSent(true);
  };

  const handleVerifyCode = async () => {
    if (!code.trim()) return;
    setError("");
    setPending(true);
    const { error: verifyError } = await authClient.signIn.emailOtp({ email, otp: code });
    setPending(false);
    if (verifyError) {
      setError(verifyError.message ?? "Invalid or expired code");
      return;
    }
    // The useEffect above navigates once `user` updates.
  };

  const handlePasswordSignIn = async () => {
    if (!email.trim() || !password.trim()) {
      setError("Enter email and password");
      return;
    }
    setError("");
    setPending(true);
    const { error: signInError } = await authClient.signIn.email({ email, password });
    setPending(false);
    if (signInError) {
      setError(signInError.message ?? "Invalid email or password");
      return;
    }
    // The useEffect above navigates once `user` updates.
  };

  const handleSendMagicLink = async () => {
    if (!email.trim()) {
      setError("Enter your email first");
      return;
    }
    setError("");
    setPending(true);
    const { error: sendError } = await authClient.signIn.magicLink({
      email,
      callbackURL: redirect,
      errorCallbackURL,
    });
    setPending(false);
    if (sendError) {
      setError(sendError.message ?? "Failed to send magic link");
      return;
    }
    setLinkSent(true);
  };

  const handleSubmit = () => {
    if (usePassword) handlePasswordSignIn();
    else if (codeSent) handleVerifyCode();
    else handleSendCode();
  };

  const handleToggleUsePassword = () => {
    setUsePassword((v) => !v);
    setError("");
    setCodeSent(false);
    setLinkSent(false);
  };

  const handleEmailChange = (value: string) => {
    setEmail(value);
    setCodeSent(false);
    setLinkSent(false);
    setCode("");
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 flex items-center justify-center gap-2">
          <BrandMark className="h-9 w-9" />
          <span className="text-xl font-bold">Time Tracker</span>
        </div>

        <LoginFormCard
          email={email}
          onEmailChange={handleEmailChange}
          password={password}
          onPasswordChange={setPassword}
          usePassword={usePassword}
          onToggleUsePassword={handleToggleUsePassword}
          code={code}
          onCodeChange={setCode}
          codeSent={codeSent}
          linkSent={linkSent}
          pending={pending}
          passkeyPending={passkeyPending}
          error={error}
          onGoogleSignIn={handleGoogleSignIn}
          onPasskeySignIn={handlePasskeySignIn}
          onSendMagicLink={handleSendMagicLink}
          onSubmit={handleSubmit}
        />
      </div>
    </main>
  );
}
