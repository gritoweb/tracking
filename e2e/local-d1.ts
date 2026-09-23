import { execSync } from "node:child_process";
import type { Page } from "@playwright/test";

// Runs SQL on the LOCAL D1 the dev server uses; needs CLOUDFLARE_ACCOUNT_ID in the environment, like `pnpm dev`.
export function localD1(sql: string): string {
  for (let attempt = 1; ; attempt++) {
    try {
      return execSync(`npx wrangler d1 execute time-tracker --local --json --command "${sql}"`, { stdio: "pipe" }).toString();
    } catch (err) {
      const e = err as { stderr?: Buffer; stdout?: Buffer };
      const detail = `${e.stderr?.toString() ?? ""}${e.stdout?.toString() ?? ""}`;
      // The dev server holds the same SQLite file, so a write can briefly hit a lock.
      if (attempt < 5 && /SQLITE_BUSY|locked/i.test(detail)) continue;
      throw new Error(`local D1 failed: ${detail.slice(0, 800)}`, { cause: err });
    }
  }
}

/** Backdates the page's session by two days, past the one-day fresh-session window. */
export async function ageSession(page: Page) {
  const { session } = await (await page.request.get("/api/auth/get-session")).json();
  localD1(`UPDATE session SET createdAt='${new Date(Date.now() - 2 * 86400_000).toISOString()}' WHERE id='${session.id}'`);
}
