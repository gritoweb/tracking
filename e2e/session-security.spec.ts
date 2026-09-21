import { test, expect } from "@playwright/test";
import { signUp } from "./auth";
import { PASSWORD } from "./team";

// SECURITY.md S-01: `list-sessions` returns the raw (unsigned) session.token from
// the DB, and better-auth's bearer() plugin used to auto-sign any unsigned token
// on the fly — so a token leaked via list-sessions authenticated on its own,
// without ever having been issued directly to the attacker. Fixed by
// bearer({ requireSignature: true }) in src/worker/auth.ts.
test.describe("session token replay (S-01)", () => {
  test("a raw token from list-sessions never authenticates as Bearer", async ({ browser, baseURL }) => {
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    const { email } = await signUp(pageA);

    // Second login, same account — simulates a second device (session B).
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await pageB.goto("/login");
    const loginB = await pageB.request.post("/api/auth/sign-in/email", {
      headers: { Origin: baseURL! },
      data: { email, password: PASSWORD },
    });
    expect(loginB.ok()).toBeTruthy();

    // Session A lists sessions and gets session B's raw token back.
    const list = await pageA.request.get("/api/auth/list-sessions");
    expect(list.ok()).toBeTruthy();
    const sessions: Array<{ token?: string }> = await list.json();
    expect(sessions.length).toBeGreaterThanOrEqual(2);
    const leaked = sessions.find((s) => typeof s.token === "string")?.token;
    expect(leaked).toBeTruthy();
    // The DB token itself carries no signature — that's the leak.
    expect(leaked).not.toContain(".");

    // Replaying that raw token as a Bearer credential must fail now.
    const hijack = await pageA.request.get("/api/me", {
      headers: { Authorization: `Bearer ${leaked}` },
    });
    expect(hijack.status()).toBe(401);
  });

  test("the extension's real signed bearer token still authenticates (no regression)", async ({ page, baseURL }) => {
    const { email } = await signUp(page);
    // A second sign-in exposes `set-auth-token` — the extension's real bearer flow.
    const res = await page.request.post("/api/auth/sign-in/email", {
      headers: { Origin: baseURL! },
      data: { email, password: PASSWORD },
    });
    expect(res.ok()).toBeTruthy();
    const signedToken = res.headers()["set-auth-token"];
    expect(signedToken).toBeTruthy();
    expect(signedToken).toContain("."); // it's the signed cookie value, not a raw token

    const me = await page.request.get("/api/me", {
      headers: { Authorization: `Bearer ${signedToken}` },
    });
    expect(me.status()).toBe(200);
  });
});
