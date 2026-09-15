import { test, expect } from "@playwright/test";
import { signUp } from "./auth";
import { chooseProject, createProject } from "./project-helpers";
import { fillTimeRange } from "./entry-helpers";

// Tag colours: assigned as the tag is created, and on screen without a reload.

test("a tag created with the entry shows its colour without a reload", async ({ page }) => {
  await signUp(page);
  await createProject(page);
  await page.reload();

  await page.getByRole("button", { name: "Add entry" }).click();
  const dialog = page.getByRole("dialog", { name: "New entry" });
  await dialog.locator("textarea").fill("Tagged work");
  await fillTimeRange(dialog, "09:00", "10:00");
  await dialog.getByRole("button", { name: "Select project" }).click();
  await chooseProject(page);

  await dialog.getByRole("button", { name: "Add tags" }).click();
  await page.getByPlaceholder("Add a tag...").fill("brandnew");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await dialog.getByRole("button", { name: "Add entry" }).click();
  await dialog.waitFor({ state: "hidden" });

  // The list's swatch reads from the tags cache; a stale one paints every new
  // tag in the fallback grey until a reload.
  await page.getByRole("tab", { name: "List" }).click();
  await expect(page.getByText("Tagged work").first()).toBeVisible();
  await expect(page.getByText("brandnew").first()).toBeVisible();
  const colours = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>("[style*='background-color']")) {
      if (el.parentElement?.textContent?.includes("brandnew")) out.push(el.style.backgroundColor);
    }
    return out;
  });
  expect(colours.length).toBeGreaterThan(0);
  expect(colours).not.toContain("rgb(100, 116, 139)"); // the #64748b fallback
});

test("a tag is created as it is added, so its swatch is real before the entry is saved", async ({
  page,
}) => {
  await signUp(page);
  await createProject(page);
  await page.reload();

  await page.getByRole("button", { name: "Add entry" }).click();
  const dialog = page.getByRole("dialog", { name: "New entry" });
  await dialog.getByRole("button", { name: "Add tags" }).click();
  await page.getByPlaceholder("Add a tag...").fill("brandnew");
  await page.keyboard.press("Enter");

  // Recolouring is only offered for a tag the server already holds, so this
  // asserts the row exists — and with it, the colour on the chip.
  const recolor = page.getByRole("button", { name: "Recolor brandnew" });
  await expect(recolor).toBeVisible();
  const swatch = recolor.locator("span").first();
  await expect(swatch).toBeVisible();
  const colour = await swatch.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(colour).not.toBe("rgb(148, 163, 184)"); // the untinted fallback
  expect(colour).not.toBe("rgb(100, 116, 139)"); // the old grey
});
