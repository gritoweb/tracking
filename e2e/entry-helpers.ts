import { expect, type Page, type Locator } from "@playwright/test";
import { E2E_PROJECT } from "./project-helpers";

// The Add-entry dialog's Start/Stop fields are TimeOfDayInputs (free-text,
// committed on blur/Enter), not native <input type="time"> — fill then press
// Enter, and wait for the Duration line to confirm the commit registered.
export async function fillTimeRange(dialog: Locator, start: string, stop: string) {
  const startInput = dialog.getByRole("textbox", { name: "Start time" });
  await startInput.fill(start);
  await startInput.press("Enter");
  const stopInput = dialog.getByRole("textbox", { name: "Stop time" });
  await stopInput.fill(stop);
  await stopInput.press("Enter");
}

/** Seed a completed entry for today through the Add-entry dialog; the project must already be loaded in the page. */
export async function addManualEntry(
  page: Page,
  {
    description,
    start,
    stop,
    project = E2E_PROJECT,
  }: { description: string; start: string; stop: string; project?: string }
) {
  await page.getByRole("button", { name: "Add entry" }).click();
  // Named: the project picker's popover is a dialog too.
  const dialog = page.getByRole("dialog", { name: "New entry" });
  await dialog.locator("textarea").fill(description);
  await fillTimeRange(dialog, start, stop);
  // The Duration field reflects the committed range (the old standalone
  // "Duration: 1h 30m" line was removed once every form gained the field).
  await expect(dialog.getByLabel("Duration")).not.toHaveValue("00:00:00");
  await dialog.getByRole("button", { name: "Select project" }).click();
  await page.getByRole("option", { name: project }).click();
  await dialog.getByRole("button", { name: "Add entry" }).click();
  await dialog.waitFor({ state: "hidden" });
}

/**
 * Pick a date in a DatePicker popover. Day buttons carry
 * data-day={date.toLocaleDateString()} (en-US under Playwright).
 */
export async function pickDate(page: Page, trigger: Locator, date: Date) {
  await trigger.click();
  const key = `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
  await page.locator(`button[data-day="${key}"]`).click();
}
