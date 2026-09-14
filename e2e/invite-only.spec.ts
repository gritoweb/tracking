import { test, expect, type Browser, type Page } from "@playwright/test";
import { signUp } from "./auth";

const PASSWORD = "TestPassword123!";

// Outside the dev bootstrap domain (@example.com), so only a real invitation can let these in.
function outsiderEmail(label: string) {
  return `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@outsider.test`;
}

// Better Auth rejects requests without an Origin header, and API-context requests don't send one.
async function originHeaders(page: Page) {
  if (!page.url().startsWith("http")) await page.goto("/login");
  return { origin: new URL(page.url()).origin };
}

async function newPage(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  return { page, headers: await originHeaders(page) };
}

async function signUpWithPassword(page: Page, headers: Record<string, string>, email: string) {
  return page.request.post("/api/auth/sign-up/email", {
    data: { name: "Outsider", email, password: PASSWORD },
    headers,
  });
}

async function inviteOutsider(browser: Browser) {
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

test.describe("invite-only access", () => {
  test("refuses account creation without an invitation on every self-serve path", async ({ page }) => {
    const headers = await originHeaders(page);
    const email = outsiderEmail("stranger");

    const signUpRes = await signUpWithPassword(page, headers, email);
    expect(signUpRes.status()).toBe(403);
    expect((await signUpRes.json()).code).toBe("INVITE_ONLY");

    const otpRes = await page.request.post("/api/auth/email-otp/send-verification-otp", {
      data: { email, type: "sign-in" },
      headers,
    });
    expect(otpRes.status()).toBe(403);
    expect((await otpRes.json()).code).toBe("INVITE_ONLY");

    const magicLinkRes = await page.request.post("/api/auth/sign-in/magic-link", {
      data: { email, callbackURL: "/" },
      headers,
    });
    expect(magicLinkRes.status()).toBe(403);
    expect((await magicLinkRes.json()).code).toBe("INVITE_ONLY");

    // The refusals left no account behind.
    const signInRes = await page.request.post("/api/auth/sign-in/email", {
      data: { email, password: PASSWORD },
      headers,
    });
    expect(signInRes.ok()).toBeFalsy();
  });

  test("a workspace owner who is not an admin cannot open another workspace", async ({ page }) => {
    await signUp(page);
    const headers = await originHeaders(page);
    const created = await page.request.post("/api/auth/organization/create", {
      data: { name: "Second workspace", slug: `second-${Date.now()}` },
      headers,
    });
    expect(created.status()).toBe(403);
  });

  test("an invited email creates its account, joins only the inviting workspace, and can neither open nor invite", async ({
    browser,
  }) => {
    const { workspaceId, email, invitationId } = await inviteOutsider(browser);
    const { page: invitee, headers } = await newPage(browser);

    expect((await signUpWithPassword(invitee, headers, email)).ok()).toBeTruthy();

    // No personal workspace for an invitee.
    const before = await (await invitee.request.get("/api/auth/organization/list")).json();
    expect(before).toEqual([]);

    const rogueWorkspace = await invitee.request.post("/api/auth/organization/create", {
      data: { name: "Rogue workspace", slug: `rogue-${Date.now()}` },
      headers,
    });
    expect(rogueWorkspace.status()).toBe(403);

    const accepted = await invitee.request.post("/api/auth/organization/accept-invitation", {
      data: { invitationId },
      headers,
    });
    expect(accepted.ok()).toBeTruthy();

    const after = await (await invitee.request.get("/api/auth/organization/list")).json();
    expect(after.map((o: { id: string }) => o.id)).toEqual([workspaceId]);

    // A plain member cannot bring anyone else in.
    const memberInvite = await invitee.request.post("/api/auth/organization/invite-member", {
      data: { email: outsiderEmail("friend"), role: "member", organizationId: workspaceId },
      headers,
    });
    expect(memberInvite.ok()).toBeFalsy();
  });

  test("an invitation creates no account once the inviting workspace has no trusted owner", async ({
    browser,
  }) => {
    const { owner, ownerEmail, ownerHeaders, workspaceId, email, invitationId } =
      await inviteOutsider(browser);
    const { page: newOwner, headers: newOwnerHeaders } = await newPage(browser);
    expect((await signUpWithPassword(newOwner, newOwnerHeaders, email)).ok()).toBeTruthy();
    const accepted = await newOwner.request.post("/api/auth/organization/accept-invitation", {
      data: { invitationId },
      headers: newOwnerHeaders,
    });
    expect(accepted.ok()).toBeTruthy();

    // Hand ownership to the outsider, then step down: no ADMIN_EMAILS/bootstrap owner remains.
    const org = await (
      await owner.request.get(`/api/auth/organization/get-full-organization?organizationId=${workspaceId}`)
    ).json();
    const memberIdFor = (memberEmail: string) =>
      org.members.find((m: { user: { email: string } }) => m.user.email === memberEmail).id as string;
    const promoted = await owner.request.post("/api/auth/organization/update-member-role", {
      data: { memberId: memberIdFor(email), role: "owner", organizationId: workspaceId },
      headers: ownerHeaders,
    });
    expect(promoted.ok()).toBeTruthy();
    const demoted = await owner.request.post("/api/auth/organization/update-member-role", {
      data: { memberId: memberIdFor(ownerEmail), role: "member", organizationId: workspaceId },
      headers: ownerHeaders,
    });
    expect(demoted.ok()).toBeTruthy();

    const untrustedEmail = outsiderEmail("untrusted-invitee");
    const invited = await newOwner.request.post("/api/auth/organization/invite-member", {
      data: { email: untrustedEmail, role: "member", organizationId: workspaceId },
      headers: newOwnerHeaders,
    });
    expect(invited.ok()).toBeTruthy();

    const { page: stranger, headers: strangerHeaders } = await newPage(browser);
    const refused = await signUpWithPassword(stranger, strangerHeaders, untrustedEmail);
    expect(refused.status()).toBe(403);
    expect((await refused.json()).code).toBe("INVITE_ONLY");
  });

  test("an invitee without a workspace is held off the app and joins through the invitation link", async ({
    browser,
  }) => {
    const { email, invitationId } = await inviteOutsider(browser);
    const { page: invitee, headers } = await newPage(browser);
    expect((await signUpWithPassword(invitee, headers, email)).ok()).toBeTruthy();

    await invitee.goto("/");
    const heading = invitee.getByRole("heading", { name: "You're not in a workspace yet" });
    const appNavigation = invitee.getByRole("navigation", { name: "Main" });
    await expect(heading).toBeVisible();
    // A password sign-up is unverified, and Better Auth lists invitations only for a verified address.
    await expect(invitee.getByText("sign in with an email code")).toBeVisible();
    // Regression guard: the app shell once replaced this screen a few seconds after it rendered.
    await invitee.waitForTimeout(3000);
    await expect(heading).toBeVisible();
    await expect(appNavigation).toHaveCount(0);

    await invitee.goto(`/accept-invite?id=${invitationId}`);
    await expect(appNavigation).toBeVisible();
    await expect(heading).toHaveCount(0);
    await expect(invitee.getByText("invalid or has expired")).toHaveCount(0);
  });

  test("the login page offers no self sign-up", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText("Access is by invitation only.")).toBeVisible();
    await expect(page.getByRole("link", { name: /sign up/i })).toHaveCount(0);

    await page.goto("/signup");
    await page.waitForURL("**/login");
  });
});
