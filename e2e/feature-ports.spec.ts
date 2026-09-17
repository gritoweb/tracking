import { test, expect } from "@playwright/test";
import { signUp } from "./auth";
import { OWNER_STATE } from "./auth-state";
import { createProject, pickProjectInBar } from "./project-helpers";

// Regression coverage for the Toggl-inspired feature ports: favorites,
// calendar month view, and the productivity settings.

// Leaves a timer running, so it keeps its own fresh workspace instead of OWNER_STATE below.
test("favorites: save current draft and start from it", async ({ page }) => {
  await signUp(page);
  await createProject(page);
  await page.reload();

  await page.getByPlaceholder("What are you working on?").fill("Design review");
  await page.getByRole("button", { name: "Favorites" }).click();
  await page.getByRole("menuitem", { name: /Save current as favorite/ }).click();

  // The menu stays open on save; the new favorite appears as a startable item.
  await expect(page.getByRole("menuitem", { name: /Design review/ })).toBeVisible();

  // No project anywhere yet, so starting the favorite says so instead of opening a picker.
  await page.getByRole("menuitem", { name: /Design review/ }).click();
  await expect(page.getByText("Choose a project to start")).toBeVisible();

  // The start waits for a project; the open menu aria-hides the bar, so close it first.
  await page.keyboard.press("Escape");
  await pickProjectInBar(page);
  await expect(page.getByRole("button", { name: "Stop timer" })).toBeVisible();
});

test.describe("read-only screens", () => {
  test.use({ storageState: OWNER_STATE });

  test("calendar: month view renders", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("tab", { name: "Calendar" }).click();
    // Day/5-day/Week/Month moved into the "View options" popover alongside the
    // other persisted display preferences.
    await page.getByRole("button", { name: "View options" }).click();
    await page.getByRole("radio", { name: "Month" }).click();

    await expect(page.locator(".fc-daygrid")).toBeVisible();
  });

  test("settings: productivity + calendar preferences render", async ({ page }) => {
    await page.goto("/settings?tab=tracking");

    await expect(page.getByText("Productivity", { exact: true })).toBeVisible();
    await expect(page.getByText("Idle detection")).toBeVisible();
    await expect(page.getByText("Not-tracking reminders")).toBeVisible();
    await expect(page.getByText("Pomodoro", { exact: true })).toBeVisible();
    // Every default (incl. the 25-min work interval) must resolve to a menu option.
    await expect(page.getByRole("combobox").filter({ hasText: "25 min" })).toBeVisible();

    // Calendar preferences live in the Preferences card, under General.
    await page.getByRole("tab", { name: "General" }).click();
    await expect(page.getByText("Week starts on")).toBeVisible();
    await expect(page.getByText("Show weekends")).toBeVisible();
  });
});
