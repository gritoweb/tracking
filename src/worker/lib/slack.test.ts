import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMigratedD1 } from "../../test/sqlite-d1";
import { encryptJSON } from "./crypto";
import { buildNotificationMessage, escapeSlackText, runSlackNotifications } from "./slack";

const SECRET = "test-secret-for-slack-credentials";

type SlackCall = { method: string; args: Record<string, string> };

/** Stands in for slack.com: records every call and answers per method. */
function mockSlack(answers: Record<string, () => object> = {}) {
  const calls: SlackCall[] = [];
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    const method = url.replace("https://slack.com/api/", "");
    const args = Object.fromEntries(new URLSearchParams(init.body as URLSearchParams));
    calls.push({ method, args });
    const answer = answers[method]?.() ?? (method === "users.lookupByEmail" ? { ok: true, user: { id: `U-${args.email}` } } : { ok: true });
    return new Response(JSON.stringify(answer), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock, posts: () => calls.filter((c) => c.method === "chat.postMessage") };
}

async function world({ installed = true } = {}) {
  const { db, raw } = createMigratedD1();
  raw.exec(`
    INSERT INTO workspaces (id, name) VALUES ('ws-A', 'A');
    INSERT INTO "user" (id, name, email, createdAt, updatedAt) VALUES
      ('u-ana', 'ana', 'ana@x.test', '2026-01-01 00:00:00', '2026-01-01 00:00:00'),
      ('u-bo', 'bo', 'bo@x.test', '2026-01-01 00:00:00', '2026-01-01 00:00:00'),
      ('u-gone', 'gone', 'gone@x.test', '2026-01-01 00:00:00', '2026-01-01 00:00:00');
    INSERT INTO "member" (id, organizationId, userId, role, createdAt) VALUES
      ('m1', 'ws-A', 'u-ana', 'owner', '2026-01-01'),
      ('m2', 'ws-A', 'u-bo', 'member', '2026-01-01');
  `);
  if (installed) {
    const credentials = await encryptJSON(SECRET, { botToken: "xoxb-test" });
    raw.prepare(
      `INSERT INTO slack_installations (workspace_id, team_id, team_name, bot_user_id, credentials, installed_by)
       VALUES ('ws-A', 'T1', 'Team', 'B1', ?, 'u-ana')`
    ).run(credentials);
  }
  const env = { DB: db, AUTH_SECRET: SECRET, APP_URL: "http://app.test" } as unknown as Env;
  const notify = (id: string, userId: string, age: string, isRead = 0) =>
    raw.prepare(
      `INSERT INTO notifications (id, workspace_id, user_id, type, title, body, link, is_read, created_at)
       VALUES (?, 'ws-A', ?, 'task_assigned', ?, 'body', ?, ?, datetime('now', ?))`
    ).run(id, userId, `title ${id}`, `/tasks/${id}`, isRead, age);
  const sentIds = () =>
    (raw.prepare(`SELECT id FROM notifications WHERE slack_sent_at IS NOT NULL ORDER BY id`).all() as { id: string }[]).map((r) => r.id);
  return { env, raw, notify, sentIds };
}

