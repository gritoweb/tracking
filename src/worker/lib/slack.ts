import { appUrl } from "./app-url";
import { decryptJSON } from "./crypto";

/** A notification waits this long unread in the bell before it goes to Slack. */
export const SLACK_DELAY_MINUTES = 15;
/** Older than this is backlog: installing Slack must not replay a day of stale notifications. */
const SLACK_MAX_AGE_HOURS = 24;
/** A person whose email matched no Slack user is looked up again after this long. */
const LINK_RECHECK_HOURS = 24;
const MAX_ITEMS_PER_DM = 10;
/** Only what is about the person reaches Slack; a status change on their task stays in the bell. */
export const SLACK_NOTIFICATION_TYPES = ["task_assigned", "task_mention"] as const;
const SWEEP_LIMIT = 500;

/** Errors after which the stored bot token is dead and the installation must go. */
const DEAD_TOKEN_ERRORS = new Set(["invalid_auth", "token_revoked", "account_inactive", "not_authed"]);

export class SlackApiError extends Error {
  constructor(readonly code: string) {
    super(`Slack API error: ${code}`);
  }
}

type SlackEnv = Pick<Env, "SLACK_DRY_RUN">;

/** Canned answers for SLACK_DRY_RUN — nothing leaves the machine except the OAuth code exchange. */
function dryRunResponse(method: string): Record<string, unknown> {
  if (method === "users.lookupByEmail") return { ok: true, user: { id: "UDRYRUN" } };
  if (method === "chat.postMessage") return { ok: true, ts: "0000000000.000000" };
  return { ok: true };
}

/** One Slack Web API call, form-encoded (accepted by every method, unlike JSON). */
export async function slackApi<T extends object = Record<string, unknown>>(
  env: SlackEnv,
  token: string | null,
  method: string,
  args: Record<string, string>
): Promise<T> {
  if (env.SLACK_DRY_RUN === "1" && method !== "oauth.v2.access") {
    console.info("slack dry run", { method, args });
    return dryRunResponse(method) as T;
  }

  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(`https://slack.com/api/${method}`, { method: "POST", headers, body: new URLSearchParams(args) });
  } catch {
    throw new SlackApiError("network_error");
  }
  if (res.status === 429) throw new SlackApiError("ratelimited");
  const data = (await res.json().catch(() => ({ ok: false, error: `http_${res.status}` }))) as { ok?: boolean; error?: string };
  if (!data.ok) throw new SlackApiError(data.error ?? `http_${res.status}`);
  return data as T;
}

export interface SlackInstallation {
  workspaceId: string;
  teamName: string;
  botToken: string;
}

export async function loadSlackInstallation(env: Env, workspaceId: string): Promise<SlackInstallation | null> {
  const row = await env.DB.prepare(`SELECT team_name, credentials FROM slack_installations WHERE workspace_id = ?`)
    .bind(workspaceId)
    .first<{ team_name: string; credentials: string }>();
  if (!row) return null;
  const { botToken } = await decryptJSON<{ botToken: string }>(env.AUTH_SECRET, row.credentials);
  return { workspaceId, teamName: row.team_name, botToken };
}

