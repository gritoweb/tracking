import { afterEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { createMigratedD1 } from "../../test/sqlite-d1";
import { decryptJSON } from "../lib/crypto";
import { slackRouter } from "./slack";

const SECRET = "test-secret-for-slack-credentials";

function world() {
  const { db, raw } = createMigratedD1();
  raw.exec(`
    INSERT INTO workspaces (id, name) VALUES ('ws-A', 'A'), ('ws-B', 'B');
    INSERT INTO "user" (id, name, email, createdAt, updatedAt) VALUES
      ('u-owner', 'owner', 'owner@x.test', '2026-01-01 00:00:00', '2026-01-01 00:00:00'),
      ('u-member', 'member', 'member@x.test', '2026-01-01 00:00:00', '2026-01-01 00:00:00');
    INSERT INTO "member" (id, organizationId, userId, role, createdAt) VALUES
      ('m1', 'ws-A', 'u-owner', 'owner', '2026-01-01'),
      ('m2', 'ws-A', 'u-member', 'member', '2026-01-01'),
      ('m3', 'ws-B', 'u-owner', 'owner', '2026-01-01');
  `);
  const env = {
    DB: db,
    AUTH_SECRET: SECRET,
    APP_URL: "http://localhost",
    SLACK_CLIENT_ID: "client-id",
    SLACK_CLIENT_SECRET: "client-secret",
  } as unknown as Env;
  const as = (userId: string, workspaceId = "ws-A") => {
    const app = new Hono<{ Bindings: Env; Variables: { workspaceId: string; userId: string } }>()
      .use("*", async (c, next) => {
        c.set("workspaceId", workspaceId);
        c.set("userId", userId);
        await next();
      })
      .route("/", slackRouter);
    return (path: string, init?: RequestInit) => app.request(`http://localhost${path}`, init, env);
  };
  return { raw, as };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Starts the OAuth flow as `userId` and returns the state token plus the cookie the browser would send back. */
async function startConnect(request: ReturnType<ReturnType<typeof world>["as"]>) {
  const res = await request("/connect");
  const location = new URL(res.headers.get("Location")!);
  const cookie = res.headers.get("Set-Cookie")!.split(";")[0];
  return { res, location, state: location.searchParams.get("state")!, cookie };
}

describe("slack routes", () => {
  it("only an owner/admin can start the install", async () => {
    const { as } = world();
    const res = await as("u-member")("/connect");
    expect(res.headers.get("Location")).toBe("/settings?slack=forbidden");

    const { location } = await startConnect(as("u-owner"));
    expect(location.origin + location.pathname).toBe("https://slack.com/oauth/v2/authorize");
    expect(location.searchParams.get("scope")).toBe("chat:write,users:read,users:read.email");
  });

  it("stores the bot token encrypted after a valid callback", async () => {
    const { as, raw } = world();
    const owner = as("u-owner");
    const { state, cookie } = await startConnect(owner);
    vi.stubGlobal("fetch", async () =>
      new Response(JSON.stringify({ ok: true, access_token: "xoxb-real", bot_user_id: "B1", team: { id: "T1", name: "Acme" } }))
    );

    const res = await owner(`/callback?code=abc&state=${state}`, { headers: { Cookie: cookie } });

    expect(res.headers.get("Location")).toBe("/settings?slack=connected");
    const row = raw.prepare(`SELECT team_name, credentials FROM slack_installations WHERE workspace_id = 'ws-A'`).get() as {
      team_name: string;
      credentials: string;
    };
    expect(row.team_name).toBe("Acme");
    expect(row.credentials).not.toContain("xoxb-real");
    expect(await decryptJSON(SECRET, row.credentials)).toEqual({ botToken: "xoxb-real" });
  });

  it("refuses a callback whose state was started in another workspace", async () => {
    const { as, raw } = world();
    const { state, cookie } = await startConnect(as("u-owner", "ws-B"));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await as("u-owner", "ws-A")(`/callback?code=abc&state=${state}`, { headers: { Cookie: cookie } });

    expect(res.headers.get("Location")).toBe("/settings?slack=error");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(raw.prepare(`SELECT COUNT(*) AS n FROM slack_installations`).get()).toEqual({ n: 0 });
  });

  it("refuses a callback with a forged state", async () => {
    const { as } = world();
    const { cookie } = await startConnect(as("u-owner"));
    const res = await as("u-owner")(`/callback?code=abc&state=forged`, { headers: { Cookie: cookie } });
    expect(res.headers.get("Location")).toBe("/settings?slack=error");
  });

  it("a member can't disconnect Slack", async () => {
    const { as } = world();
    expect((await as("u-member")("/", { method: "DELETE" })).status).toBe(403);
  });

  it("each person can opt out, and status reflects it", async () => {
    const { as } = world();
    const member = as("u-member");
    const patch = await member("/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notify: false }),
    });
    expect(patch.status).toBe(200);
    const status = await (await member("/status")).json();
    expect(status).toEqual({ configured: true, connected: false, teamName: null, canManage: false, notify: false, linked: null });
  });
});
