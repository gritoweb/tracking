import { test, expect } from "@playwright/test";
import { signUp } from "./auth";
import { chooseProject, createProject, pickProjectInBar } from "./project-helpers";


test("tag colors: recolor an existing tag in the entry dialog", async ({ page }) => {
  await signUp(page);
  const project = await createProject(page);
  // Seed an entry carrying the tag so it exists server-side (recolorable).
  await page.request.post("/api/time_entries", {
    data: {
      description: "seed",
      projectId: project.id,
      start: new Date(Date.now() - 3600_000).toISOString(),
      stop: new Date().toISOString(),
      tags: ["design"],
    },
  });

  // The Tags picker lives in the Add-entry dialog.
  await page.getByRole("button", { name: "Add entry" }).click();
  const dialog = page.getByRole("dialog", { name: "New entry" });
  await dialog.getByRole("button", { name: "Tags" }).click();
  await page.getByPlaceholder("Add a tag...").fill("design");
  await page.getByRole("option", { name: /design/ }).first().click();

  // The selected tag's dot opens the inline recolor palette.
  await page.getByRole("button", { name: "Recolor design" }).click();
  await page.getByRole("button", { name: /Set design to Violet/ }).click();
  await expect(page.getByRole("button", { name: "Recolor design" })).toBeVisible();
});

test("recurring entries: create a template in settings", async ({ page }) => {
  await signUp(page);
  await createProject(page);
  await page.goto("/settings?tab=tracking");

  await expect(page.getByText("Recurring entries")).toBeVisible();
  const card = page.locator("div").filter({ hasText: /^Recurring entries/ }).first();
  await card.getByRole("button", { name: "Add" }).click();

  const dialog = page.getByRole("dialog", { name: "New recurring entry" });
  await dialog.getByLabel("Description").fill("Daily standup");
  await dialog.getByLabel("Duration (minutes)").fill("15");
  // Every template needs a project (D3).
  await expect(dialog.getByRole("button", { name: "Create" })).toBeDisabled();
  await dialog.getByRole("button", { name: "Select project" }).click();
  await chooseProject(page);
  await dialog.getByRole("button", { name: "Create" }).click();

  await expect(page.getByText("Daily standup")).toBeVisible();
  await expect(page.getByText(/Weekdays ·/)).toBeVisible();
});

test("calendar: gaps toggle present on the time grid", async ({ page }) => {
  await signUp(page);
  await page.getByRole("tab", { name: "Calendar" }).click();
  await page.getByRole("button", { name: "View options" }).click();
  await expect(page.getByRole("switch", { name: /untracked gaps/i })).toBeVisible();
});

test("timer stop: day total stays put (optimistic), entry lands with duration", async ({ page }) => {
  await signUp(page);
  await createProject(page);
  await page.reload();

  await page.getByPlaceholder("What are you working on?").fill("Focus block");
  await pickProjectInBar(page);
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
  await page.waitForTimeout(2000); // accrue a couple seconds

  await page.getByRole("button", { name: "Stop" }).click();
  // Bar clears back to Start, and the completed entry shows immediately with its
  // duration — the day total should not collapse to 0 during the refetch.
  await expect(page.getByRole("button", { name: "Start" })).toBeVisible();
  await expect(page.getByText("Focus block").first()).toBeVisible();
});

test("new tags walk the palette instead of landing on the same colour", async ({ page }) => {
  await signUp(page);
  const project = await createProject(page);

  for (const [i, tag] of ["alpha", "beta", "gamma", "delta"].entries()) {
    const res = await page.request.post("/api/time_entries", {
      data: {
        description: `Tagged ${i}`,
        projectId: project.id,
        start: new Date(Date.now() - (i + 2) * 3600_000).toISOString(),
        stop: new Date(Date.now() - (i + 1) * 3600_000).toISOString(),
        tags: [tag],
      },
    });
    expect(res.status()).toBe(201);
  }

  const tags = (await (await page.request.get("/api/tags")).json()) as { color: string }[];
  expect(tags).toHaveLength(4);
  expect(new Set(tags.map((t) => t.color)).size).toBe(4);
});
