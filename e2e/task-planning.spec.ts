import { test, expect } from "@playwright/test";
import { signUp } from "./auth";
import { createProject } from "./project-helpers";

/**
 * Tasks as the plan side of the timer: due dates, priority, subtasks and
 * recurrence, and the paths that turn a task into tracked time.
 */

function localDate(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function seed(page: import("@playwright/test").Page) {
  await signUp(page);
  const origin = new URL(page.url()).origin;
  const project = await createProject(page, { name: "ERP Migration", color: "#e11d48" });
  return { project, origin };
}

test("a task starts a timer in one click, and stopping offers to close it out", async ({ page }) => {
  const { project, origin } = await seed(page);
  await page.request.post("/api/tasks", {
    data: { name: "Cutover plan", projectId: project.id, dueDate: localDate(0) },
    headers: { origin },
  });

  await page.goto("/tasks");
  await page.waitForTimeout(1000);

  await page.getByRole("button", { name: "Start timer for Cutover plan" }).click();
  await expect(page.getByRole("button", { name: "Stop timer for Cutover plan" })).toBeVisible();

  await page.getByRole("button", { name: "Stop timer for Cutover plan" }).click();
  // Due today counts as evidence the task may be finished, so the loop closes here.
  // Longer than the suite default: this prompt trails the stop round-trip, which parallel workers can queue behind.
  await expect(page.getByRole("button", { name: "Mark done" })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Mark done" }).click();
  await page.waitForTimeout(1200);

  const tasks = await (await page.request.get("/api/tasks?includeInactive=true")).json();
  expect(tasks[0].active).toBe(false);
  expect(tasks[0].completedAt).not.toBeNull();
});

test("quick-add parses a due date and a priority out of the line", async ({ page }) => {
  const { project, origin } = await seed(page);
  // The inline field appears once the surface has anything in it; the very first
  // task is captured through the empty state's own button. A single project
  // means the picker isn't in the way of capture either.
  await page.request.post("/api/tasks", {
    data: { name: "Cutover plan", projectId: project.id, dueDate: localDate(0) },
    headers: { origin },
  });

  await page.goto("/tasks");
  await page.getByRole("radio", { name: "List" }).click();
  await page.waitForTimeout(800);

  const field = page.getByRole("textbox", { name: "Add a task" }).first();
  await field.fill("chase signed SOW tomorrow p1");
  await expect(page.getByText(/due tomorrow/i)).toBeVisible();
  await field.press("Enter");
  await page.waitForTimeout(1200);

  const tasks = await (await page.request.get("/api/tasks")).json();
  const added = tasks.find((t: { name: string }) => t.name === "chase signed SOW");
  expect(added).toBeTruthy();
  expect(added.dueDate).toBe(localDate(1));
  expect(added.priority).toBe(1);
});

test("quick-add's due date and assignee pickers set the task without opening the panel", async ({ page }) => {
  const { project, origin } = await seed(page);
  await page.request.post("/api/tasks", {
    data: { name: "Cutover plan", projectId: project.id },
    headers: { origin },
  });

  await page.goto("/tasks");
  await page.getByRole("radio", { name: "List" }).click();
  await page.waitForTimeout(800);

  const field = page.getByRole("textbox", { name: "Add a task" }).first();
  await field.fill("send kickoff email");
  // Scoped to the quick-add row itself — "Set due date" also matches the existing task row's own chip.
  const row = field.locator("xpath=ancestor::div[contains(@class,'items-center')][1]");

  await row.getByRole("button", { name: "Set due date" }).click();
  await page.getByRole("button", { name: /^Today,/ }).click();
  await expect(row.getByRole("button", { name: "Due Today — change" })).toBeVisible();

  await row.getByRole("button", { name: "Add assignee" }).click();
  await page.getByPlaceholder("Search assignees...").fill("Test User");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");

  await field.press("Enter");
  await page.waitForTimeout(1200);

  const tasks = await (await page.request.get("/api/tasks")).json();
  const added = tasks.find((t: { name: string }) => t.name === "send kickoff email");
  expect(added).toBeTruthy();
  expect(added.dueDate).toBe(localDate(0));
  expect(added.assignees).toHaveLength(1);
  expect(added.assignees[0].name).toBe("Test User");
});

test("completing a repeating task creates the next occurrence", async ({ page }) => {
  const { project, origin } = await seed(page);
  await page.request.post("/api/tasks", {
    data: {
      name: "Weekly status report",
      projectId: project.id,
      dueDate: localDate(0),
      recurRule: "daily",
    },
    headers: { origin },
  });

  await page.goto("/tasks");
  await page.getByRole("radio", { name: "List" }).click();
  await page.waitForTimeout(1000);
  await page.getByRole("button", { name: "Mark task done" }).first().click();
  await page.waitForTimeout(1500);

  const tasks = await (await page.request.get("/api/tasks?includeInactive=true")).json();
  const open = tasks.filter((t: { active: boolean }) => t.active);
  const done = tasks.filter((t: { active: boolean }) => !t.active);
  expect(done).toHaveLength(1);
  // The next occurrence exists, is dated tomorrow, and carries the rule forward.
  expect(open).toHaveLength(1);
  expect(open[0].dueDate).toBe(localDate(1));
  expect(open[0].recurRule).toBe("daily");
  // …and the completed one no longer repeats, so reopening it can't spawn a second.
  expect(done[0].recurRule).toBeNull();
});

test("a subtask's tracked time rolls up into its parent", async ({ page }) => {
  const { project, origin } = await seed(page);
  const parent = await (
    await page.request.post("/api/tasks", {
      data: { name: "Phase 2 discovery", projectId: project.id, estimatedSeconds: 7200 },
      headers: { origin },
    })
  ).json();
  const child = await (
    await page.request.post("/api/tasks", {
      data: { name: "Data mapping", projectId: project.id, parentId: parent.id },
      headers: { origin },
    })
  ).json();

  // An hour logged against the child only.
  const start = new Date();
  start.setHours(9, 0, 0, 0);
  const stop = new Date(start.getTime() + 3600 * 1000);
  await page.request.post("/api/time_entries", {
    data: {
      description: "Data mapping",
      projectId: project.id,
      taskId: child.id,
      start: start.toISOString(),
      stop: stop.toISOString(),
      tags: [],
    },
    headers: { origin },
  });

  const tasks = await (await page.request.get("/api/tasks")).json();
  const p = tasks.find((t: { id: string }) => t.id === parent.id);
  expect(p.trackedSeconds).toBe(3600);
  expect(p.subtaskTotal).toBe(1);
  expect(p.subtaskDone).toBe(0);

  // Ticking the parent ticks the child with it.
  await page.request.put(`/api/tasks/${parent.id}`, {
    data: { active: false, completedOn: localDate(0) },
    headers: { origin },
  });
  const after = await (await page.request.get("/api/tasks?includeInactive=true")).json();
  expect(after.every((t: { active: boolean }) => !t.active)).toBe(true);
});

test("the Due filter narrows the List, overdue included under Today", async ({ page }) => {
  const { project, origin } = await seed(page);
  const mk = (data: unknown) =>
    page.request.post("/api/tasks", { data, headers: { origin } });

  await mk({ name: "Weekly status report", projectId: project.id, dueDate: localDate(-2) });
  await mk({ name: "Phase 2 discovery", projectId: project.id, dueDate: localDate(0) });
  await mk({ name: "Prep board deck", projectId: project.id, dueDate: localDate(1) });
  await mk({ name: "Backlog grooming", projectId: project.id });

  await page.goto("/tasks");
  await page.getByRole("radio", { name: "List" }).click();
  await page.waitForTimeout(800);

  // Unfiltered: all four.
  await expect(page.getByText("Weekly status report")).toBeVisible();
  await expect(page.getByText("Backlog grooming")).toBeVisible();

  // Today: the overdue one and the one due today, not the undated or the upcoming one.
  await page.getByLabel("Filter by due date").click();
  await page.getByRole("option", { name: "Today" }).click();
  await page.waitForTimeout(500);
  await expect(page.getByText("Weekly status report")).toBeVisible();
  await expect(page.getByText("Phase 2 discovery")).toBeVisible();
  await expect(page.getByText("Prep board deck")).toHaveCount(0);
  await expect(page.getByText("Backlog grooming")).toHaveCount(0);

  // Upcoming: only the one due tomorrow.
  await page.getByLabel("Filter by due date").click();
  await page.getByRole("option", { name: "Upcoming" }).click();
  await page.waitForTimeout(500);
  await expect(page.getByText("Prep board deck")).toBeVisible();
  await expect(page.getByText("Phase 2 discovery")).toHaveCount(0);
});

test("a task carries notes, editable through the detail panel (D5)", async ({ page }) => {
  const { project, origin } = await seed(page);
  await page.request.post("/api/tasks", {
    data: { name: "Reconcile Q3 invoices", projectId: project.id, dueDate: localDate(0) },
    headers: { origin },
  });

  await page.goto("/tasks");
  await page.getByRole("radio", { name: "List" }).click();
  await page.waitForTimeout(1000);

  const row = page.locator(".group", { hasText: "Reconcile Q3 invoices" }).first();
  await row.hover();
  await row.getByRole("button", { name: /More actions/ }).click();
  await page.getByRole("menuitem", { name: "Edit task…" }).click();

  // The card opens a side panel now (D5), not a centered "Edit task" dialog — same
  // role, but titled by the task's own name, so the same panel does view and edit.
  const panel = page.getByRole("dialog", { name: "Reconcile Q3 invoices" });
  await expect(panel).toBeVisible();
  await expect(panel.getByLabel("Task name")).toHaveValue("Reconcile Q3 invoices");
  // "Clear due date" lives inside the due-date popover, portaled outside the dialog — open it first.
  await panel.getByRole("button", { name: /^Due .* — change$/ }).click();
  await expect(page.getByRole("button", { name: "Clear due date" })).toBeVisible();
  await page.keyboard.press("Escape");

  // Every field autosaves on blur — there is no batched "Save changes" anymore.
  await panel.getByLabel("Description").fill("Check the August credit note before sending.");
  await panel.getByLabel("Description").blur();
  await page.waitForTimeout(500);
  await page.keyboard.press("Escape");
  await expect(panel).not.toBeVisible();

  // Notes render as a second line on the row.
  await expect(page.getByText("Check the August credit note before sending.")).toBeVisible();

  // Stored as the rich-text editor's own doc (D8), not the raw string — the row's plain-text
  // preview above proves the round trip, this proves the stored shape carries the same text.
  const tasks = await (await page.request.get("/api/tasks")).json();
  const doc = JSON.parse(tasks[0].description);
  expect(doc.type).toBe("doc");
  expect(JSON.stringify(doc)).toContain("Check the August credit note before sending.");
});

test("a legacy plain-text description still loads and edits in the rich-text panel (D8)", async ({
  page,
}) => {
  const { project, origin } = await seed(page);
  const created = await page.request.post("/api/tasks", {
    data: { name: "Reconcile Q3 invoices", projectId: project.id },
    headers: { origin },
  });
  const task = await created.json();
  // A description written before the rich-text editor existed — a bare string, not JSON.
  await page.request.put(`/api/tasks/${task.id}`, {
    data: { description: "Legacy plain-text note" },
    headers: { origin },
  });

  await page.goto(`/tasks/${task.id}`);
  const panel = page.getByRole("dialog", { name: "Reconcile Q3 invoices" });
  await expect(panel).toBeVisible();
  await expect(panel.getByText("Legacy plain-text note")).toBeVisible();

  // Bold it — the description is now genuinely rich, and still round-trips through the API.
  const editor = panel.getByRole("textbox", { name: "Description" });
  await editor.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+B");
  await editor.blur();
  await page.waitForTimeout(500);

  const after = await (await page.request.get(`/api/tasks?includeInactive=true`)).json();
  const updated = after.find((t: { id: string }) => t.id === task.id);
  const doc = JSON.parse(updated.description);
  expect(JSON.stringify(doc)).toContain('"bold"');
  expect(JSON.stringify(doc)).toContain("Legacy plain-text note");
});

test("checking off a checklist item in the description marks it done (D8)", async ({ page }) => {
  const { project, origin } = await seed(page);
  const created = await page.request.post("/api/tasks", {
    data: { name: "Launch checklist", projectId: project.id },
    headers: { origin },
  });
  const task = await created.json();

  await page.goto(`/tasks/${task.id}`);
  const panel = page.getByRole("dialog", { name: "Launch checklist" });
  const editor = panel.getByRole("textbox", { name: "Description" });
  await editor.click();
  // No toolbar — a checklist item is typed as its own markdown-style input rule.
  await page.keyboard.type("[] Ship to staging");
  await editor.blur();
  await page.waitForTimeout(500);

  await panel.getByRole("checkbox").click();
  await editor.blur();
  await page.waitForTimeout(500);

  const tasks = await (await page.request.get("/api/tasks")).json();
  const doc = JSON.parse(tasks[0].description);
  expect(JSON.stringify(doc)).toContain('"checked":true');
});
