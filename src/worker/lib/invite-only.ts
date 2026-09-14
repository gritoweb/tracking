import { APIError } from "better-auth/api";
import { INVITE_ONLY_CODE, INVITE_ONLY_MESSAGE } from "@shared/invite-only";

// e2e mints throwaway accounts on this domain; the check is compiled out of production builds.
const DEV_TEST_DOMAIN = "@example.com";

function adminEmails(env: Env): string[] {
  return (env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function isDevTestEmail(email: string): boolean {
  return import.meta.env.DEV && email.endsWith(DEV_TEST_DOMAIN);
}

/** The app admins (ADMIN_EMAILS): the only accounts allowed to open a workspace. */
export function isAdminEmail(env: Env, email: string): boolean {
  return adminEmails(env).includes(email.toLowerCase());
}

/** Emails trusted to exist without an invitation: ADMIN_EMAILS, plus the e2e domain in dev. */
export function isBootstrapEmail(env: Env, email: string): boolean {
  const normalized = email.toLowerCase();
  return isAdminEmail(env, normalized) || isDevTestEmail(normalized);
}

/** A pending, unexpired invitation for this email from a workspace owned by a bootstrap email. */
async function hasTrustedInvitation(env: Env, email: string): Promise<boolean> {
  const { results } = await env.DB.prepare(
    `SELECT i.expiresAt AS expires_at, u.email AS owner_email
       FROM invitation i
       JOIN member m ON m.organizationId = i.organizationId
                    AND instr(',' || m.role || ',', ',owner,') > 0
       JOIN "user" u ON u.id = m.userId
      WHERE lower(i.email) = ? AND i.status = 'pending'`
  )
    .bind(email)
    .all<{ expires_at: string; owner_email: string }>();

  const now = Date.now();
  return results.some(
    (row) => new Date(row.expires_at).getTime() > now && isBootstrapEmail(env, row.owner_email)
  );
}

/** Whether a brand-new account may be created for this email. */
export async function canCreateAccount(env: Env, email: string): Promise<boolean> {
  const normalized = email.toLowerCase();
  return isBootstrapEmail(env, normalized) || (await hasTrustedInvitation(env, normalized));
}

export async function accountExists(env: Env, email: string): Promise<boolean> {
  const row = await env.DB.prepare(`SELECT 1 FROM "user" WHERE email = ? LIMIT 1`)
    .bind(email.toLowerCase())
    .first();
  return row !== null;
}

/** Only the e2e domain (dev) and the very first ADMIN_EMAILS account get a workspace of their own. */
export async function shouldCreateWorkspace(env: Env, email: string): Promise<boolean> {
  const normalized = email.toLowerCase();
  if (isDevTestEmail(normalized)) return true;
  if (!isAdminEmail(env, normalized)) return false;
  const anyWorkspace = await env.DB.prepare(`SELECT 1 FROM workspaces LIMIT 1`).first();
  return anyWorkspace === null;
}

/** The email a request is about to send a sign-in code or magic link to, if any. */
export function signInEmailFromRequest(path: string | undefined, body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const { email, type } = body as { email?: unknown; type?: unknown };
  if (typeof email !== "string") return null;
  if (path === "/sign-in/magic-link") return email.toLowerCase();
  if (path === "/email-otp/send-verification-otp" && type === "sign-in") return email.toLowerCase();
  return null;
}

export function inviteOnlyError(): APIError {
  return new APIError("FORBIDDEN", { message: INVITE_ONLY_MESSAGE, code: INVITE_ONLY_CODE });
}
