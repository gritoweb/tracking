import { test, expect } from "@playwright/test";
import { signUp } from "./auth";
import { chooseProject, createProject } from "./project-helpers";

/**
 * Click-to-create on the calendar grid. This path had no coverage, which made
 * the entry-form unification risky — it's the one creation flow no test drove.
 *
 * Drag-select does NOT finalize under Playwright's synthetic events (see the
 * verify skill); click-to-create is the reliable automation path.
 */
test("creating an entry by clicking an empty calendar slot", async ({ page }) => {
  await signUp(page);
  await createProject(page, { name: "Alpha", color: "#e11d48", billable: true });

  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByRole("tab", { name: "Calendar", exact: true }).click();
  await page.waitForTimeout(1400);

  // Lanes are scrolled to ~08:00; target a visible one.
  const lane = page.locator(".fc-timegrid-slot-lane").nth(20);
  await lane.click({ position: { x: 40, y: 5 } });

  const form = page.getByRole("dialog", { name: /New entry/i });
  await expect(form).toBeVisible();

  await form.locator("textarea").fill("Slot-created entry");
  // Every entry needs a project (D3): Add waits for one.
  await expect(form.getByRole("button", { name: "Add entry" })).toBeDisabled();
  await form.getByRole("button", { name: "Select project" }).click();
  await chooseProject(page, "Alpha");
  await form.getByRole("button", { name: "Add entry" }).click();
  await expect(form).not.toBeVisible();

  await page.getByRole("tab", { name: "List", exact: true }).click();
  await page.waitForTimeout(1200);
  await expect(page.getByText("Slot-created entry")).toBeVisible();
});
