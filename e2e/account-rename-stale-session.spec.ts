import { test, expect } from "@playwright/test";
import { execSync } from "node:child_process";
import { signUp } from "./auth";

// Ages a session in the LOCAL D1 the dev server uses; needs CLOUDFLARE_ACCOUNT_ID in the environment, like `pnpm dev`.
const d1 = (sql: string) => execSync(`npx wrangler d1 execute time-tracker --local --json --command "${sql}"`).toString();

test("a session older than a day can still rename, but not revoke sessions", async ({ page }) => {
  await signUp(page);
  const me = await (await page.request.get("/api/auth/get-session")).json();
  const twoDaysAgo = new Date(Date.now() - 2 * 86400_000).toISOString();
  d1(`UPDATE session SET createdAt='${twoDaysAgo}' WHERE id='${me.session.id}'`);
  const origin = new URL(page.url()).origin;

  const rename = await page.request.post("/api/auth/update-user", { data: { name: "Renamed Person" }, headers: { origin } });
  expect(rename.status(), await rename.text()).toBe(200);
  const after = await (await page.request.get("/api/auth/get-session")).json();
  expect(after.user.name).toBe("Renamed Person");

  const revoke = await page.request.post("/api/auth/revoke-other-sessions", { data: {}, headers: { origin } });
  expect(revoke.status()).toBe(403);
});
