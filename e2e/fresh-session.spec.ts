import { test, expect } from "@playwright/test";
import { signUp } from "./auth";

// Plain rename path; the day-old session case is account-rename-stale-session.spec.ts. Origin is required by Better Auth's CSRF check.
test.describe("sensitive account mutations", () => {
  test("a fresh session passes the freshness gate on update-user", async ({ page, baseURL }) => {
    await signUp(page);

    const res = await page.request.post("/api/auth/update-user", {
      headers: { Origin: baseURL! },
      data: { name: "Renamed User" },
    });

    expect(res.status()).toBe(200);
  });
});
