import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { zValidator } from "@hono/zod-validator";
import { UpdateSlackPrefsSchema, type SlackStatus } from "@shared/schemas";
import { encryptJSON } from "../lib/crypto";
import { canManageWorkspace, getMemberRole, MANAGER_ONLY_ERROR } from "../lib/permissions";
import {
  deleteSlackInstallation,
  loadSlackInstallation,
  sendSlackTest,
  slackApi,
  SlackApiError,
} from "../lib/slack";

const STATE_COOKIE = "tt_slack_state";
const BOT_SCOPES = "chat:write,users:read,users:read.email";

// Same `__Host-` scoping as the calendar OAuth state cookie (routes/calendar.ts).
function stateCookieScope(reqUrl: string) {
  const secure = new URL(reqUrl).protocol === "https:";
  return { secure, prefix: secure ? ("host" as const) : undefined };
}

function redirectUri(reqUrl: string): string {
  return `${new URL(reqUrl).origin}/api/slack/callback`;
}

function decodePart(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    return "";
  }
}

function isConfigured(env: Env): boolean {
  return Boolean(env.SLACK_CLIENT_ID && env.SLACK_CLIENT_SECRET);
}

async function isManager(env: Env, workspaceId: string, userId: string): Promise<boolean> {
  return canManageWorkspace(await getMemberRole(env.DB, workspaceId, userId));
}

interface OAuthAccess {
  access_token: string;
  bot_user_id: string;
  team: { id: string; name: string };
}

