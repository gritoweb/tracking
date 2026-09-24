import { test, expect, type Page } from "@playwright/test";
import { signUp } from "./auth";
import { createProject } from "./project-helpers";
import { workspaceWithMember, originHeaders } from "./team";
import type { Task, TaskStatus } from "../src/shared/schemas";

// Configurable task statuses and the board built on them (D4).

const DEFAULT_ORDER = ["Backlog", "On hold / Stuck", "To do", "In progress", "QA", "Client review", "Closed"];

async function statuses(page: Page): Promise<TaskStatus[]> {
  return (await page.request.get("/api/task-statuses")).json();
}

async function tasks(page: Page): Promise<Task[]> {
  return (await page.request.get("/api/tasks?includeInactive=true")).json();
}

function byName(list: TaskStatus[], name: string) {
  const found = list.find((s) => s.name === name);
  if (!found) throw new Error(`No status named ${name} in ${list.map((s) => s.name).join(", ")}`);
  return found;
}

test("a new workspace gets the seven default statuses, and a new task lands in the default one", async ({ page }) => {
  await signUp(page);
  const origin = new URL(page.url()).origin;
  const project = await createProject(page, { name: "ERP Migration", color: "#e11d48" });

  const live = await statuses(page);
  expect(live.map((s) => s.name)).toEqual(DEFAULT_ORDER);
  expect(live.map((s) => s.category)).toEqual([
    "not_started", "active", "not_started", "active", "active", "active", "completed",
  ]);
  // Capture lands in "To do", not in the first column — see lib/task-statuses.ts.
  expect(live.filter((s) => s.isDefault).map((s) => s.name)).toEqual(["To do"]);

  await page.request.post("/api/tasks", {
    data: { name: "Cutover plan", projectId: project.id },
    headers: { origin },
  });
  const [task] = await tasks(page);
  expect(task.statusName).toBe("To do");
  expect(task.statusCategory).toBe("not_started");
  expect(task.active).toBe(true);
});

test("moving to a completed status closes the task, and moving back reopens it", async ({ page }) => {
  await signUp(page);
  const origin = new URL(page.url()).origin;
  const project = await createProject(page, { name: "ERP Migration", color: "#e11d48" });
  const created = await (
    await page.request.post("/api/tasks", {
      data: { name: "Cutover plan", projectId: project.id },
      headers: { origin },
    })
  ).json();

  const live = await statuses(page);

  // An active-category column leaves the task open.
  await page.request.patch(`/api/tasks/${created.id}/move`, {
    data: { statusId: byName(live, "In progress").id, boardOrder: 1 },
    headers: { origin },
  });
  let [task] = await tasks(page);
  expect(task.statusName).toBe("In progress");
  expect(task.active).toBe(true);
  expect(task.completedAt).toBeNull();

  // A completed-category column closes it — the mirror, written in one place.
  await page.request.patch(`/api/tasks/${created.id}/move`, {
    data: { statusId: byName(live, "Closed").id, boardOrder: 1 },
    headers: { origin },
  });
  [task] = await tasks(page);
  expect(task.statusName).toBe("Closed");
  expect(task.active).toBe(false);
  expect(task.completedAt).not.toBeNull();

  // Dragging it out reopens it.
  await page.request.patch(`/api/tasks/${created.id}/move`, {
    data: { statusId: byName(live, "To do").id, boardOrder: 1 },
    headers: { origin },
  });
  [task] = await tasks(page);
  expect(task.active).toBe(true);
  expect(task.completedAt).toBeNull();

  // And the row checkbox still works, landing in the same completed column.
  await page.request.put(`/api/tasks/${created.id}`, {
    data: { active: false },
    headers: { origin },
  });
  [task] = await tasks(page);
  expect(task.statusName).toBe("Closed");
  expect(task.active).toBe(false);
});

test("subtasks follow their parent across the done line, column and all", async ({ page }) => {
  await signUp(page);
  const origin = new URL(page.url()).origin;
  const project = await createProject(page, { name: "ERP Migration", color: "#e11d48" });
  const parent = await (
    await page.request.post("/api/tasks", {
      data: { name: "Cutover plan", projectId: project.id },
      headers: { origin },
    })
  ).json();
  await page.request.post("/api/tasks", {
    data: { name: "Map the tables", projectId: project.id, parentId: parent.id },
    headers: { origin },
  });

  const live = await statuses(page);
  await page.request.patch(`/api/tasks/${parent.id}/move`, {
    data: { statusId: byName(live, "Closed").id, boardOrder: 1 },
    headers: { origin },
  });

  const all = await tasks(page);
  const child = all.find((t) => t.parentId === parent.id)!;
  expect(child.statusName).toBe("Closed");
  expect(child.active).toBe(false);
});

