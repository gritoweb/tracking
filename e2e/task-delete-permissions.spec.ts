import { test, expect, type Browser } from "@playwright/test";
import { outsiderEmail, inviteOutsider, newPage, signUpWithPassword } from "./team";
import { signUp } from "./auth";
import { createProject } from "./project-helpers";

// A well-known 1x1 transparent PNG, small enough to inline as a fixture.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

/** Owner plus two members: one who will author the tasks below, one who is neither the author nor a manager. */
async function workspaceWithTwoMembers(browser: Browser) {
  const invite = await inviteOutsider(browser);
  const { page: author, headers: authorHeaders } = await newPage(browser);
  expect((await signUpWithPassword(author, authorHeaders, invite.email)).ok()).toBeTruthy();
  await author.request.post("/api/auth/organization/accept-invitation", {
    data: { invitationId: invite.invitationId },
    headers: authorHeaders,
  });
  await author.request.post("/api/auth/organization/set-active", {
    data: { organizationId: invite.workspaceId },
    headers: authorHeaders,
  });

  const neutralEmail = outsiderEmail("neutral");
  const neutralInvite = await invite.owner.request.post("/api/auth/organization/invite-member", {
    data: { email: neutralEmail, role: "member", organizationId: invite.workspaceId },
    headers: invite.ownerHeaders,
  });
  expect(neutralInvite.ok(), await neutralInvite.text()).toBeTruthy();
  const { id: neutralInvitationId } = (await neutralInvite.json()) as { id: string };

  const { page: outsider, headers: outsiderHeaders } = await newPage(browser);
  expect((await signUpWithPassword(outsider, outsiderHeaders, neutralEmail)).ok()).toBeTruthy();
  await outsider.request.post("/api/auth/organization/accept-invitation", {
    data: { invitationId: neutralInvitationId },
    headers: outsiderHeaders,
  });
  await outsider.request.post("/api/auth/organization/set-active", {
    data: { organizationId: invite.workspaceId },
    headers: outsiderHeaders,
  });

  return { owner: invite.owner, ownerHeaders: invite.ownerHeaders, workspaceId: invite.workspaceId, author, outsider };
}

test.describe("task and attachment delete permissions", () => {
  test("a member who is neither the author nor a manager cannot delete someone else's task; the author and the owner both can", async ({
    browser,
  }) => {
    const { owner, author, outsider } = await workspaceWithTwoMembers(browser);
    const project = await createProject(author, { name: "Task Delete Project" });

    const created1 = await author.request.post("/api/tasks", {
      data: { name: "Authored by member", projectId: project.id },
    });
    const task1 = (await created1.json()) as { id: string };

    const forbidden = await outsider.request.delete(`/api/tasks/${task1.id}`);
    expect(forbidden.status()).toBe(403);
    expect((await forbidden.json()).error).toBe(
      "Only the task's author or a workspace manager can delete it"
    );

    const authorDeletes = await author.request.delete(`/api/tasks/${task1.id}`);
    expect(authorDeletes.ok(), await authorDeletes.text()).toBeTruthy();

    const created2 = await author.request.post("/api/tasks", {
      data: { name: "Authored by member, closed by owner", projectId: project.id },
    });
    const task2 = (await created2.json()) as { id: string };
    const ownerDeletes = await owner.request.delete(`/api/tasks/${task2.id}`);
    expect(ownerDeletes.ok(), await ownerDeletes.text()).toBeTruthy();

    await owner.context().close();
    await author.context().close();
    await outsider.context().close();
  });

  test("a member who is neither the uploader nor a manager cannot delete someone else's attachment; the uploader and the owner both can", async ({
    browser,
  }) => {
    const { owner, author, outsider } = await workspaceWithTwoMembers(browser);
    const project = await createProject(author, { name: "Attachment Delete Project" });
    const created = await author.request.post("/api/tasks", {
      data: { name: "Has attachments", projectId: project.id },
    });
    const task = (await created.json()) as { id: string };

    const uploaded1 = await author.request.post(`/api/tasks/${task.id}/attachments`, {
      multipart: { file: { name: "one.png", mimeType: "image/png", buffer: TINY_PNG } },
    });
    const attachment1 = (await uploaded1.json()) as { id: string };

    const forbidden = await outsider.request.delete(`/api/attachments/${attachment1.id}`);
    expect(forbidden.status()).toBe(403);
    expect((await forbidden.json()).error).toBe(
      "Only the uploader or a workspace manager can delete this attachment"
    );

    const uploaderDeletes = await author.request.delete(`/api/attachments/${attachment1.id}`);
    expect(uploaderDeletes.ok(), await uploaderDeletes.text()).toBeTruthy();
    expect((await owner.request.get(`/api/attachments/${attachment1.id}`)).status()).toBe(404);

    const uploaded2 = await author.request.post(`/api/tasks/${task.id}/attachments`, {
      multipart: { file: { name: "two.png", mimeType: "image/png", buffer: TINY_PNG } },
    });
    const attachment2 = (await uploaded2.json()) as { id: string };
    const ownerDeletes = await owner.request.delete(`/api/attachments/${attachment2.id}`);
    expect(ownerDeletes.ok(), await ownerDeletes.text()).toBeTruthy();
    expect((await owner.request.get(`/api/attachments/${attachment2.id}`)).status()).toBe(404);

    await owner.context().close();
    await author.context().close();
    await outsider.context().close();
  });

  test("deleting a task cleans up every subtask's attachment, not just the first's", async ({ page }) => {
    await signUp(page);
    const project = await createProject(page, { name: "Cascade Delete Project" });

    const parentRes = await page.request.post("/api/tasks", {
      data: { name: "Parent task", projectId: project.id },
    });
    const parent = (await parentRes.json()) as { id: string };

    const subtaskIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      const res = await page.request.post("/api/tasks", {
        data: { name: `Subtask ${i + 1}`, projectId: project.id, parentId: parent.id },
      });
      const subtask = (await res.json()) as { id: string };
      subtaskIds.push(subtask.id);
    }

    const attachmentIds: string[] = [];
    for (const taskId of [parent.id, ...subtaskIds]) {
      const res = await page.request.post(`/api/tasks/${taskId}/attachments`, {
        multipart: { file: { name: "shot.png", mimeType: "image/png", buffer: TINY_PNG } },
      });
      expect(res.status(), await res.text()).toBe(201);
      const attachment = (await res.json()) as { id: string };
      attachmentIds.push(attachment.id);
    }
    expect(attachmentIds).toHaveLength(4);

    const deleted = await page.request.delete(`/api/tasks/${parent.id}`);
    expect(deleted.ok(), await deleted.text()).toBeTruthy();

    for (const id of attachmentIds) {
      expect((await page.request.get(`/api/attachments/${id}`)).status()).toBe(404);
    }
  });
});
