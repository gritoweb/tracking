import { test, expect } from "@playwright/test";
import { signUp } from "./auth";
import { createProject } from "./project-helpers";
import { workspaceWithMember } from "./team";

/**
 * D5 (detail panel + /tasks/:id), D6 (assignees) and D7 (image attachments)
 * — the three cards after D4's kanban board.
 */

// A well-known 1x1 transparent PNG, small enough to inline as a fixture.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

const REJECTED_MESSAGE = "Only PNG, JPEG, WebP and GIF images are accepted";

test("visiting /tasks/:id opens that task's detail panel directly (D5)", async ({ page }) => {
  await signUp(page);
  const project = await createProject(page, { name: "ERP Migration", color: "#e11d48" });
  const created = await page.request.post("/api/tasks", {
    data: { name: "Cutover plan", projectId: project.id },
  });
  const task = await created.json();

  await page.goto(`/tasks/${task.id}`);
  await expect(page.getByRole("dialog", { name: "Cutover plan" })).toBeVisible();

  // Closing a task opened via the deep link goes back to the plain /tasks URL.
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/tasks$/);
});

test("the panel header has actions on the left and close on the right, matching EntryFormSheet (F13)", async ({ page }) => {
  await signUp(page);
  const project = await createProject(page, { name: "ERP Migration", color: "#e11d48" });
  await page.request.post("/api/tasks", {
    data: { name: "Cutover plan", projectId: project.id },
  });

  await page.goto("/tasks");
  await page.getByText("Cutover plan").click();
  const panel = page.getByRole("dialog", { name: "Cutover plan" });
  await expect(panel).toBeVisible();

  const actionsBox = await panel.getByRole("button", { name: "Task actions" }).boundingBox();
  const closeBox = await panel.getByRole("button", { name: "Close" }).boundingBox();
  expect(actionsBox).not.toBeNull();
  expect(closeBox).not.toBeNull();
  expect(closeBox!.x).toBeGreaterThan(actionsBox!.x);
});

test("an assigned task shows the avatar on the card, in the panel, and under Assigned to me (D6)", async ({
  browser,
}) => {
  const { owner, member, email } = await workspaceWithMember(browser);
  const project = await createProject(owner, { name: "ERP Migration", color: "#e11d48" });

  // Assignment itself (server + schema) is exercised directly — the picker UI is covered manually below.
  const created = await owner.request.post("/api/tasks", {
    data: { name: "Cutover plan", projectId: project.id },
  });
  const task = await created.json();
  const membersRes = await owner.request.get(
    `/api/auth/organization/get-full-organization?organizationId=${task.workspaceId}`
  );
  const org = await membersRes.json();
  const memberRow = org.members.find((m: { user: { email: string } }) => m.user.email === email);
  expect(memberRow).toBeTruthy();

  const updated = await owner.request.put(`/api/tasks/${task.id}`, {
    data: { assigneeIds: [memberRow.userId] },
  });
  expect(updated.ok()).toBeTruthy();
  const updatedTask = await updated.json();
  expect(updatedTask.assignees).toEqual([
    { userId: memberRow.userId, name: "Outsider", image: null },
  ]);

  // The avatar renders on the card — no image on this account, so initials ("Outsider" → "OU").
  await owner.goto("/tasks");
  await owner.getByRole("radio", { name: "Board" }).click();
  await expect(owner.getByRole("region", { name: "To do" }).getByText("OU", { exact: true })).toBeVisible();

  // And in the detail panel's Assignees field.
  await owner.getByText("Cutover plan").click();
  const panel = owner.getByRole("dialog", { name: "Cutover plan" });
  await expect(panel.getByText("Outsider")).toBeVisible();
  await owner.keyboard.press("Escape");

  // The member filters their own board down to just what's assigned to them.
  await member.goto("/tasks");
  await member.getByRole("radio", { name: "Board" }).click();
  await member.getByRole("button", { name: "Assigned to me" }).click();
  await expect(
    member.getByRole("region", { name: "To do" }).getByText("Cutover plan")
  ).toBeVisible();

  await owner.context().close();
  await member.context().close();
});

