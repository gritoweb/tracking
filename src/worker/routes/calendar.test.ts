import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { calendarRouter } from "./calendar";

const app = new Hono<{ Bindings: Env; Variables: { workspaceId: string; userId: string } }>()
  .use("*", async (c, next) => {
    c.set("workspaceId", "ws-A");
    c.set("userId", "user-1");
    await next();
  })
  .route("/", calendarRouter);

const configured = { GOOGLE_CALENDAR_CLIENT_ID: "id", GOOGLE_CALENDAR_CLIENT_SECRET: "secret" } as unknown as Env;
const unconfigured = {} as unknown as Env;

async function connect(origin: string) {
  const res = await app.request(`${origin}/google/connect`, {}, configured);
  const state = new URL(res.headers.get("Location") ?? "").searchParams.get("state");
  return { res, state, setCookie: res.headers.get("Set-Cookie") ?? "" };
}
const stateValue = (state: string | null) => ["state", "google", "ws-A", "user-1"].map((p, i) => (i === 0 ? state : p)).join(".");

describe("calendar OAuth state cookie", () => {
  it("is __Host- prefixed over https, so a sibling subdomain cannot plant or overwrite it", async () => {
    const { res, state, setCookie } = await connect("https://app.example.com");
    expect(res.status).toBe(302);
    expect(setCookie).toMatch(/^__Host-tt_cal_state=/);
    expect(setCookie).toMatch(/Secure/);
    expect(setCookie).toMatch(/Path=\//);
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/SameSite=Lax/);
    expect(setCookie).not.toMatch(/Domain=/i);
    expect(decodeURIComponent(setCookie)).toContain(String(state));
  });

  it("keeps the plain name over http, where a Secure cookie cannot be set (local dev)", async () => {
    const { setCookie } = await connect("http://localhost:5173");
    expect(setCookie).toMatch(/^tt_cal_state=/);
    expect(setCookie).not.toMatch(/Secure/);
  });

  it("accepts the callback that carries the matching __Host- cookie and clears it", async () => {
    const res = await app.request(
      "https://app.example.com/google/callback?code=c&state=abc",
      { headers: { Cookie: `__Host-tt_cal_state=${stateValue("abc")}` } },
      unconfigured
    );
    // Past the state check, and stopped only because this test has no provider credentials.
    expect(res.headers.get("Location")).toBe("/settings?calendar=not_configured");
    expect(res.headers.get("Set-Cookie")).toMatch(/^__Host-tt_cal_state=;/);
  });

  it("ignores a plain-named cookie over https: one planted from another subdomain is not the state", async () => {
    const res = await app.request(
      "https://app.example.com/google/callback?code=c&state=abc",
      { headers: { Cookie: `tt_cal_state=${stateValue("abc")}` } },
      unconfigured
    );
    expect(res.headers.get("Location")).toBe("/settings?calendar=error");
  });

  it.each([
    ["a state that does not match", "https://app.example.com/google/callback?code=c&state=other", stateValue("abc")],
    ["another person's cookie", "https://app.example.com/google/callback?code=c&state=abc", "abc.google.ws-A.someone-else"],
    ["another workspace's cookie", "https://app.example.com/google/callback?code=c&state=abc", "abc.google.ws-B.user-1"],
    ["the other provider's cookie", "https://app.example.com/google/callback?code=c&state=abc", "abc.microsoft.ws-A.user-1"],
  ])("refuses %s", async (_name, url, cookie) => {
    const res = await app.request(url, { headers: { Cookie: `__Host-tt_cal_state=${cookie}` } }, unconfigured);
    expect(res.headers.get("Location")).toBe("/settings?calendar=error");
  });

  it("refuses a callback with no cookie at all", async () => {
    const res = await app.request("https://app.example.com/google/callback?code=c&state=abc", {}, unconfigured);
    expect(res.headers.get("Location")).toBe("/settings?calendar=error");
  });
});
