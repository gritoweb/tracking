import { test, expect, type Page } from "@playwright/test";
import { endOfMonth, format, startOfMonth, subMonths } from "date-fns";
import { readFile } from "node:fs/promises";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
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

async function download(page: Page, button: string) {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: button, exact: true }).click();
  const file = await pending;
  const bytes = await readFile((await file.path())!);
  return { name: file.suggestedFilename(), bytes };
}

async function pdfText(bytes: Buffer) {
  const pdf = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: false }).promise;
  return (await (await pdf.getPage(1)).getTextContent()).items.map((i) => ("str" in i ? i.str : "")).join(" ");
}

const hoursAmount = (page: Page) => page.getByRole("region", { name: "Worked hours" }).getByLabel("Amount");

test.describe("client documents", () => {
  test.beforeEach(async ({ page }) => signUp(page));

  test("recurring services typed with a comma, then a saved invoice at a new rate and an hours report", async ({ page }) => {
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

    // The editor opens on last month, at the workspace default rate, with the billable service as a recurring item.
    await page.getByRole("button", { name: "Invoice", exact: true }).click();
    await expect(page).toHaveURL(/\/invoices\/new/);
    await expect(page.getByRole("button", { name: `From: ${format(month, "dd/MM/yyyy")}` })).toBeVisible();
    await expect(page.getByRole("button", { name: `To: ${format(endOfMonth(month), "dd/MM/yyyy")}` })).toBeVisible();
    await expect(page.getByRole("region", { name: "Recurring" }).getByLabel("Recurring item description")).toHaveValue("Email server");
    const rate = page.getByLabel("Hourly rate");
    await expect(rate).toHaveValue("100,00");
    await rate.fill("65,5");
    await expect(hoursAmount(page)).toHaveValue("196,50");

    const invoice = await download(page, "Save and download PDF");
    expect(invoice.name).toBe("Invoice Example School 1.pdf");
    expect(invoice.bytes.subarray(0, 5).toString()).toBe("%PDF-");
    await expect(page).toHaveURL(new RegExp(`/clients/${client.id}$`));
    // Saved: listed by month, and the rate is the client's from now on.
    await expect(page.getByText(/#1 · R\$\s?231,50/)).toBeVisible();
    expect((await (await page.request.get(`/api/clients/${client.id}`)).json()).rate).toBe(65.5);

    await page.getByRole("button", { name: "Hours report", exact: true }).click();
    await expect(page).toHaveURL(/\/hours-report/);
    // The URL changes before the lazy screen replaces the client page, whose rows also have a "Download PDF".
    await expect(page.getByRole("heading", { name: "Hours report", level: 1 })).toBeVisible();
    await expect(page.getByLabel("Hourly rate")).toHaveCount(0);
    const hours = await download(page, "Download PDF");
    expect(hours.name).toMatch(/^Relatorio de horas - Example School - /);
    expect(await pdfText(hours.bytes)).toContain("Horas por projeto");

    // The next invoice is offered the same number until someone types another.
    await page.goto(`/clients/${client.id}/invoices/new`);
    await expect(page.getByLabel("Invoice number")).toHaveValue("1");
  });

  test("a fixed-rate client is invoiced its fee for the hours, and the editor's billing switch writes back to the client", async ({ page }) => {
    const { client } = await seedClient(page);
    await page.request.post(`/api/clients/${client.id}/services`, { data: { name: "Managed hosting", amount: 50, billable: true } });
    await page.goto(`/clients/${client.id}`);

    await page.getByRole("button", { name: "Edit", exact: true }).click();
    const form = page.getByRole("dialog");
    await form.getByRole("radio", { name: "Fixed rate" }).click();
    await expect(form.getByLabel("Hourly rate")).toHaveCount(0);
    await form.getByRole("button", { name: "Save changes" }).click();
    await expect(form.getByText("Enter the fixed amount")).toBeVisible();
    await form.getByLabel("Fixed rate").fill("1000");
    await form.getByRole("button", { name: "Save changes" }).click();
    await expect(form).toBeHidden();
    // The amount follows the fee, not 3h × the default rate, in any period and in the client list.
    await expect(page.getByText(/R\$\s?1,000\.00 \/ month/)).toBeVisible();
    await page.getByRole("radio", { name: "All time" }).click();
    await expect(page.getByText(/R\$\s?1,000\.00 \/ month/)).toBeVisible();
    await page.goto("/clients");
    await expect(page.getByTitle("Fixed rate per month")).toHaveText(/R\$\s?1,000\.00/);

    // The editor opens on the client's billing.
    await page.goto(`/clients/${client.id}/invoices/new`);
    await expect(page.getByRole("radio", { name: "Fixed rate" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByLabel("Fixed rate", { exact: true })).toHaveValue("1.000,00");
    await expect(hoursAmount(page)).toHaveValue("1.000,00");
    const text = await pdfText((await download(page, "Save and download PDF")).bytes);
    // 3 hours worked, billed at the fee rather than 3 × the default 100; the service stays on top.
    expect(text).toMatch(/Serviços Técnicos\s+3\s+R\$\s?1\.000,00/);
    expect(text).toMatch(/Managed hosting\s+—\s+R\$\s?50,00/);
    expect(text).toMatch(/R\$\s?1\.050,00/);

    // Switching to hourly on an invoice makes the client hourly again, with no fee to fill in.
    await page.goto(`/clients/${client.id}/invoices/new`);
    await page.getByRole("radio", { name: "Fixed rate" }).click();
    await page.getByLabel("Fixed rate", { exact: true }).fill("");
    await expect(page.getByText("Enter the fixed rate to save the invoice.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
    await page.getByRole("radio", { name: "Hourly rate" }).click();
    await expect(page.getByLabel("Hourly rate")).toHaveValue("100,00");
    await expect(hoursAmount(page)).toHaveValue("300,00");
    await page.getByLabel("Invoice number").fill("2");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/clients/${client.id}$`));
    expect((await (await page.request.get(`/api/clients/${client.id}`)).json()).fixedFee).toBeNull();
  });

  test("a saved invoice is deleted only after the confirmation", async ({ page }) => {
    const { client } = await seedClient(page);
    await page.goto(`/clients/${client.id}/invoices/new`);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText(/#1 · /)).toBeVisible();

    await page.getByRole("button", { name: "Delete invoice" }).click();
    const confirm = page.getByRole("alertdialog");
    await confirm.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByText(/#1 · /)).toBeVisible();
    await page.getByRole("button", { name: "Delete invoice" }).click();
    await confirm.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("No invoices yet")).toBeVisible();
  });

  test("a prepared link opens the invoice editor filled in", async ({ page }) => {
    const { client } = await seedClient(page);
    await page.goto(`/clients/${client.id}?document=invoice&from=2026-08-01&to=2026-08-31&lang=en&number=7&rate=80`);
    await expect(page).toHaveURL(/\/invoices\/new\?/);
    await expect(page.getByRole("radio", { name: "English" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByLabel("Invoice number")).toHaveValue("7");
    await expect(page.getByLabel("Hourly rate")).toHaveValue("80,00");
  });

  test("Reports picks the client of an hours report, then opens its screen", async ({ page }) => {
    await seedClient(page);
    await page.goto("/reports");
    await page.getByRole("button", { name: "Hours reports" }).click();
    const dialog = page.getByRole("dialog", { name: "Hours report" });
    await expect(dialog.getByLabel("Client")).toBeVisible();
    await expect(dialog.getByLabel("Hourly rate")).toHaveCount(0);
    await dialog.getByLabel("Client").click();
    await page.getByRole("option", { name: "Example School" }).click();
    await dialog.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/hours-report\?/);
  });
});
