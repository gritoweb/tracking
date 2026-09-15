import { test, expect } from "@playwright/test";
import { signUp } from "./auth";
import { createProject } from "./project-helpers";

/**
 * The timer bar's description suggestions.
 *
 * Typing opens the list; focus alone does not — the entry dialogs autofocus
 * this field, and a dropdown that greets you covers the form you came to fill.
 * Once open it must STAY open: the field is a Popover *Anchor*, not a
 * *Trigger*, so Radix's dismissable layer used to count the very interaction
 * that opened the list as an outside one and dismissed it after ~230ms. A
 * plain toBeVisible() passes during that flash, so the wait below is the point.
 */
test.describe("description autocomplete", () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page);
    const origin = new URL(page.url()).origin;
    const project = await createProject(page);
    for (const d of ["Homepage hero rebuild", "Client feedback pass", "Sprint planning"]) {
      await page.request.post("/api/time_entries", {
        headers: { origin },
        data: {
          description: d,
          projectId: project.id,
          start: new Date(Date.now() - 7200_000).toISOString(),
          stop: new Date(Date.now() - 3600_000).toISOString(),
        },
      });
    }
    await page.reload();
  });

  test("focus alone leaves it shut; typing opens it and keeps it open", async ({ page }) => {
    const input = page.getByPlaceholder("What are you working on?");
    const list = page.locator("#description-suggestions");

    await input.click();
    await page.waitForTimeout(400);
    await expect(list).toBeHidden();

    await input.pressSequentially("ho");
    await expect(list).toBeVisible();
    // Long enough to outlast the exit animation the flash was hiding behind.
    await page.waitForTimeout(700);
    await expect(list).toBeVisible();
  });

  test("escape, selection and focus loss each still close it", async ({ page }) => {
    const input = page.getByPlaceholder("What are you working on?");
    const list = page.locator("#description-suggestions");

    await input.pressSequentially("ho");
    await expect(list).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(list).toBeHidden();

    // Typing reopens and filters.
    await input.fill("home");
    await expect(list).toBeVisible();
    await expect(page.getByRole("option")).toHaveCount(1);

    // Picking a row fills the field and closes.
    await page.getByRole("option").first().click();
    await expect(list).toBeHidden();
    await expect(input).toHaveValue("Homepage hero rebuild");

    // Focus genuinely leaving still dismisses — that path is the field's own
    // onBlur, which is why the Radix focus-outside check was safe to suppress.
    await input.fill("");
    await input.pressSequentially("ho");
    await expect(list).toBeVisible();
    await page.getByRole("link", { name: "Projects" }).first().focus();
    await expect(list).toBeHidden();
  });
});
