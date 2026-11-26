import type { Invoice, ReportSettings } from "@shared/schemas";
import { DOCUMENT_TEXT } from "@shared/client-documents";
import { formatDay } from "@/lib/clientDocuments";
import { brandPalette } from "./brand";
import type { InvoiceProps } from "./generate";

/** What an invoice PDF needs: a saved invoice, or the editor's draft of one. */
export type InvoiceContent = Pick<Invoice, "number" | "issueDate" | "dueDate" | "currency" | "locale" | "lines" | "notes" | "client" | "company">;

/** The PDF's props: the invoice's own frozen content, drawn in the workspace's current branding. */
export function invoicePdfProps(inv: InvoiceContent, settings: ReportSettings): InvoiceProps {
  // The renderer fetches the logo itself; same origin, so the session cookie goes with it.
  const logo = settings.logoUrl && new URL(settings.logoUrl, window.location.origin).href;
  return {
    locale: inv.locale,
    palette: brandPalette(settings.colors),
    logo,
    companyName: inv.company.name,
    companyEmail: inv.company.email,
    companyAddress: inv.company.address,
    companyPhone: inv.company.phone,
    clientName: inv.client.name,
    clientAddress: inv.client.address,
    number: inv.number,
    issueDate: formatDay(`${inv.issueDate}T12:00:00`, inv.locale),
    dueDate: formatDay(`${inv.dueDate}T12:00:00`, inv.locale),
    notes: inv.notes,
    lines: inv.lines,
    currency: inv.currency,
  };
}

export async function renderInvoicePdf(inv: InvoiceContent, settings: ReportSettings): Promise<Blob> {
  const { renderInvoice } = await import("./generate");
  return renderInvoice(invoicePdfProps(inv, settings));
}

export function invoiceFileName(inv: InvoiceContent): string {
  return DOCUMENT_TEXT[inv.locale].invoiceFile(inv.client.name, inv.number);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