beforeEach(() => vi.spyOn(console, "warn").mockImplementation(() => {}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("runSlackNotifications", () => {
  it("sends one DM per person for notifications unread past the delay, and marks them sent", async () => {
    const { env, notify, sentIds } = await world();
    notify("n1", "u-ana", "-20 minutes");
    notify("n2", "u-ana", "-30 minutes");
    notify("n3", "u-bo", "-16 minutes");
    const slack = mockSlack();

    await runSlackNotifications(env);

    expect(slack.posts().map((p) => p.args.channel).sort()).toEqual(["U-ana@x.test", "U-bo@x.test"]);
    const anaPost = slack.posts().find((p) => p.args.channel === "U-ana@x.test")!;
    expect(anaPost.args.text).toBe("You have 2 unread notifications in TimeTracker");
    expect(anaPost.args.blocks).toContain("http://app.test/tasks/n1");
    expect(sentIds()).toEqual(["n1", "n2", "n3"]);
  });

  it("never sends the same notification twice", async () => {
    const { env, notify } = await world();
    notify("n1", "u-ana", "-20 minutes");
    const slack = mockSlack();
    await runSlackNotifications(env);
    await runSlackNotifications(env);
    expect(slack.posts()).toHaveLength(1);
  });

  it("skips read, too-recent and day-old notifications", async () => {
    const { env, notify, sentIds } = await world();
    notify("read", "u-ana", "-20 minutes", 1);
    notify("fresh", "u-ana", "-5 minutes");
    notify("stale", "u-ana", "-2 days");
    const slack = mockSlack();
    await runSlackNotifications(env);
    expect(slack.calls).toHaveLength(0);
    expect(sentIds()).toEqual([]);
  });

  it("does nothing for a workspace without Slack installed", async () => {
    const { env, notify } = await world({ installed: false });
    notify("n1", "u-ana", "-20 minutes");
    const slack = mockSlack();
    await runSlackNotifications(env);
    expect(slack.calls).toHaveLength(0);
  });

  it("respects a person's opt-out", async () => {
    const { env, raw, notify } = await world();
    raw.exec(`UPDATE "user" SET slack_notify = 0 WHERE id = 'u-ana'`);
    notify("n1", "u-ana", "-20 minutes");
    const slack = mockSlack();
    await runSlackNotifications(env);
    expect(slack.calls).toHaveLength(0);
  });

  it("never messages someone who is no longer a member of the workspace", async () => {
    const { env, notify } = await world();
    notify("n1", "u-gone", "-20 minutes");
    const slack = mockSlack();
    await runSlackNotifications(env);
    expect(slack.calls).toHaveLength(0);
  });

  it("caches an email with no Slack user and doesn't look it up again on the next sweep", async () => {
    const { env, raw, notify, sentIds } = await world();
    notify("n1", "u-ana", "-20 minutes");
    const slack = mockSlack({ "users.lookupByEmail": () => ({ ok: false, error: "users_not_found" }) });

    await runSlackNotifications(env);
    await runSlackNotifications(env);

    expect(slack.calls.filter((c) => c.method === "users.lookupByEmail")).toHaveLength(1);
    expect(slack.posts()).toHaveLength(0);
    expect(sentIds()).toEqual([]);
    expect(raw.prepare(`SELECT slack_user_id FROM slack_user_links WHERE user_id = 'u-ana'`).get()).toEqual({ slack_user_id: null });
  });

  it("removes the installation when Slack says the token was revoked", async () => {
    const { env, raw, notify } = await world();
    notify("n1", "u-ana", "-20 minutes");
    mockSlack({ "chat.postMessage": () => ({ ok: false, error: "token_revoked" }) });
    await runSlackNotifications(env);
    expect(raw.prepare(`SELECT COUNT(*) AS n FROM slack_installations`).get()).toEqual({ n: 0 });
  });

  it("in dry run, calls nothing on slack.com", async () => {
    const { env, notify, sentIds } = await world();
    (env as unknown as { SLACK_DRY_RUN: string }).SLACK_DRY_RUN = "1";
    vi.spyOn(console, "info").mockImplementation(() => {});
    notify("n1", "u-ana", "-20 minutes");
    const slack = mockSlack();
    await runSlackNotifications(env);
    expect(slack.fetchMock).not.toHaveBeenCalled();
    expect(sentIds()).toEqual(["n1"]);
  });
});

describe("buildNotificationMessage", () => {
  it("escapes Slack's control characters so a task name can't forge a link or mention", () => {
    expect(escapeSlackText("<!channel> & <http://evil|x>")).toBe("&lt;!channel&gt; &amp; &lt;http://evil|x&gt;");
    const message = buildNotificationMessage([{ title: "Ana assigned you \"<!here>\"", body: "b", link: "/tasks/1" }], "http://app.test");
    expect(JSON.stringify(message.blocks)).not.toContain("<!here>");
  });

  it("caps a long backlog and points to the app for the rest", () => {
    const items = Array.from({ length: 13 }, (_, i) => ({ title: `t${i}`, body: "b", link: null }));
    const message = buildNotificationMessage(items, "http://app.test");
    expect(message.blocks.filter((b) => (b as { type: string }).type === "section")).toHaveLength(11);
    expect(JSON.stringify(message.blocks)).toContain("and 3 more");
  });
});
