import { test, expect } from "@playwright/test";
import { signUp } from "./auth";
import { createProject } from "./project-helpers";
import { workspaceWithMember } from "./team";

// D8 — flat, single-level task comments (no reply/thread) and the @mention notification bell.

test("posting, editing and deleting a comment through the panel", async ({ page }) => {
  await signUp(page);
  const project = await createProject(page, { name: "ERP Migration", color: "#e11d48" });
  const created = await page.request.post("/api/tasks", {
    data: { name: "Cutover plan", projectId: project.id },
  });
  const task = await created.json();

  await page.goto(`/tasks/${task.id}`);
  const panel = page.getByRole("dialog", { name: "Cutover plan" });
  await expect(panel).toBeVisible();

  await panel.getByPlaceholder("Write a comment…").fill("First pass looks good");
  await panel.getByRole("button", { name: "Comment" }).click();
  await expect(panel.getByText("First pass looks good")).toBeVisible();
  await expect(panel.getByText("Test User")).toBeVisible();

  await panel.getByRole("button", { name: "Edit comment" }).click();
  const editBox = panel.getByRole("textbox", { name: "Edit comment" });
  await editBox.fill("First pass looks good — ship it");
  await panel.getByRole("button", { name: "Save" }).click();
  await expect(panel.getByText("First pass looks good — ship it")).toBeVisible();
  await expect(panel.getByText("edited")).toBeVisible();

  await panel.getByRole("button", { name: "Delete comment" }).click();
  await expect(panel.getByText("First pass looks good", { exact: false })).not.toBeVisible();
});

test("a member cannot edit or delete another member's comment (API)", async ({ browser }) => {
  const { owner, ownerHeaders, member, memberHeaders } = await workspaceWithMember(browser);
  const project = await createProject(owner, { name: "ERP Migration", color: "#e11d48" });
  const task = await (
    await owner.request.post("/api/tasks", {
      data: { name: "Cutover plan", projectId: project.id },
      headers: ownerHeaders,
    })
  ).json();

  const comment = await (
    await owner.request.post(`/api/tasks/${task.id}/comments`, {
      data: { body: "Owner's note" },
      headers: ownerHeaders,
    })
  ).json();

  const blockedEdit = await member.request.patch(`/api/tasks/${task.id}/comments/${comment.id}`, {
    data: { body: "hijacked" },
    headers: memberHeaders,
  });
  expect(blockedEdit.status()).toBe(403);

  const blockedDelete = await member.request.delete(`/api/tasks/${task.id}/comments/${comment.id}`, {
    headers: memberHeaders,
  });
  expect(blockedDelete.status()).toBe(403);

  await owner.context().close();
  await member.context().close();
});

test("@mentioning a member notifies them, live in the bell, and never notifies yourself", async ({
  browser,
}) => {
  const { owner, ownerHeaders, member } = await workspaceWithMember(browser);
  const project = await createProject(owner, { name: "ERP Migration", color: "#e11d48" });
  const task = await (
    await owner.request.post("/api/tasks", {
      data: { name: "Cutover plan", projectId: project.id },
      headers: ownerHeaders,
    })
  ).json();

  const membersRes = await owner.request.get(
    `/api/auth/organization/get-full-organization?organizationId=${task.workspaceId}`
  );
  const org = await membersRes.json();
  const memberUserId = org.members.find((m: { role: string }) => m.role === "member").userId as string;
  expect(memberUserId).toBeTruthy();

  // Mentioning both the member and the owner's own id — only the member gets notified.
  const ownerUserId = org.members.find((m: { role: string }) => m.role === "owner").userId as string;
  const posted = await owner.request.post(`/api/tasks/${task.id}/comments`, {
    data: { body: "@Outsider can you take a look?", mentionedUserIds: [memberUserId, ownerUserId] },
    headers: ownerHeaders,
  });
  expect(posted.ok()).toBeTruthy();

  await member.goto("/");
  const bell = member.getByRole("button", { name: /Notifications/ });
  await expect(bell).toBeVisible();
  await expect
    .poll(async () => (await member.request.get("/api/notifications")).json().then((d) => d.unreadCount), {
      timeout: 8000,
    })
    .toBeGreaterThan(0);
  await bell.click();
  await expect(member.getByText("Test User mentioned you", { exact: false })).toBeVisible();

  // The owner mentioned themself too — never their own notification.
  const ownerNotifications = await (await owner.request.get("/api/notifications")).json();
  expect(ownerNotifications.notifications).toHaveLength(0);

  await owner.context().close();
  await member.context().close();
});

test("mentioning someone who isn't (or no longer is) a member notifies nobody — fail closed", async ({
  page,
}) => {
  await signUp(page);
  const origin = new URL(page.url()).origin;
  const project = await createProject(page, { name: "ERP Migration", color: "#e11d48" });
  const task = await (
    await page.request.post("/api/tasks", {
      data: { name: "Cutover plan", projectId: project.id },
      headers: { origin },
    })
  ).json();

  const posted = await page.request.post(`/api/tasks/${task.id}/comments`, {
    data: { body: "@ghost this id isn't real", mentionedUserIds: ["not-a-real-user-id"] },
    headers: { origin },
  });
  expect(posted.ok()).toBeTruthy();
  const comment = await posted.json();
  expect(comment.mentionedUserIds).toEqual([]);
});
