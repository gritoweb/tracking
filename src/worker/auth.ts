import { betterAuth } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { bearer, organization, admin, emailOTP, magicLink } from "better-auth/plugins";
import { passkey } from "@better-auth/passkey";
import { WorkspaceInvitationEmail } from "./emails/workspace-invitation";
import { VerificationOtpEmail } from "./emails/verification-otp";
import { MagicLinkEmail } from "./emails/magic-link";
import { sendEmail } from "./lib/mailer";
import { APP_HOST, appUrl } from "@shared/app";
import {
  accountExists,
  canCreateAccount,
  inviteOnlyError,
  isAdminEmail,
  shouldCreateWorkspace,
  signInEmailFromRequest,
} from "./lib/invite-only";

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
      // An unverified password sign-up could claim an invited address first; only the dev/e2e helper keeps it.
      disableSignUp: !import.meta.env.DEV,
    },
    session: {
      // Disable better-auth's global "fresh session" gate so /list-sessions (the
      // Settings → Active sessions card) doesn't 403 with SESSION_NOT_FRESH once a
      // session is older than freshAge (default 1 day) — that broke the card for
      // every returning user, and better-auth has no per-endpoint override.
      // NOTE: freshAge:0 also drops the gate from /update-user, /unlink-account,
      // AND /delete-user (better-auth skips its deletion freshness check entirely
      // when freshAge is 0, and passwordless users have no current-password
      // check either) — so it is re-imposed on those three endpoints in
      // middleware/fresh-session.ts (wired in index.ts). Revoke/change-password
      // use better-auth's separate checks and are unaffected.
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
      // Enables the account self-deletion flow (authClient.deleteUser()).
      deleteUser: {
        enabled: true,
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
      bearer(),
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
        // Only a proven owner of the address may join; relaxed in dev so e2e password users can accept.
        requireEmailVerificationOnInvitation: !import.meta.env.DEV,
        async sendInvitationEmail(data) {
          const url = `${baseURL}/accept-invite?id=${data.id}`;
          await sendEmail(
            env,
            data.email,
            `You've been invited to a ${APP_HOST} workspace`,
            WorkspaceInvitationEmail({
              inviterName: data.inviter.user.name,
              workspaceName: data.organization.name,
              url,
            }),
          );
        },
      }),
      admin(),
      emailOTP({
        async sendVerificationOTP({ email, otp }) {
          await sendEmail(env, email, `Your ${APP_HOST} verification code`, VerificationOtpEmail({ otp }));
        },
      }),
      magicLink({
        async sendMagicLink({ email, url }) {
          await sendEmail(env, email, `Sign in to ${APP_HOST}`, MagicLinkEmail({ url }));
        },
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
