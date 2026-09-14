import type { Page } from "@playwright/test";

// Creates a fresh account and lands on the authenticated app shell. Each test
// gets its own workspace, so entries never collide.
//
// Signup goes through the API: access is invite-only, and @example.com is the
// dev-build bootstrap domain allowed to self-register with a password (see
// src/worker/lib/invite-only.ts). The session cookie is shared with the page.
export async function signUp(page: Page) {
  const email = `test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  // Land on the app first so we know the real origin — Better Auth rejects
  // requests without an Origin header, and API-context requests don't send one.
  await page.goto("/login");
  const origin = new URL(page.url()).origin;
  const res = await page.request.post("/api/auth/sign-up/email", {
    data: { name: "Test User", email, password: "TestPassword123!" },
    headers: { origin },
  });
  if (!res.ok()) {
    throw new Error(`e2e sign-up failed: ${res.status()} ${await res.text()}`);
  }
  await page.goto("/");
  await page.waitForURL("/");
  return { email };
}