export async function deleteSlackInstallation(env: Env, workspaceId: string): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM slack_installations WHERE workspace_id = ?`).bind(workspaceId),
    env.DB.prepare(`DELETE FROM slack_user_links WHERE workspace_id = ?`).bind(workspaceId),
  ]);
}

/** The person's Slack user id, matched by email and cached; null when their email has no Slack user. */
export async function resolveSlackUser(
  env: Env,
  installation: SlackInstallation,
  userId: string,
  email: string
): Promise<string | null> {
  const cached = await env.DB.prepare(
    `SELECT slack_user_id, checked_at >= datetime('now', ?) AS fresh
       FROM slack_user_links WHERE workspace_id = ? AND user_id = ?`
  )
    .bind(`-${LINK_RECHECK_HOURS} hours`, installation.workspaceId, userId)
    .first<{ slack_user_id: string | null; fresh: number }>();
  if (cached?.slack_user_id) return cached.slack_user_id;
  if (cached && cached.fresh) return null;

  let slackUserId: string | null = null;
  try {
    const data = await slackApi<{ user?: { id?: string } }>(env, installation.botToken, "users.lookupByEmail", { email });
    slackUserId = data.user?.id ?? null;
  } catch (e) {
    if (!(e instanceof SlackApiError && e.code === "users_not_found")) throw e;
  }

  await env.DB.prepare(
    `INSERT INTO slack_user_links (workspace_id, user_id, slack_user_id, checked_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT (workspace_id, user_id) DO UPDATE SET slack_user_id = excluded.slack_user_id, checked_at = excluded.checked_at`
  )
    .bind(installation.workspaceId, userId, slackUserId)
    .run();
  return slackUserId;
}

export interface SlackNotificationItem {
  title: string;
  body: string;
  link: string | null;
}

/** Slack mrkdwn treats these three as control characters. */
export function escapeSlackText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function openButton(url: string, label: string) {
  return { type: "button", text: { type: "plain_text", text: label }, url };
}

/** One DM for every pending notification of a person: plain `text` for the push preview, blocks for the body. */
export function buildNotificationMessage(items: SlackNotificationItem[], baseUrl: string) {
  const shown = items.slice(0, MAX_ITEMS_PER_DM);
  const urlOf = (item: SlackNotificationItem) => `${baseUrl}${item.link ?? "/"}`;
  const itemText = (item: SlackNotificationItem) => ({
    type: "mrkdwn",
    text: `*${escapeSlackText(item.title)}*\n${escapeSlackText(item.body)}`,
  });

  if (items.length === 1) {
    return {
      text: items[0].title,
      blocks: [
        { type: "section", text: itemText(items[0]) },
        { type: "actions", elements: [openButton(urlOf(items[0]), "Open in TimeTracker")] },
      ],
    };
  }

  const blocks: object[] = [
    { type: "section", text: { type: "mrkdwn", text: `You have *${items.length} unread notifications* in TimeTracker` } },
    ...shown.map((item) => ({ type: "section", text: itemText(item), accessory: openButton(urlOf(item), "Open") })),
  ];
  if (items.length > shown.length) {
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: `…and ${items.length - shown.length} more — <${baseUrl}/|open TimeTracker>` }],
    });
  }
  return { text: `You have ${items.length} unread notifications in TimeTracker`, blocks };
}

async function postDm(env: Env, installation: SlackInstallation, slackUserId: string, message: { text: string; blocks: object[] }) {
  await slackApi(env, installation.botToken, "chat.postMessage", {
    channel: slackUserId,
    text: message.text,
    blocks: JSON.stringify(message.blocks),
    unfurl_links: "false",
  });
}

/** "Send test" in Settings: proves the installation and the email match for the person who clicked. */
export async function sendSlackTest(env: Env, workspaceId: string, userId: string): Promise<"sent" | "not_connected" | "no_slack_user"> {
  const installation = await loadSlackInstallation(env, workspaceId);
  if (!installation) return "not_connected";
  const user = await env.DB.prepare(`SELECT email FROM "user" WHERE id = ?`).bind(userId).first<{ email: string }>();
  const slackUserId = user ? await resolveSlackUser(env, installation, userId, user.email) : null;
  if (!slackUserId) return "no_slack_user";
  await postDm(
    env,
    installation,
    slackUserId,
    buildNotificationMessage([{ title: "Slack is connected", body: "Unread TimeTracker notifications will reach you here.", link: "/settings" }], appUrl(env))
  );
  return "sent";
}

interface PendingRow {
  id: string;
  workspace_id: string;
  user_id: string;
  email: string;
  title: string;
  body: string;
  link: string | null;
}

/** Cron sweep: notifications still unread after SLACK_DELAY_MINUTES go to their person as one Slack DM. */
export async function runSlackNotifications(env: Env): Promise<void> {
  let pending: PendingRow[];
  try {
    const { results } = await env.DB.prepare(
      `SELECT n.id, n.workspace_id, n.user_id, u.email, n.title, n.body, n.link
         FROM notifications n
         JOIN slack_installations si ON si.workspace_id = n.workspace_id
         JOIN "member" m ON m.organizationId = n.workspace_id AND m.userId = n.user_id
         JOIN "user" u ON u.id = n.user_id
        WHERE n.is_read = 0 AND n.slack_sent_at IS NULL
          AND n.type IN (${SLACK_NOTIFICATION_TYPES.map(() => "?").join(", ")})
          AND n.created_at <= datetime('now', ?) AND n.created_at >= datetime('now', ?)
          AND u.slack_notify = 1 AND u.banned = 0
        ORDER BY n.created_at ASC
        LIMIT ${SWEEP_LIMIT}`
    )
      .bind(...SLACK_NOTIFICATION_TYPES, `-${SLACK_DELAY_MINUTES} minutes`, `-${SLACK_MAX_AGE_HOURS} hours`)
      .all<PendingRow>();
    pending = results;
  } catch (e) {
    console.warn("slack sweep query failed", { error: String(e) });
    return;
  }
  if (!pending.length) return;

  const byPerson = new Map<string, PendingRow[]>();
  for (const row of pending) {
    const key = `${row.workspace_id}\u0000${row.user_id}`;
    byPerson.set(key, [...(byPerson.get(key) ?? []), row]);
  }

  const installations = new Map<string, Promise<SlackInstallation | null>>();

  for (const rows of byPerson.values()) {
    const { workspace_id: workspaceId, user_id: userId, email } = rows[0];
    try {
      if (!installations.has(workspaceId)) installations.set(workspaceId, loadSlackInstallation(env, workspaceId));
      const installation = await installations.get(workspaceId);
      if (!installation) continue;

      const slackUserId = await resolveSlackUser(env, installation, userId, email);
      if (!slackUserId) continue;
      const baseUrl = appUrl(env);

      // Claim before sending: a Slack DM is delivered at most once, even if two sweeps overlap.
      const claims = await env.DB.batch(
        rows.map((r) =>
          env.DB.prepare(
            `UPDATE notifications SET slack_sent_at = datetime('now') WHERE id = ? AND is_read = 0 AND slack_sent_at IS NULL`
          ).bind(r.id)
        )
      );
      const claimed = rows.filter((_, i) => (claims[i]?.meta?.changes ?? 0) === 1);
      if (!claimed.length) continue;

      await postDm(env, installation, slackUserId, buildNotificationMessage(claimed, baseUrl));
    } catch (e) {
      if (e instanceof SlackApiError && DEAD_TOKEN_ERRORS.has(e.code)) {
        installations.set(workspaceId, Promise.resolve(null));
        await deleteSlackInstallation(env, workspaceId).catch((err) =>
          console.warn("slack: removing a dead installation failed", { workspaceId, error: String(err) })
        );
        console.warn("slack installation removed: token no longer valid", { workspaceId, code: e.code });
        continue;
      }
      console.warn("slack notification failed", { workspaceId, userId, error: String(e) });
    }
  }
}
