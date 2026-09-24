import { test, expect } from "@playwright/test";
import { signUp } from "./auth";
import { createProject } from "./project-helpers";

// A task opens as a two-column modal by default; the sidebar is one click away and the choice survives a reload.

test("switching a task between modal and sidebar sticks across reloads", async ({ page }) => {
  await signUp(page);
  const project = await createProject(page, { name: "ERP Migration", color: "#e11d48" });
  const task = await (
    await page.request.post("/api/tasks", { data: { name: "Cutover plan", projectId: project.id } })
  ).json();

  await page.goto(`/tasks/${task.id}`);
  const panel = page.getByRole("dialog", { name: "Cutover plan" });
  await expect(panel.getByRole("region", { name: "Comments" })).toBeVisible();
  await expect(panel.getByRole("tab", { name: "Comments" })).toHaveCount(0);

  // Hovering the view button opens its menu, as in ClickUp.
  await panel.getByRole("button", { name: "Task view" }).hover();
  await page.getByRole("menuitemradio", { name: "Sidebar" }).click();
  const sidebar = page.getByRole("dialog", { name: "Cutover plan" });
  await expect(sidebar.getByRole("tab", { name: "Comments" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("dialog", { name: "Cutover plan" }).getByRole("tab", { name: "Comments" })).toBeVisible();

  await page.getByRole("button", { name: "Task view" }).click();
  await page.getByRole("menuitemradio", { name: "Modal" }).click();
  await expect(page.getByRole("dialog", { name: "Cutover plan" }).getByRole("region", { name: "Comments" })).toBeVisible();
});

test("the description's selection bar applies a heading and a color that persist", async ({ page }) => {
  await signUp(page);
  const project = await createProject(page, { name: "ERP Migration", color: "#e11d48" });
  const task = await (
    await page.request.post("/api/tasks", { data: { name: "Cutover plan", projectId: project.id } })
  ).json();

  await page.goto(`/tasks/${task.id}`);
  const panel = page.getByRole("dialog", { name: "Cutover plan" });
  const editor = panel.getByRole("textbox", { name: "Description" });
  await editor.click();
  await page.keyboard.type("Scope");
  await page.keyboard.press("ControlOrMeta+a");

  const bar = page.getByRole("toolbar", { name: "Text formatting" });
  await expect(bar).toBeVisible();
  await bar.getByRole("button", { name: "Heading 1" }).click();
  await bar.getByRole("button", { name: "Text color" }).click();
  await page.getByRole("radio", { name: /red/i }).click();

  // The description saves on blur.
  await panel.getByRole("region", { name: "Comments" }).click();
  const description = async () => {
    const tasks: { id: string; description: string | null }[] = await (await page.request.get("/api/tasks")).json();
    return tasks.find((t) => t.id === task.id)?.description ?? "";
  };
  await expect.poll(description).toContain('"level":1');
  expect(await description()).toContain('"color":"#ef4444"');
});

test("the task's fields sit two per line in the modal and one per line in the sidebar", async ({ page }) => {
  await signUp(page);
  const project = await createProject(page, { name: "ERP Migration", color: "#e11d48" });
  const task = await (
    await page.request.post("/api/tasks", { data: { name: "Cutover plan", projectId: project.id } })
  ).json();

  await page.goto(`/tasks/${task.id}`);
  const panel = page.getByRole("dialog", { name: "Cutover plan" });
  const top = (label: string) => panel.getByText(label, { exact: true }).first().evaluate((el) => el.getBoundingClientRect().top);
  expect(Math.abs((await top("Project")) - (await top("Status")))).toBeLessThan(4);

  await panel.getByRole("button", { name: "Task view" }).click();
  await page.getByRole("menuitemradio", { name: "Sidebar" }).click();
  const sidebar = page.getByRole("dialog", { name: "Cutover plan" });
  const sideTop = (label: string) => sidebar.getByText(label, { exact: true }).first().evaluate((el) => el.getBoundingClientRect().top);
  expect((await sideTop("Status")) - (await sideTop("Project"))).toBeGreaterThan(20);
});

test("typing / in the description offers block types and applies the one picked", async ({ page }) => {
  await signUp(page);
  const project = await createProject(page, { name: "ERP Migration", color: "#e11d48" });
  const task = await (
    await page.request.post("/api/tasks", { data: { name: "Cutover plan", projectId: project.id } })
  ).json();

  await page.goto(`/tasks/${task.id}`);
  const panel = page.getByRole("dialog", { name: "Cutover plan" });
  await panel.getByRole("textbox", { name: "Description" }).click();
  await page.keyboard.type("/check");
  const menu = page.getByRole("listbox", { name: "Insert block" });
  await expect(menu.getByRole("option", { name: "Checklist" })).toBeVisible();
  await page.keyboard.press("Enter");
  await page.keyboard.type("Ship it");

  await panel.getByRole("region", { name: "Comments" }).click();
  const description = async () => {
    const tasks: { id: string; description: string | null }[] = await (await page.request.get("/api/tasks")).json();
    return tasks.find((t) => t.id === task.id)?.description ?? "";
  };
  await expect.poll(description).toContain('"taskList"');
  expect(await description()).not.toContain("/check");
});
