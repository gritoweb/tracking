import { test, expect, type Page } from "@playwright/test";
import { createProject } from "./project-helpers";
import { ageSession } from "./local-d1";
import { PASSWORD, newPage, signUpWithPassword, workspaceWithMember } from "./team";

// ageSession writes the dev server's SQLite file from a second process; under parallel workers that can hit SQLITE_BUSY.
test.describe.configure({ retries: 1 });

const signIn = (page: Page, headers: Record<string, string>, email: string) =>
  page.request.post("/api/auth/sign-in/email", { data: { email, password: PASSWORD }, headers });

test("deleting an account deactivates it, keeps its time, and an invitation brings it back", async ({ browser }) => {
  const { owner, ownerHeaders, workspaceId, email, member, memberHeaders } = await workspaceWithMember(browser);
  const project = await createProject(owner);
  const start = new Date(Date.now() - 2 * 3600_000).toISOString();
  const stop = new Date(Date.now() - 3600_000).toISOString();
  const logged = await member.request.post("/api/time_entries", {
    data: { projectId: project.id, start, stop, description: "Member's hour" },
    headers: memberHeaders,
  });
  expect(logged.ok(), await logged.text()).toBeTruthy();
  const entry = await logged.json();

  // A second device, then a day-old session: "Sign out other devices" still works.
  const { page: laptop, headers: laptopHeaders } = await newPage(browser);
  expect((await signIn(laptop, laptopHeaders, email)).ok()).toBeTruthy();
  await ageSession(member);
  expect((await member.request.post("/api/auth/revoke-other-sessions", { data: {}, headers: memberHeaders })).status()).toBe(200);
  // Checked against D1, not the 5-minute signed cookie cache (auth.ts cookieCache).
  expect(await (await laptop.request.get("/api/auth/get-session?disableCookieCache=true")).json()).toBeNull();
  expect((await laptop.request.get("/api/me")).status()).toBe(401);

  // Deactivating from a day-old session asks to sign in again, in words the screen can show.
  const stale = await member.request.post("/api/auth/delete-user", { data: {}, headers: memberHeaders });
  expect(stale.status()).toBe(403);
  expect((await stale.json()).message).toMatch(/sign in again/i);

  expect((await signIn(member, memberHeaders, email)).ok()).toBeTruthy();
  const deactivated = await member.request.post("/api/auth/delete-user", { data: {}, headers: memberHeaders });
  expect(deactivated.status(), await deactivated.text()).toBe(200);

  // Out, and can't come back on their own: no sign-in, no fresh sign-up with the same email.
  expect((await member.request.get("/api/me")).status()).toBe(401);
  expect((await signIn(member, memberHeaders, email)).ok()).toBeFalsy();
  const { page: again, headers: againHeaders } = await newPage(browser);
  expect((await signUpWithPassword(again, againHeaders, email)).ok()).toBeFalsy();

  // Their hour is still in the workspace, still credited to them.
  const entries = await (await owner.request.get("/api/time_entries")).json();
  const kept = entries.find((e: { id: string }) => e.id === entry.id);
  expect(kept?.userName).toBe("Outsider");

  // Invited again: they can sign in, accept, and are back in the workspace.
  const reinvite = await owner.request.post("/api/auth/organization/invite-member", {
    data: { email, role: "member", organizationId: workspaceId },
    headers: ownerHeaders,
  });
  expect(reinvite.ok(), await reinvite.text()).toBeTruthy();
  const { id: invitationId } = await reinvite.json();
  expect((await signIn(member, memberHeaders, email)).ok()).toBeTruthy();
  const accepted = await member.request.post("/api/auth/organization/accept-invitation", {
    data: { invitationId },
    headers: memberHeaders,
  });
  expect(accepted.ok(), await accepted.text()).toBeTruthy();
  const orgs = await (await member.request.get("/api/auth/organization/list")).json();
  expect(orgs.map((o: { id: string }) => o.id)).toEqual([workspaceId]);

  await laptop.close();
  await again.close();
});

test("the only owner can't deactivate, and the hard delete is closed", async ({ browser }) => {
  const { owner, ownerHeaders } = await workspaceWithMember(browser);
  const refused = await owner.request.post("/api/auth/delete-user", { data: {}, headers: ownerHeaders });
  expect(refused.status()).toBe(409);
  expect((await refused.json()).code).toBe("LAST_OWNER");
  expect((await owner.request.get("/api/me")).ok()).toBeTruthy();

  const hard = await owner.request.post("/api/auth/admin/remove-user", { data: { userId: "anyone" }, headers: ownerHeaders });
  expect(hard.status()).toBe(403);
});
