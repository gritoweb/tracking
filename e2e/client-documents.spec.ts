import { test, expect, type Page } from "@playwright/test";
import { endOfMonth, format, startOfMonth, subMonths } from "date-fns";
import { readFile } from "node:fs/promises";
import { signUp } from "./auth";

// A client with 3h of last month's time, one billable and one non-billable recurring service.
async function seedClient(page: Page) {
  const client = await (await page.request.post("/api/clients", { data: { name: "Example School" } })).json();
  const project = await (await page.request.post("/api/projects", { data: { name: "Site", color: "#0ea5e9", clientId: client.id } })).json();
  const month = startOfMonth(subMonths(new Date(), 1));
  const at = (h: number) => new Date(month.getFullYear(), month.getMonth(), 3, h).toISOString();
  await page.request.post("/api/time_entries", { data: { description: "Site adjustments", projectId: project.id, start: at(9), stop: at(12) } });
  await page.request.put("/api/report-settings", { data: { currency: "BRL", defaultRate: 100 } });
  return { client, month };
}

async function download(page: Page) {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Generate PDF" }).click();
  const file = await pending;
  const bytes = await readFile((await file.path())!);
  return { name: file.suggestedFilename(), head: bytes.subarray(0, 5).toString() };
}

test.describe("client documents", () => {
  test.beforeEach(async ({ page }) => signUp(page));

  test("recurring services typed with a comma, then an invoice at a new rate and an hours report", async ({ page }) => {
    const { client, month } = await seedClient(page);
    await page.goto(`/clients/${client.id}`);

    for (const [name, amount, billable] of [["Email server", "35,00", true], ["Internal tool", "10", false]] as const) {
      await page.getByRole("button", { name: "Add service" }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByPlaceholder("Service name").fill(name);
      await dialog.getByLabel("Amount").fill(amount);
      if (!billable) await dialog.getByRole("switch", { name: "Billable" }).click();
      await dialog.getByRole("button", { name: "Add service" }).click();
      await expect(dialog).toBeHidden();
    }
    await expect(page.getByText("Not billable")).toBeVisible();

    // Opens on last month, in dd/mm/yyyy, at the workspace default rate; a rate typed here becomes the client's.
    await page.getByRole("button", { name: "Invoice" }).click();
    await expect(page.getByRole("button", { name: `From: ${format(month, "dd/MM/yyyy")}` })).toBeVisible();
    await expect(page.getByRole("button", { name: `To: ${format(endOfMonth(month), "dd/MM/yyyy")}` })).toBeVisible();
    const rate = page.getByLabel("Hourly rate");
    await expect(rate).toHaveValue("100,00");
    await rate.fill("65,5");
    await expect(page.getByText(/Saved as this client's rate/)).toBeVisible();
    const invoice = await download(page);
    expect(invoice.name).toBe("Invoice Example School 1.pdf");
    expect(invoice.head).toBe("%PDF-");

    await page.getByRole("button", { name: "Hours report" }).click();
    await expect(page.getByLabel("Hourly rate")).toHaveCount(0);
    const hours = await download(page);
    expect(hours.name).toMatch(/^Relatorio de horas - Example School - /);
    expect(hours.head).toBe("%PDF-");

    // The next invoice is offered number 2.
    await page.getByRole("button", { name: "Invoice" }).click();
    await expect(page.getByLabel("Invoice number")).toHaveValue("2");
    await page.getByRole("button", { name: "Cancel" }).click();

    // Generating saved it as the client's rate.
    expect((await (await page.request.get(`/api/clients/${client.id}`)).json()).rate).toBe(65.5);
  });

  test("a prepared link opens the generator filled in, and closing it drops the link", async ({ page }) => {
    const { client } = await seedClient(page);
    await page.goto(`/clients/${client.id}?document=invoice&from=2026-08-01&to=2026-08-31&lang=en&number=INV-7&rate=80`);
    const dialog = page.getByRole("dialog", { name: "Invoice" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("radio", { name: "English" })).toHaveAttribute("aria-checked", "true");
    await expect(dialog.getByLabel("Invoice number")).toHaveValue("INV-7");
    await expect(dialog.getByLabel("Hourly rate")).toHaveValue("80,00");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(page).not.toHaveURL(/document=/);
  });

  test("Reports offers the invoice and the hours report beside the CSV/Excel export", async ({ page }) => {
    await page.goto("/reports");
    await page.getByRole("button", { name: "Hours reports" }).click();
    const dialog = page.getByRole("dialog", { name: "Hours report" });
    await expect(dialog.getByLabel("Client")).toBeVisible();
    await expect(dialog.getByLabel("Hourly rate")).toHaveCount(0);
  });
});
