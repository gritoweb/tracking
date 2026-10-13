// Renders both client PDFs with extreme data and reads them back: nothing may leave the page or break the total.
import { describe, expect, it } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { invoiceLines, invoiceTotal } from "@shared/client-documents";
import { REPORT_DEFAULT_COLORS } from "@shared/colors";
import type { ReportDetailedEntry } from "@shared/schemas";
import { formatMoney } from "@/lib/clientDocuments";
import { brandPalette } from "./brand";
import { InvoiceDocument } from "./InvoiceDocument";
import { HoursReportDocument } from "./HoursReportDocument";

const A4_WIDTH = 595.28;
const palette = brandPalette(REPORT_DEFAULT_COLORS);
const long = (word: string, n: number) => Array.from({ length: n }, () => word).join(" ");

interface TextItem { str: string; left: number; right: number; page: number }

async function textOf(buffer: Uint8Array): Promise<{ pages: number; items: TextItem[] }> {
  const pdf = await getDocument({ data: new Uint8Array(buffer), useSystemFonts: false }).promise;
  const items: TextItem[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const content = await (await pdf.getPage(n)).getTextContent();
    for (const it of content.items) {
      if (!("str" in it) || !it.str.trim()) continue;
      items.push({ str: it.str, left: it.transform[4], right: it.transform[4] + it.width, page: n });
    }
  }
  return { pages: pdf.numPages, items };
}

function expectInsidePage(items: TextItem[]) {
  for (const it of items) {
    expect(it.left, `"${it.str}" starts off the page`).toBeGreaterThanOrEqual(0);
    expect(it.right, `"${it.str}" runs off the page`).toBeLessThanOrEqual(A4_WIDTH);
  }
}

describe("the invoice PDF", () => {
  it("keeps a nine-figure total whole, and long names and lines on the page", async () => {
    const services = Array.from({ length: 20 }, (_, i) => ({ name: `${long("Managed hosting", 6)} ${i}`, amount: 49_999_999.99, billable: true }));
    const lines = invoiceLines(9_999 * 3600, 99_999.99, services, "pt-BR");
    const total = invoiceTotal(lines);
    const buffer = await renderToBuffer(
      <InvoiceDocument
        locale="pt-BR"
        palette={palette}
        logo={null}
        companyName={long("Company", 12)}
        companyEmail="a-very-long-billing-address@an-unusually-long-company-domain.example"
        clientName={long("School", 20)}
        number="2026-09-ACME-LONG-INVOICE-NUMBER-0000001"
        issueDate="13/10/2026"
        lines={lines}
        currency="BRL"
      />
    );
    const { items } = await textOf(buffer);
    expectInsidePage(items);
    // The total is one text run, never wrapped or cut.
    const totalText = formatMoney(total, "BRL", "pt-BR").replace(/\s/g, " ");
    const amount = items.find((i) => i.str.replace(/\s/g, " ") === totalText);
    expect(amount, "the total is cut or wrapped").toBeDefined();
    // …and sits clear of its "TOTAL" label inside the box.
    // Letter-spaced, it reads back as "T O T A L".
    const label = items.find((i) => i.str.replace(/\s/g, "") === "TOTAL" && i.page === amount!.page)!;
    expect(label.right).toBeLessThan(amount!.left);
  }, 30_000);
});

describe("the hours report PDF", () => {
  it("breaks hundreds of long entries over pages without leaving the page", async () => {
    const entries = Array.from({ length: 300 }, (_, i): ReportDetailedEntry => ({
      id: `e${i}`,
      description: `${long("Investigate the access problem reported by the client", 3)} ${i}`,
      projectId: "p",
      projectName: long("Institutional website redesign", 3),
      projectColor: "#3b82f6",
      clientName: "Client",
      taskId: null,
      taskName: null,
      userId: null,
      userName: null,
      userEmail: null,
      userImage: null,
      start: `2026-09-${String((i % 28) + 1).padStart(2, "0")}T12:00:00.000Z`,
      stop: null,
      duration: 999 * 3600 + 59 * 60,
      billable: true,
      amount: 0,
      tags: [],
    }));
    const buffer = await renderToBuffer(
      <HoursReportDocument
        locale="en"
        palette={palette}
        logo={null}
        companyName={long("Company", 12)}
        clientName={long("School", 20)}
        periodLabel="09/01/2026 – 09/30/2026"
        sectionTitle="Entries for September 2026"
        entries={entries}
      />
    );
    const { pages, items } = await textOf(buffer);
    expect(pages).toBeGreaterThan(10);
    expectInsidePage(items);
    expect(items.some((i) => i.str === "999:59:00")).toBe(true);
  }, 30_000);
});
