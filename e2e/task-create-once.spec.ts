import { test, expect } from "@playwright/test";
import { signUp } from "./auth";
import { createProject } from "./project-helpers";

// Impatient Enter presses on the subtask field once created a copy per press; one line must make one task.

test("hammering Enter on the subtask field creates the subtask once", async ({ page }) => {
  await signUp(page);
  const project = await createProject(page, { name: "ERP Migration", color: "#e11d48" });
  const parent = await (
    await page.request.post("/api/tasks", { data: { name: "Cutover plan", projectId: project.id } })
  ).json();

  // A slow server is what makes people press again: hold every create for a second.
  await page.route("**/api/tasks", async (route) => {
    if (route.request().method() === "POST") await new Promise((r) => setTimeout(r, 1000));
    await route.continue();
  });

  await page.goto(`/tasks/${parent.id}`);
  const panel = page.getByRole("dialog", { name: "Cutover plan" });
  const field = panel.getByPlaceholder("Add a subtask");
  await field.fill("Freeze writes");
  for (let i = 0; i < 5; i++) await field.press("Enter");
  await expect(field).toHaveValue("");

  const tasks: { name: string; parentId: string | null }[] = await (await page.request.get("/api/tasks")).json();
  expect(tasks.filter((t) => t.parentId === parent.id && t.name === "Freeze writes")).toHaveLength(1);
});

test("the subtask field has an Add button that creates what is typed", async ({ page }) => {
  await signUp(page);
  const project = await createProject(page, { name: "ERP Migration", color: "#e11d48" });
  const parent = await (
    await page.request.post("/api/tasks", { data: { name: "Cutover plan", projectId: project.id } })
  ).json();

  await page.goto(`/tasks/${parent.id}`);
  const panel = page.getByRole("dialog", { name: "Cutover plan" });
  await panel.getByPlaceholder("Add a subtask").fill("Rollback drill");
  await panel.getByRole("button", { name: "Add", exact: true }).click();
  await expect(panel.getByText("Rollback drill")).toBeVisible();
});
