import { test, expect, type Page } from "@playwright/test";
import { workspaceWithMember, inviteOutsider } from "./team";
import { createProject } from "./project-helpers";

interface NotificationsResponse {
  notifications: { body: string }[];
  unreadCount: number;
}

async function memberUserId(owner: Page, workspaceId: string, email: string): Promise<string> {
  const org = (await (
    await owner.request.get(`/api/auth/organization/get-full-organization?organizationId=${workspaceId}`)
  ).json()) as { members: { userId: string; user: { email: string } }[] };
  const row = org.members.find((m) => m.user.email === email);
  if (!row) throw new Error("member row not found");
  return row.userId;
}

test("notifications are scoped to the active workspace, and a long comment body is stored as a short excerpt", async ({
  browser,
}) => {
  const team = await workspaceWithMember(browser);
  const { owner, member, memberHeaders, workspaceId: workspaceId1, email } = team;
  const project = await createProject(owner, { name: "Notification Scoping Project" });
  const created = await owner.request.post("/api/tasks", {
    data: { name: "Mentioned in a comment", projectId: project.id },
  });
  const task = (await created.json()) as { id: string };
  const memberId = await memberUserId(owner, workspaceId1, email);

  // Comfortably over the 140-char excerpt cap once prefixed with the task name.
  const longComment = "Please rework this section entirely — ".repeat(10);
  const commentRes = await owner.request.post(`/api/tasks/${task.id}/comments`, {
    data: { body: longComment, mentionedUserIds: [memberId] },
  });
  expect(commentRes.ok(), await commentRes.text()).toBeTruthy();

  await expect
    .poll(async () => {
      const res = (await (await member.request.get("/api/notifications")).json()) as NotificationsResponse;
      return res.unreadCount;
    }, { timeout: 8000 })
    .toBeGreaterThan(0);

  const inFirstWorkspace = (await (
    await member.request.get("/api/notifications")
  ).json()) as NotificationsResponse;
  expect(inFirstWorkspace.notifications).toHaveLength(1);
  const [notification] = inFirstWorkspace.notifications;
  expect(notification.body.length).toBeLessThanOrEqual(140);
  expect(longComment.length).toBeGreaterThan(140);
  expect(notification.body.endsWith("…")).toBe(true);

  // Move the same member into a second, unrelated workspace and switch their active org to it.
  const secondInvite = await inviteOutsider(browser);
  const invite2 = await secondInvite.owner.request.post("/api/auth/organization/invite-member", {
    data: { email, role: "member", organizationId: secondInvite.workspaceId },
    headers: secondInvite.ownerHeaders,
  });
  expect(invite2.ok(), await invite2.text()).toBeTruthy();
  const { id: invitation2Id } = (await invite2.json()) as { id: string };
  const accepted2 = await member.request.post("/api/auth/organization/accept-invitation", {
    data: { invitationId: invitation2Id },
    headers: memberHeaders,
  });
  expect(accepted2.ok(), await accepted2.text()).toBeTruthy();
  const activated2 = await member.request.post("/api/auth/organization/set-active", {
    data: { organizationId: secondInvite.workspaceId },
    headers: memberHeaders,
  });
  expect(activated2.ok(), await activated2.text()).toBeTruthy();

  // Second workspace has never had a notification — the first workspace's must not leak in.
  const inSecondWorkspace = (await (
    await member.request.get("/api/notifications")
  ).json()) as NotificationsResponse;
  expect(inSecondWorkspace.notifications).toHaveLength(0);
  expect(inSecondWorkspace.unreadCount).toBe(0);

  // Switching back proves the first workspace's notification wasn't lost, only hidden while inactive.
  const reactivated = await member.request.post("/api/auth/organization/set-active", {
    data: { organizationId: workspaceId1 },
    headers: memberHeaders,
  });
  expect(reactivated.ok(), await reactivated.text()).toBeTruthy();
  const backInFirstWorkspace = (await (
    await member.request.get("/api/notifications")
  ).json()) as NotificationsResponse;
  expect(backInFirstWorkspace.notifications).toHaveLength(1);

  await owner.context().close();
  await member.context().close();
  await secondInvite.owner.context().close();
});
