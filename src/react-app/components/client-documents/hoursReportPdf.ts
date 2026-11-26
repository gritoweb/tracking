import type { ReportDetailedEntry, ReportSettings } from "@shared/schemas";
import { DOCUMENT_TEXT, type DocumentLocale } from "@shared/client-documents";
import { formatDay, formatMonth } from "@/lib/clientDocuments";
import { brandPalette } from "./brand";

export interface HoursReportInput {
  clientName: string;
  locale: DocumentLocale;
  from: string;
  to: string;
  entries: ReportDetailedEntry[];
  settings: ReportSettings;
}

/** A period inside one month is named by the month; any other by its two dates. */
const oneMonth = (from: string, to: string) => from.slice(0, 7) === to.slice(0, 7);

export async function renderHoursReportPdf({ clientName, locale, from, to, entries, settings }: HoursReportInput): Promise<Blob> {
  const { renderHoursReport } = await import("./generate");
  const t = DOCUMENT_TEXT[locale];
  return renderHoursReport({
    locale,
    palette: brandPalette(settings.colors),
    // The renderer fetches the logo itself; same origin, so the session cookie goes with it.
    logo: settings.logoUrl && new URL(settings.logoUrl, window.location.origin).href,
    companyName: settings.companyName,
    clientName,
    periodLabel: `${formatDay(`${from}T12:00:00`, locale)} – ${formatDay(`${to}T12:00:00`, locale)}`,
    sectionTitle: oneMonth(from, to) ? t.entriesOf(formatMonth(from, locale)) : t.entries,
    entries,
  });
}

export function hoursReportFileName({ clientName, locale, from, to }: Pick<HoursReportInput, "clientName" | "locale" | "from" | "to">): string {
  return DOCUMENT_TEXT[locale].hoursFile(clientName, oneMonth(from, to) ? formatMonth(from, locale) : `${from} - ${to}`);
}
