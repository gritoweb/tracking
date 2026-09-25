import { test, expect, type Page } from "@playwright/test";
import { signUp } from "./auth";
import { createProject } from "./project-helpers";

async function parentWithSubtask(page: Page) {
  await signUp(page);
  const project = await createProject(page, { name: "Site Relaunch", color: "#e11d48" });
  const parent = await (await page.request.post("/api/tasks", { data: { name: "Landing page", projectId: project.id } })).json();
  const sub = await (
    await page.request.post("/api/tasks", { data: { name: "Hero copy", projectId: project.id, parentId: parent.id } })
  ).json();
  const exists = async (id: string) => (await page.request.get("/api/tasks")).json().then((all: { id: string }[]) => all.some((t) => t.id === id));
  return { parent, sub, exists };
}

test("a subtask is deleted from its row's ⋯ menu without opening it, and the parent stays", async ({ page }) => {
  const { parent, sub, exists } = await parentWithSubtask(page);
  await page.goto(`/tasks/${parent.id}`);
  const panel = page.getByRole("dialog", { name: "Landing page" });

  await panel.getByText("Hero copy").hover();
  await panel.getByRole("button", { name: "More actions for Hero copy" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(page.getByRole("alertdialog", { name: "Delete subtask?" })).toBeVisible();
  await page.getByRole("button", { name: "Delete" }).click();

  await expect(panel.getByText("Hero copy")).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/tasks/${parent.id}`));
  expect(await exists(sub.id)).toBe(false);
  expect(await exists(parent.id)).toBe(true);
});

test("deleting from an open subtask's ⋯ menu deletes the subtask, not its parent, and returns to the parent", async ({ page }) => {
  const { parent, sub, exists } = await parentWithSubtask(page);
  await page.goto(`/tasks/${sub.id}`);
  const panel = page.getByRole("dialog", { name: "Hero copy" });

  await panel.getByRole("button", { name: "Task actions" }).click();
  await page.getByRole("menuitem", { name: "Delete subtask" }).click();
  await page.getByRole("button", { name: "Delete" }).click();

  await expect(page).toHaveURL(new RegExp(`/tasks/${parent.id}`));
  await expect(page.getByRole("dialog", { name: "Landing page" })).toBeVisible();
  expect(await exists(sub.id)).toBe(false);
  expect(await exists(parent.id)).toBe(true);
});
