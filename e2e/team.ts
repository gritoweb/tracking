import { expect, type Browser, type Page } from "@playwright/test";
import { signUp } from "./auth";

export const PASSWORD = "TestPassword123!";

// Outside the dev bootstrap domain (@example.com), so only a real invitation can let these in.
export function outsiderEmail(label: string) {
  return `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@outsider.test`;
}

// Better Auth rejects requests without an Origin header, and API-context requests don't send one.
export async function originHeaders(page: Page) {
  if (!page.url().startsWith("http")) await page.goto("/login");
  return { origin: new URL(page.url()).origin };
}

export async function newPage(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  return { page, headers: await originHeaders(page) };
}

export async function signUpWithPassword(page: Page, headers: Record<string, string>, email: string) {
  return page.request.post("/api/auth/sign-up/email", {
    data: { name: "Outsider", email, password: PASSWORD },
    headers,
  });
}

/** A fresh owner (with their own workspace) who has invited one outsider email. */
export async function inviteOutsider(browser: Browser) {
  const ownerContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  const { email: ownerEmail } = await signUp(owner);
  const ownerHeaders = await originHeaders(owner);

  const orgs = await (await owner.request.get("/api/auth/organization/list")).json();
  expect(orgs).toHaveLength(1);
  const workspaceId: string = orgs[0].id;

  const email = outsiderEmail("invitee");
  const inviteRes = await owner.request.post("/api/auth/organization/invite-member", {
    data: { email, role: "member", organizationId: workspaceId },
    headers: ownerHeaders,
  });
  expect(inviteRes.ok()).toBeTruthy();
  const invitation = await inviteRes.json();
  return { owner, ownerEmail, ownerHeaders, workspaceId, email, invitationId: invitation.id as string };
}

/** An owner and one member who accepted, each in their own browser context and pinned to the shared workspace. */
export async function workspaceWithMember(browser: Browser) {
  const invite = await inviteOutsider(browser);
  const { page: member, headers: memberHeaders } = await newPage(browser);
  expect((await signUpWithPassword(member, memberHeaders, invite.email)).ok()).toBeTruthy();

  const accepted = await member.request.post("/api/auth/organization/accept-invitation", {
    data: { invitationId: invite.invitationId },
    headers: memberHeaders,
  });
  expect(accepted.ok()).toBeTruthy();
  const active = await member.request.post("/api/auth/organization/set-active", {
    data: { organizationId: invite.workspaceId },
    headers: memberHeaders,
  });
  expect(active.ok()).toBeTruthy();

  return { ...invite, member, memberHeaders };
}