// Mounted at /api/slack — one Slack installation per workspace (owner/admin), plus each person's own opt-out.
export const slackRouter = new Hono<{
  Bindings: Env;
  Variables: { workspaceId: string; userId: string };
}>()
  .get("/status", async (c) => {
    const workspaceId = c.get("workspaceId");
    const userId = c.get("userId");
    const [installation, link, user, manager] = await Promise.all([
      c.env.DB.prepare(`SELECT team_name FROM slack_installations WHERE workspace_id = ?`)
        .bind(workspaceId)
        .first<{ team_name: string }>(),
      c.env.DB.prepare(`SELECT slack_user_id FROM slack_user_links WHERE workspace_id = ? AND user_id = ?`)
        .bind(workspaceId, userId)
        .first<{ slack_user_id: string | null }>(),
      c.env.DB.prepare(`SELECT slack_notify FROM "user" WHERE id = ?`).bind(userId).first<{ slack_notify: number }>(),
      isManager(c.env, workspaceId, userId),
    ]);
    const status: SlackStatus = {
      configured: isConfigured(c.env),
      connected: Boolean(installation),
      teamName: installation?.team_name ?? null,
      canManage: manager,
      notify: user ? Boolean(user.slack_notify) : true,
      // null until the first lookup, so "not checked yet" never reads as "not found".
      linked: link ? Boolean(link.slack_user_id) : null,
    };
    return c.json(status, 200);
  })
  .patch("/me", zValidator("json", UpdateSlackPrefsSchema), async (c) => {
    const { notify } = c.req.valid("json");
    await c.env.DB.prepare(`UPDATE "user" SET slack_notify = ? WHERE id = ?`)
      .bind(notify ? 1 : 0, c.get("userId"))
      .run();
    return c.json({ ok: true, notify }, 200);
  })
  .get("/connect", async (c) => {
    if (!isConfigured(c.env)) return c.redirect("/settings?slack=not_configured");
    if (!(await isManager(c.env, c.get("workspaceId"), c.get("userId")))) return c.redirect("/settings?slack=forbidden");

    const state = crypto.randomUUID();
    // The callback must land the installation in the workspace, and by the person, that started it.
    const cookieValue = [state, c.get("workspaceId"), c.get("userId")].map(encodeURIComponent).join(".");
    setCookie(c, STATE_COOKIE, cookieValue, {
      httpOnly: true,
      sameSite: "Lax",
      path: "/",
      maxAge: 600,
      ...stateCookieScope(c.req.url),
    });
    const url = new URL("https://slack.com/oauth/v2/authorize");
    url.searchParams.set("client_id", c.env.SLACK_CLIENT_ID);
    url.searchParams.set("scope", BOT_SCOPES);
    url.searchParams.set("redirect_uri", redirectUri(c.req.url));
    url.searchParams.set("state", state);
    return c.redirect(url.toString());
  })
  .get("/callback", async (c) => {
    const workspaceId = c.get("workspaceId");
    const userId = c.get("userId");
    const { code, state, error } = c.req.query();
    const scope = stateCookieScope(c.req.url);
    const expected = scope.prefix ? getCookie(c, STATE_COOKIE, scope.prefix) : getCookie(c, STATE_COOKIE);
    deleteCookie(c, STATE_COOKIE, { path: "/", ...scope });

    const [expectedState, expectedWorkspace, expectedUser] = (expected ?? "").split(".").map(decodePart);
    if (
      error ||
      !code ||
      !state ||
      state !== expectedState ||
      expectedWorkspace !== workspaceId ||
      expectedUser !== userId
    ) {
      return c.redirect("/settings?slack=error");
    }
    if (!isConfigured(c.env)) return c.redirect("/settings?slack=not_configured");
    // Re-checked here: the role may have changed during the consent screen.
    if (!(await isManager(c.env, workspaceId, userId))) return c.redirect("/settings?slack=forbidden");

    try {
      const access = await slackApi<OAuthAccess>(c.env, null, "oauth.v2.access", {
        client_id: c.env.SLACK_CLIENT_ID,
        client_secret: c.env.SLACK_CLIENT_SECRET,
        code,
        redirect_uri: redirectUri(c.req.url),
      });
      const credentials = await encryptJSON(c.env.AUTH_SECRET, { botToken: access.access_token });
      // Reinstalling (or switching Slack workspace) replaces the old installation and its email matches.
      await c.env.DB.batch([
        c.env.DB.prepare(`DELETE FROM slack_user_links WHERE workspace_id = ?`).bind(workspaceId),
        c.env.DB.prepare(
          `INSERT INTO slack_installations (workspace_id, team_id, team_name, bot_user_id, credentials, installed_by)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT (workspace_id) DO UPDATE SET team_id = excluded.team_id, team_name = excluded.team_name,
             bot_user_id = excluded.bot_user_id, credentials = excluded.credentials,
             installed_by = excluded.installed_by, created_at = datetime('now')`
        ).bind(workspaceId, access.team.id, access.team.name, access.bot_user_id, credentials, userId),
      ]);
      return c.redirect("/settings?slack=connected");
    } catch (err) {
      console.warn("slack: oauth callback failed", { workspaceId, userId, cause: String(err) });
      return c.redirect("/settings?slack=error");
    }
  })
  .delete("/", async (c) => {
    const workspaceId = c.get("workspaceId");
    if (!(await isManager(c.env, workspaceId, c.get("userId")))) return c.json({ error: MANAGER_ONLY_ERROR }, 403);

    // An undecryptable token (AUTH_SECRET rotated) must still be removable.
    const installation = await loadSlackInstallation(c.env, workspaceId).catch((e) => {
      console.warn("slack: stored installation unreadable", { workspaceId, cause: String(e) });
      return null;
    });
    if (installation) {
      // Best effort: a token Slack already revoked must not block removing it here.
      await slackApi(c.env, installation.botToken, "auth.revoke", {}).catch((e) =>
        console.warn("slack: auth.revoke failed", { workspaceId, cause: String(e) })
      );
    }
    await deleteSlackInstallation(c.env, workspaceId);
    return c.json({ ok: true }, 200);
  })
  .post("/test", async (c) => {
    try {
      const result = await sendSlackTest(c.env, c.get("workspaceId"), c.get("userId"));
      if (result === "not_connected") return c.json({ error: "Slack isn't connected to this workspace" }, 409);
      if (result === "no_slack_user") return c.json({ error: "No Slack user has your email address" }, 404);
      return c.json({ ok: true }, 200);
    } catch (e) {
      const code = e instanceof SlackApiError ? e.code : "unknown";
      console.warn("slack: test message failed", { workspaceId: c.get("workspaceId"), code });
      return c.json({ error: `Slack refused the message (${code})` }, 502);
    }
  });