test("picking an assignee updates the panel and the board card without closing anything (D6)", async ({
  page,
}) => {
  await signUp(page);
  const project = await createProject(page, { name: "ERP Migration", color: "#e11d48" });
  await page.request.post("/api/tasks", {
    data: { name: "Cutover plan", projectId: project.id },
  });

  await page.goto("/tasks");
  await page.getByRole("radio", { name: "Board" }).click();
  await page.getByText("Cutover plan").click();
  const panel = page.getByRole("dialog", { name: "Cutover plan" });
  await expect(panel).toBeVisible();

  // `.first()`: the subtasks quick-add below has its own same-named assignee button.
  await panel.getByRole("button", { name: "Add assignee" }).first().click();
  await page.getByRole("option", { name: "Test User" }).click();

  await expect(panel).toBeVisible();
  await expect(panel.getByRole("button", { name: "Edit assignees" })).toContainText("Test User");

  // And on the card behind it, without a reload.
  await panel.getByRole("button", { name: "Close" }).click();
  await expect(panel).not.toBeVisible();
  await expect(
    page.getByRole("region", { name: "To do" }).getByText("TU", { exact: true })
  ).toBeVisible();
});

test("attaching, viewing and deleting an image on a task (D7)", async ({ page }) => {
  await signUp(page);
  const project = await createProject(page, { name: "ERP Migration", color: "#e11d48" });
  const created = await page.request.post("/api/tasks", {
    data: { name: "Cutover plan", projectId: project.id },
  });
  const task = await created.json();

  // The panel's gallery is read-only; the upload door is the description editor's own API call.
  const uploaded = await page.request.post(`/api/tasks/${task.id}/attachments`, {
    multipart: { file: { name: "screenshot.png", mimeType: "image/png", buffer: TINY_PNG } },
  });
  expect(uploaded.status(), await uploaded.text()).toBe(201);

  await page.goto(`/tasks/${task.id}`);
  const panel = page.getByRole("dialog", { name: "Cutover plan" });
  await expect(panel).toBeVisible();

  const thumbnail = panel.getByRole("button", { name: /Open screenshot.png/ });
  await expect(thumbnail).toBeVisible();

  // The download route serves it back, workspace-scoped.
  const src = await thumbnail.locator("img").getAttribute("src");
  const res = await page.request.get(src!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("image/");

  await thumbnail.hover();
  await panel.getByRole("button", { name: /Delete screenshot.png/ }).click();
  await expect(thumbnail).toHaveCount(0);
});

test("a non-image file is rejected before it reaches R2 (D7)", async ({ page }) => {
  await signUp(page);
  const project = await createProject(page, { name: "ERP Migration", color: "#e11d48" });
  const created = await page.request.post("/api/tasks", {
    data: { name: "Cutover plan", projectId: project.id },
  });
  const task = await created.json();

  const res = await page.request.post(`/api/tasks/${task.id}/attachments`, {
    multipart: { file: { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("not an image") } },
  });
  expect(res.status()).toBe(400);
  expect((await res.json()).error).toBe(REJECTED_MESSAGE);
});

test("pasting an image into the description uploads it and shows it in the gallery (D7)", async ({ page }) => {
  await signUp(page);
  const project = await createProject(page, { name: "ERP Migration", color: "#e11d48" });
  const created = await page.request.post("/api/tasks", {
    data: { name: "Cutover plan", projectId: project.id },
  });
  const task = await created.json();

  await page.goto(`/tasks/${task.id}`);
  const panel = page.getByRole("dialog", { name: "Cutover plan" });
  await panel.getByRole("textbox", { name: "Description" }).click();

  // Synthetic ClipboardEvent + DataTransfer: the same shape RichTextEditor's handlePaste reads off a real OS paste.
  await page.evaluate((base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const file = new File([bytes], "pasted.png", { type: "image/png" });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: dataTransfer });
    document.activeElement?.dispatchEvent(event);
  }, TINY_PNG.toString("base64"));

  const thumbnail = panel.getByRole("button", { name: /Open pasted.png/ });
  await expect(thumbnail).toBeVisible({ timeout: 10_000 });
});