test("a member can move cards but cannot configure statuses", async ({ browser }) => {
  const { owner, ownerHeaders, member, memberHeaders } = await workspaceWithMember(browser);
  const project = await createProject(owner, { name: "ERP Migration", color: "#e11d48" });
  const task = await (
    await owner.request.post("/api/tasks", {
      data: { name: "Cutover plan", projectId: project.id },
      headers: ownerHeaders,
    })
  ).json();

  const live = await statuses(member);
  expect(live.map((s) => s.name)).toEqual(DEFAULT_ORDER);

  // Ordinary work: moving a card is not a manager action.
  const moved = await member.request.patch(`/api/tasks/${task.id}/move`, {
    data: { statusId: byName(live, "In progress").id, boardOrder: 1 },
    headers: memberHeaders,
  });
  expect(moved.ok()).toBeTruthy();

  // Configuration is.
  const created = await member.request.post("/api/task-statuses", {
    data: { name: "Blocked", color: "#ef4444", category: "active" },
    headers: memberHeaders,
  });
  expect(created.status()).toBe(403);

  const renamed = await member.request.put(`/api/task-statuses/${byName(live, "Backlog").id}`, {
    data: { name: "Icebox" },
    headers: memberHeaders,
  });
  expect(renamed.status()).toBe(403);

  const archived = await member.request.post(`/api/task-statuses/${byName(live, "Backlog").id}/archive`, {
    data: {},
    headers: memberHeaders,
  });
  expect(archived.status()).toBe(403);

  await owner.context().close();
  await member.context().close();
});

test("archiving a status that still holds tasks has to say where they go", async ({ page }) => {
  await signUp(page);
  const origin = new URL(page.url()).origin;
  const project = await createProject(page, { name: "ERP Migration", color: "#e11d48" });
  const live = await statuses(page);
  const feedback = byName(live, "QA");

  const task = await (
    await page.request.post("/api/tasks", {
      data: { name: "Cutover plan", projectId: project.id, statusId: feedback.id },
      headers: { origin },
    })
  ).json();
  expect((await tasks(page))[0].statusName).toBe("QA");

  const refused = await page.request.post(`/api/task-statuses/${feedback.id}/archive`, {
    data: {},
    headers: { origin },
  });
  expect(refused.status()).toBe(400);
  expect((await refused.json()).taskCount).toBe(1);

  const ok = await page.request.post(`/api/task-statuses/${feedback.id}/archive`, {
    data: { moveTo: byName(live, "To do").id },
    headers: { origin },
  });
  expect(ok.ok()).toBeTruthy();
  expect((await ok.json()).moved).toBe(1);

  expect((await statuses(page)).map((s) => s.name)).toEqual([
    "Backlog", "On hold / Stuck", "To do", "In progress", "Client review", "Closed",
  ]);
  const after = (await tasks(page)).find((t) => t.id === task.id)!;
  expect(after.statusName).toBe("To do");
  expect(after.active).toBe(true);
});

test("the board keeps one open and one completed column, and one default", async ({ page }) => {
  await signUp(page);
  const origin = new URL(page.url()).origin;
  const live = await statuses(page);
  const done = byName(live, "Closed");

  // Done is the only completed column, so it can be neither archived nor reopened.
  const archived = await page.request.post(`/api/task-statuses/${done.id}/archive`, {
    data: {},
    headers: { origin },
  });
  expect(archived.status()).toBe(400);

  const recategorised = await page.request.put(`/api/task-statuses/${done.id}`, {
    data: { category: "active" },
    headers: { origin },
  });
  expect(recategorised.status()).toBe(400);

  // A completed column can't be where new tasks are born either.
  const defaulted = await page.request.put(`/api/task-statuses/${done.id}`, {
    data: { isDefault: true },
    headers: { origin },
  });
  expect(defaulted.status()).toBe(400);

  // Exactly one default: claiming it takes it from whoever held it.
  await page.request.put(`/api/task-statuses/${byName(live, "Backlog").id}`, {
    data: { isDefault: true },
    headers: { origin },
  });
  expect((await statuses(page)).filter((s) => s.isDefault).map((s) => s.name)).toEqual(["Backlog"]);

  // Archiving the default passes the flag on rather than dropping it.
  await page.request.post(`/api/task-statuses/${byName(live, "Backlog").id}/archive`, {
    data: {},
    headers: { origin },
  });
  const after = await statuses(page);
  expect(after.filter((s) => s.isDefault)).toHaveLength(1);
  // Heir is the first remaining OPEN column by sort_order, not the workspace's original default.
  expect(byName(after, "On hold / Stuck").isDefault).toBe(true);
});

