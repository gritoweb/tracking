import { test, expect } from "@playwright/test";
import { signUp } from "./auth";
import { addManualEntry, goToListView } from "./entry-helpers";
import { createProject } from "./project-helpers";

test.describe("entry delete", () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page);
    await createProject(page);
    await page.reload();
    await goToListView(page);
  });

  test("deletes an entry via its row menu (with exit animation)", async ({ page }) => {
    // Seed an entry.
    await addManualEntry(page, { description: "Entry to delete", start: "09:00", stop: "10:00" });

    const row = page.getByText("Entry to delete");
    await expect(row).toBeVisible();

    // Open the row's action menu and delete.
    await row.hover();
    await page.getByRole("button", { name: "Entry actions" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    // Deleting asks first (ConfirmDialog, since fce6361).
    await page.getByRole("alertdialog", { name: "Delete entry?" }).getByRole("button", { name: "Delete" }).click();

    // The row plays its exit animation, then is removed; an undo toast appears.
    await expect(page.getByText("Entry deleted")).toBeVisible();
    await expect(page.getByText("Entry to delete")).toHaveCount(0);
  });
});
