import { test, expect } from "@playwright/test";
import { signUp } from "./auth";
import { ageSession } from "./local-d1";

// ageSession writes the dev server's SQLite file from a second process; under parallel workers that can hit SQLITE_BUSY.
test.describe.configure({ retries: 1 });

test("a session older than a day can rename and sign out other devices, but not unlink a login", async ({ page }) => {
  await signUp(page);
  await ageSession(page);
  const origin = new URL(page.url()).origin;

  const rename = await page.request.post("/api/auth/update-user", { data: { name: "Renamed Person" }, headers: { origin } });
  expect(rename.status(), await rename.text()).toBe(200);
  const after = await (await page.request.get("/api/auth/get-session")).json();
  expect(after.user.name).toBe("Renamed Person");

  // Better Auth never gated these; the app's gate on them 403'd "Sign out other devices" after a day.
  const revoke = await page.request.post("/api/auth/revoke-other-sessions", { data: {}, headers: { origin } });
  expect(revoke.status()).toBe(200);

  // Better Auth gates this one itself, and the app keeps it gated — with a message the screen can show.
  const unlink = await page.request.post("/api/auth/unlink-account", { data: { providerId: "google" }, headers: { origin } });
  expect(unlink.status()).toBe(403);
  expect((await unlink.json()).message).toMatch(/sign in again/i);
});