test("recategorising a column carries the tasks already in it across the done line", async ({ page }) => {
  await signUp(page);
  const origin = new URL(page.url()).origin;
  const project = await createProject(page, { name: "ERP Migration", color: "#e11d48" });
  const live = await statuses(page);
  const feedback = byName(live, "QA");

  await page.request.post("/api/tasks", {
    data: { name: "Cutover plan", projectId: project.id, statusId: feedback.id },
    headers: { origin },
  });

  // "QA" turns out to mean "shipped, awaiting sign-off" in this workspace.
  const res = await page.request.put(`/api/task-statuses/${feedback.id}`, {
    data: { category: "completed" },
    headers: { origin },
  });
  expect(res.ok()).toBeTruthy();

  let [task] = await tasks(page);
  expect(task.active).toBe(false);
  expect(task.completedAt).not.toBeNull();

  // And back again.
  await page.request.put(`/api/task-statuses/${feedback.id}`, {
    data: { category: "active" },
    headers: { origin },
  });
  [task] = await tasks(page);
  expect(task.active).toBe(true);
  expect(task.completedAt).toBeNull();
});

test("two live statuses may not share a name", async ({ page }) => {
  await signUp(page);
  const { origin } = await originHeaders(page);
  // Case-insensitive clash against a live default name, derived from DEFAULT_ORDER.
  const clash = await page.request.post("/api/task-statuses", {
    data: { name: DEFAULT_ORDER[0].toLowerCase(), color: "#ef4444", category: "active" },
    headers: { origin },
  });
  expect(clash.status()).toBe(409);

  const ok = await page.request.post("/api/task-statuses", {
    data: { name: "Blocked", color: "#ef4444", category: "active" },
    headers: { origin },
  });
  expect(ok.status()).toBe(201);
  expect((await statuses(page)).map((s) => s.name)).toEqual([...DEFAULT_ORDER, "Blocked"]);
});

// ─── The board itself ────────────────────────────────────────────────────────

/** Drags with the keyboard, which is both the a11y path and the one Playwright can drive reliably against dnd-kit. */
async function dragWithKeyboard(page: Page, taskName: string, key: "ArrowRight" | "ArrowLeft", times = 1) {
  const handle = page.getByRole("group", { name: `Move ${taskName}` });
  await handle.focus();
  await page.keyboard.press("Space");
  // dnd-kit measures droppables a tick after the drag starts.
  await page.waitForTimeout(250);
  for (let i = 0; i < times; i++) {
    await page.keyboard.press(key);
    await page.waitForTimeout(250);
  }
  await page.keyboard.press("Space");
}

test("the Board tab shows a column per status and a card can be moved with the keyboard", async ({ page }) => {
  await signUp(page);
  const origin = new URL(page.url()).origin;
  const project = await createProject(page, { name: "ERP Migration", color: "#e11d48" });
  await page.request.post("/api/tasks", {
    data: { name: "Cutover plan", projectId: project.id },
    headers: { origin },
  });

  await page.goto("/tasks");
  await page.getByRole("radio", { name: "Board" }).click();

  for (const name of DEFAULT_ORDER) {
    await expect(page.getByRole("region", { name })).toBeVisible();
  }
  // It starts in the default column, not the first one.
  await expect(page.getByRole("region", { name: "To do" }).getByText("Cutover plan")).toBeVisible();

  await dragWithKeyboard(page, "Cutover plan", "ArrowRight");
  await expect(page.getByRole("region", { name: "In progress" }).getByText("Cutover plan")).toBeVisible();

  await expect
    .poll(async () => (await tasks(page))[0].statusName, { timeout: 8000 })
    .toBe("In progress");
  expect((await tasks(page))[0].active).toBe(true);
});

