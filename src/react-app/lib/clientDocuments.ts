import { format, parseISO } from "date-fns";
import type { ClientDocumentKind, DocumentLocale } from "@shared/client-documents";

/** "R$ 1.234,50" / "R$ 1,234.50": the symbol always stands apart from the amount, as pt-BR already writes it. */
export function formatMoney(amount: number, currency: string, locale: DocumentLocale): string {
  const parts = new Intl.NumberFormat(locale, { style: "currency", currency }).formatToParts(amount);
  return parts
    .map((p, i) => (p.type === "currency" && parts[i + 1] && parts[i + 1].type !== "literal" ? `${p.value}\u00a0` : p.value))
    .join("");
}

export function formatHoursDecimal(hours: number, locale: DocumentLocale): string {
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(hours);
}

/** 32:10:00 — the hours report's duration format, which runs past 24h. */
export function formatClock(seconds: number): string {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** "19/10/2026" / "10-19-2026": the English documents write dates with hyphens. */
export function formatDay(iso: string, locale: DocumentLocale): string {
  const day = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric" }).format(parseISO(iso));
  return locale === "en" ? day.replace(/\//g, "-") : day;
}

/** "setembro de 2026" / "September 2026". */
export function formatMonth(day: string, locale: DocumentLocale): string {
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(parseISO(day));
}

/** The browser's local day an entry started on, for `hoursSummary`. */
export const localDay = (iso: string): string => format(parseISO(iso), "yyyy-MM-dd");

/** What a link can pre-fill (the MCP's prepare_client_document builds one). */
export interface DocumentPreset {
  kind: ClientDocumentKind;
  locale: DocumentLocale;
  from: string;
  to: string;
  number?: string;
  /** An hourly rate for this invoice only. */
  rate?: number;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The preset in `?document=invoice&from=…&to=…&lang=…&number=…&rate=…`, or null when the link carries none or a broken one. */
export function documentPresetFrom(params: URLSearchParams): DocumentPreset | null {
  const kind = params.get("document");
  const locale = params.get("lang") ?? "pt-BR";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  if ((kind !== "invoice" && kind !== "hours") || (locale !== "pt-BR" && locale !== "en")) return null;
  if (!DAY.test(from) || !DAY.test(to) || from > to) return null;
  const rate = params.get("rate") === null ? undefined : Number(params.get("rate"));
  if (rate !== undefined && !(rate >= 0)) return null;
  return { kind, locale, from, to, number: params.get("number") ?? undefined, rate };
}
