import { test, expect } from "@playwright/test";
import { signUp } from "./auth";
import { createClient, createProject } from "./project-helpers";


test("auto-assign colors: toggle + recolor existing projects", async ({ page }) => {
  await signUp(page);

  // Seed several projects that all share the default color.
  const client = await createClient(page);
  for (const name of ["Alpha", "Beta", "Gamma", "Delta"]) {
    await createProject(page, { name, color: "#0ea5e9", clientId: client.id });
  }

  await page.goto("/settings");
  await expect(page.getByText("Auto-assign colors")).toBeVisible();

  // Enable the preference, then apply to existing.
  await page.getByRole("switch", { name: /auto-assign colors/i }).click();
  await page.getByRole("button", { name: "Apply to existing" }).click();
  await expect(page.getByText(/Recolored 4 projects/)).toBeVisible({ timeout: 30_000 });

  // Projects page: all four render and their swatches are now distinct.
  await page.goto("/projects");
  await expect(page.getByText("Alpha")).toBeVisible();
  await expect(page.getByText("Delta")).toBeVisible();
  const colors = await page
    .locator('[style*="background-color"]')
    .evaluateAll((els) =>
      (els as HTMLElement[]).map((e) => e.style.backgroundColor).filter(Boolean)
    );
  expect(new Set(colors).size).toBeGreaterThan(1);
});