test("the board column's open Add-a-task card has working due-date and assignee fields", async ({
  page,
}) => {
  await signUp(page);
  await createProject(page, { name: "ERP Migration", color: "#e11d48" });

  await page.goto("/tasks");
  await page.getByRole("radio", { name: "Board" }).click();
  await page.getByRole("region", { name: "To do" }).getByRole("button", { name: "Add a task" }).click();

  const nameField = page.getByPlaceholder("Task name");
  await nameField.fill("Draft the SOW");
  // Scoped to the open card itself — the compact quick-add rows elsewhere in the app share these labels.
  const card = nameField.locator("xpath=ancestor::div[contains(@class,'rounded-container')][1]");

  // Each field opens its own picker on click — this used to do nothing at all.
  await card.getByRole("button", { name: "Due date" }).click();
  await expect(page.getByRole("button", { name: /^Today,/ })).toBeVisible();
  await page.getByRole("button", { name: /^Today,/ }).click();
  await expect(card.getByRole("button", { name: "Today" })).toBeVisible();

  await card.getByRole("button", { name: "Assignee" }).click();
  await expect(page.getByPlaceholder("Search assignees...")).toBeVisible();
  await page.getByPlaceholder("Search assignees...").fill("Test User");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await expect(card.getByText("Test User")).toBeVisible();

  await card.getByRole("button", { name: "Add" }).click();
  await page.waitForTimeout(800);

  const created = await tasks(page);
  const added = created.find((t: { name: string }) => t.name === "Draft the SOW");
  expect(added).toBeTruthy();
  expect(added.dueDate).toBeTruthy();
  expect(added.assignees).toHaveLength(1);
});

test("a member sees the board but none of its configuration", async ({ browser }) => {
  const { owner, ownerHeaders, member } = await workspaceWithMember(browser);
  const project = await createProject(owner, { name: "ERP Migration", color: "#e11d48" });
  await owner.request.post("/api/tasks", {
    data: { name: "Cutover plan", projectId: project.id },
    headers: ownerHeaders,
  });

  await member.goto("/tasks");
  await member.getByRole("radio", { name: "Board" }).click();
  await expect(member.getByRole("region", { name: "To do" })).toBeVisible();
  await expect(member.getByRole("region", { name: "To do" }).getByText("Cutover plan")).toBeVisible();

  // The screen hides only what the server already refuses.
  await expect(member.getByRole("button", { name: "Configure To do" })).toHaveCount(0);
  await expect(member.getByRole("button", { name: "Add status" })).toHaveCount(0);

  await owner.goto("/tasks");
  await owner.getByRole("radio", { name: "Board" }).click();
  await expect(owner.getByRole("button", { name: "Configure To do" })).toBeVisible();
  await expect(owner.getByRole("button", { name: "Add status" })).toBeVisible();

  await owner.context().close();
  await member.context().close();
});

test("a move by one person reaches the other's board without a reload", async ({ browser }) => {
  const { owner, ownerHeaders, member } = await workspaceWithMember(browser);
  const project = await createProject(owner, { name: "ERP Migration", color: "#e11d48" });
  await owner.request.post("/api/tasks", {
    data: { name: "Cutover plan", projectId: project.id },
    headers: ownerHeaders,
  });

  await member.goto("/tasks");
  await member.getByRole("radio", { name: "Board" }).click();
  await expect(member.getByRole("region", { name: "To do" }).getByText("Cutover plan")).toBeVisible();

  await owner.goto("/tasks");
  await owner.getByRole("radio", { name: "Board" }).click();
  await expect(owner.getByRole("region", { name: "To do" }).getByText("Cutover plan")).toBeVisible();
  await dragWithKeyboard(owner, "Cutover plan", "ArrowRight");

  // `tasks:changed` carries no payload, so the other board refetches rather than reading it.
  await expect(
    member.getByRole("region", { name: "In progress" }).getByText("Cutover plan")
  ).toBeVisible({ timeout: 10_000 });

  await owner.context().close();
  await member.context().close();
});

test("the list's Group: Status follows the real columns, in board order", async ({ page }) => {
  await signUp(page);
  const origin = new URL(page.url()).origin;
  const project = await createProject(page, { name: "ERP Migration", color: "#e11d48" });
  const live = await statuses(page);

  for (const [name, status] of [
    ["Write the runbook", "Backlog"],
    ["Cutover plan", "In progress"],
    ["Sign-off", "Closed"],
  ] as const) {
    await page.request.post("/api/tasks", {
      data: { name, projectId: project.id, statusId: byName(live, status).id },
      headers: { origin },
    });
  }

  await page.goto("/tasks");
  await page.getByRole("radio", { name: "List" }).click();
  await page.getByLabel("Group by").click();
  await page.getByRole("option", { name: "Group: Status" }).click();

  // Column order, not alphabetical.
  const headings = page.locator("main h2:visible");
  await expect(headings).toHaveText(["Backlog", "In progress", "Closed"]);
});
