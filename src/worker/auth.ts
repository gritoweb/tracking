import { betterAuth } from "better-auth";
import { createAuthMiddleware, isAPIError } from "better-auth/api";
import { bearer, organization, admin, emailOTP, magicLink } from "better-auth/plugins";
import { passkey } from "@better-auth/passkey";
import { WorkspaceInvitationEmail } from "./emails/workspace-invitation";
import { VerificationOtpEmail } from "./emails/verification-otp";
import { MagicLinkEmail } from "./emails/magic-link";
import { ResetPasswordEmail } from "./emails/reset-password";
import { VerifyEmailEmail } from "./emails/verify-email";
import { sendEmail } from "./lib/mailer";
import { appUrl } from "./lib/app-url";
import { appHost } from "@shared/app";
import {
  accountExists,
  canCreateAccount,
  inviteOnlyError,
  isAdminEmail,
  shouldCreateWorkspace,
  signInEmailFromRequest,
} from "./lib/invite-only";
import { reactivateIfDeactivated } from "./lib/account-deactivation";
import { ensureStatuses } from "./lib/task-statuses";
import { removeMemberFromTasks } from "./lib/task-assignees";

function randomSlug(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

export function createAuth(env: Env, baseURL: string) {
  // WebAuthn/passkey relying-party is derived from the request origin so it works
  // unchanged in local dev (localhost) and in production. Frontend
  // and worker share an origin here, so the RP origin is just the base origin.
  const rpURL = new URL(baseURL);

  // Better Auth silently falls back BETTER_AUTH_SECRET → AUTH_SECRET → a
  // known default string; never let that chain start. (AUTH_SECRET is a
  // different key — it encrypts integration credentials at rest.)
  if (!env.BETTER_AUTH_SECRET) {
    throw new Error("BETTER_AUTH_SECRET is not set (wrangler secret put BETTER_AUTH_SECRET)");
  }

  const auth = betterAuth({
    // D1 is auto-detected via its batch/exec/prepare interface
    database: env.DB as unknown as Parameters<typeof betterAuth>[0]["database"],
    secret: env.BETTER_AUTH_SECRET,
    baseURL,
    trustedOrigins: [
      appUrl(env),
      // Browser extension. The ID below is pinned via the manifest "key" for
      // local dev/testing (see extension/.keys/README.md). NOTE: the Chrome Web
      // Store assigns its OWN id on publish — after the first upload, add the
      // published chrome-extension://<id> here too. See extension/PUBLISHING.md.
      // The extension signs in with the standard better-auth client + bearer().
      "chrome-extension://nogikmhdpnnedmfldanickgpikmifcje",
      // trustedOrigins gates CSRF origin checks AND callbackURL validation, so
      // localhost must never be trusted by the production build — any local
      // process on a user's machine could serve those origins. Compiled in for
      // dev/e2e builds only.
      ...(import.meta.env.DEV ? ["http://localhost:5173", "http://localhost:8787"] : []),
    ],
    emailAndPassword: {
      // Password sign-in is a production login method (ENABLE_PASSWORD_AUTH is a deployed var).
      enabled: env.ENABLE_PASSWORD_AUTH === "true",
      disableSignUp: false,
      // Without this, whoever POSTs /sign-up/email first with someone else's invited-but-unclaimed
      // address would squat it with a password of their own choosing. With it, sign-up returns no
      // session (better-auth skips auto-sign-in — see sign-up.mjs's shouldSkipAutoSignIn) and
      // /sign-in/email refuses until the inbox owner clicks the verification link below — matching
      // the same guarantee requireEmailVerificationOnInvitation already gives invite acceptance.
      // Dev/e2e keep the old frictionless behavior (e2e/auth.ts signs in immediately after sign-up).
      requireEmailVerification: !import.meta.env.DEV,
      // A reset invalidates other sessions — the requester proved control of the mailbox, a stolen cookie elsewhere shouldn't survive it.
      revokeSessionsOnPasswordReset: true,
      async sendResetPassword({ user, url }) {
        await sendEmail(env, user.email, `Reset your ${appHost(appUrl(env))} password`, ResetPasswordEmail({ url, appUrl: appUrl(env) }));
      },
    },
    emailVerification: {
      autoSignInAfterVerification: true,
      async sendVerificationEmail({ user, url }) {
        await sendEmail(env, user.email, `Verify your ${appHost(appUrl(env))} email`, VerifyEmailEmail({ url, appUrl: appUrl(env) }));
      },
    },
    session: {
      // Disable better-auth's global "fresh session" gate so /list-sessions (the
      // Settings → Active sessions card) doesn't 403 with SESSION_NOT_FRESH once a
      // session is older than freshAge (default 1 day) — that broke the card for
      // every returning user, and better-auth has no per-endpoint override.
      // freshAge:0 also drops Better Auth's gate on unlink/delete; index.ts re-imposes only those (docs/ARCHITECTURE.md).
      freshAge: 0,
      // Serve getSession() from a signed cookie for 5 minutes instead of a D1
      // lookup on every /api/* request (workspaceMiddleware). Bearer-token
      // requests (extension) bypass this and still validate against D1.
      // Revocations can lag by up to maxAge; sign-out clears the cookie itself.
      cookieCache: {
        enabled: true,
        maxAge: 300,
      },
    },
    user: {
      // Off: /delete-user is served by routes/account.ts, which deactivates instead of deleting.
      deleteUser: {
        enabled: false,
      },
    },
    account: {
      // Without this, Google sign-in on an email that already has a password/OTP account fails with account_not_linked.
      accountLinking: {
        enabled: true,
        trustedProviders: ["google"],
        requireLocalEmailVerified: false,
      },
    },
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
    },
    hooks: {
      // Refuse before any email is sent: the magic-link verify step can't surface a hook error.
      before: createAuthMiddleware(async (ctx) => {
        const email = signInEmailFromRequest(ctx.path, ctx.body);
        if (!email || (await accountExists(env, email))) return;
        if (!(await canCreateAccount(env, email))) throw inviteOnlyError();
      }),
      // leaveOrganization never calls organizationHooks.afterRemoveMember (better-auth 1.6.23 source), so catch it here instead.
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/organization/leave") return;
        const left = ctx.context.returned;
        if (!left || isAPIError(left) || typeof left !== "object") return;
        const { organizationId, userId } = left as { organizationId?: unknown; userId?: unknown };
        if (typeof organizationId !== "string" || typeof userId !== "string") return;
        await removeMemberFromTasks(env, organizationId, userId);
      }),
    },
    databaseHooks: {
      user: {
        create: {
          // Every sign-up path (Google, OTP, magic link, password) creates the user here: the single invite gate.
          before: async (user) => {
            if (!(await canCreateAccount(env, user.email))) throw inviteOnlyError();
            if (user.name?.trim()) return;
            return { data: { ...user, name: user.email.split("@")[0] } };
          },
          after: async (user) => {
            if (!(await shouldCreateWorkspace(env, user.email))) return;
            const displayName = user.name?.trim() || user.email.split("@")[0];
            await auth.api.createOrganization({
              body: {
                name: `${displayName}'s Workspace`,
                slug: randomSlug(),
                userId: user.id,
              },
            });
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            const row = await env.DB
              .prepare(`SELECT last_active_organization_id FROM "user" WHERE id = ?`)
              .bind(session.userId)
              .first<{ last_active_organization_id: string | null }>();
            if (!row?.last_active_organization_id) return;
            return { data: { ...session, activeOrganizationId: row.last_active_organization_id } };
          },
        },
        update: {
          after: async (session) => {
            if (session.activeOrganizationId === undefined) return;
            await env.DB
              .prepare(`UPDATE "user" SET last_active_organization_id = ? WHERE id = ?`)
              .bind(session.activeOrganizationId, session.userId)
              .run();
          },
        },
      },
    },
    plugins: [
      // requireSignature: closes the unsigned-token replay hole — SECURITY.md S-01.
      bearer({ requireSignature: true }),
      organization({
        // Reuse the existing `workspaces` table instead of creating a parallel
        // `organization` table — avoids migrating every workspace_id FK.
        schema: {
          organization: {
            modelName: "workspaces",
            fields: { createdAt: "created_at" },
          },
        },
        // Only an ADMIN_EMAILS account opens workspaces; the server-side bootstrap in user.create.after is exempt.
        allowUserToCreateOrganization: (user) => isAdminEmail(env, user.email),
        organizationHooks: {
          // Seeds the five default task statuses, and marks the org active for its creator — see CHANGELOG.
          afterCreateOrganization: async ({ organization, user }) => {
            await ensureStatuses(env.DB, organization.id);
            await env.DB
              .prepare(`UPDATE "user" SET last_active_organization_id = ? WHERE id = ?`)
              .bind(organization.id, user.id)
              .run();
          },
          // Delete the row first so its member cascade passes migration 0051's last-owner guard; better-auth's own member-by-member delete would not.
          beforeDeleteOrganization: async ({ organization }) => {
            await env.DB.prepare(`DELETE FROM workspaces WHERE id = ?`).bind(organization.id).run();
          },
          // Owner/admin removal path; the voluntary-leave counterpart is the top-level `hooks.after` above.
          afterRemoveMember: async ({ organization, member }) => {
            await removeMemberFromTasks(env, organization.id, member.userId);
          },
        },
        // Only a proven owner of the address may join; relaxed in dev so e2e password users can accept.
        requireEmailVerificationOnInvitation: !import.meta.env.DEV,
        // The invite link is a magic-link sign-in: clicking it authenticates AND lands on
        // /accept-invite already signed in, instead of a plain URL that still requires a
        // separate login step. sendMagicLink below routes the email by the invite metadata.
        async sendInvitationEmail(data) {
          // Being invited back is what lifts a deactivation; a moderation ban stays.
          await reactivateIfDeactivated(env.DB, data.email);
          await auth.api.signInMagicLink({
            body: {
              email: data.email,
              callbackURL: `/accept-invite?id=${data.id}`,
              metadata: {
                invitationId: data.id,
                inviterName: data.inviter.user.name,
                workspaceName: data.organization.name,
              },
            },
            // No inbound request to read headers from — this call originates
            // from the invitation hook itself, not a browser request.
            headers: new Headers(),
          });
        },
      }),
      admin(),
      emailOTP({
        async sendVerificationOTP({ email, otp }) {
          await sendEmail(env, email, `Your ${appHost(appUrl(env))} verification code`, VerificationOtpEmail({ otp, appUrl: appUrl(env) }));
        },
      }),
      magicLink({
        async sendMagicLink({ email, url, metadata }) {
          const invite = metadata as { invitationId?: string; inviterName?: string; workspaceName?: string } | undefined;
          if (invite?.invitationId) {
            await sendEmail(
              env,
              email,
              `You've been invited to a ${appHost(appUrl(env))} workspace`,
              WorkspaceInvitationEmail({
                inviterName: invite.inviterName ?? "",
                workspaceName: invite.workspaceName ?? "",
                url,
                appUrl: appUrl(env),
              }),
            );
            return;
          }
          await sendEmail(env, email, `Sign in to ${appHost(appUrl(env))}`, MagicLinkEmail({ url, appUrl: appUrl(env) }));
        },
        // The plugin's own rate limit is keyed by request IP; sendInvitationEmail's call to
        // signInMagicLink above has no request to read one from, so every invite send — from
        // every workspace — falls into ONE shared bucket (better-auth's NO_TRUSTED_IP_KEY
        // fallback). A real magic-link sign-in always has a caller IP and gets its own bucket,
        // so this only bounds invite bursts: raised past AUTH_LIMITER's 10/60s on
        // /organization/invite-member (index.ts) so that ceiling, not this one, is what a
        // bulk invite actually hits.
        rateLimit: { window: 60, max: 20 },
      }),
      passkey({
        rpID: rpURL.hostname,
        rpName: "Time Tracker",
        origin: rpURL.origin,
      }),
    ],
    advanced: {
      // CSRF/origin checks stay ON. The web app (cookies) and the browser
      // extension are both covered by trustedOrigins above — the extension's
      // pinned chrome-extension:// origin is trusted, and it authenticates with
      // bearer tokens (bearer() plugin) rather than cookies.
      // Prefix for cookie names, to avoid collisions with other apps on the same domain
      cookiePrefix: "timetracker",
    },
  });

  return auth;
}

export type Auth = ReturnType<typeof createAuth>;
