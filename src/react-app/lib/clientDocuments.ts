import { format, parseISO } from "date-fns";
import type { ClientService, ReportDetailedEntry } from "@shared/schemas";

export type DocumentLocale = "pt-BR" | "en";
export type ClientDocumentKind = "invoice" | "hours";

// Every fixed text of the two client PDFs, per language.
export const DOCUMENT_TEXT = {
  "pt-BR": {
    invoice: "Invoice",
    billedTo: "Faturado para",
    issueDate: "Data de emissão",
    description: "Descrição",
    qtyHours: "Qtd / Hrs",
    amount: "Valor",
    technicalServices: "Serviços Técnicos",
    total: "Total",
    thanks: (company: string) => `Obrigado por escolher a ${company}. É um prazer trabalhar com vocês!`,
    hoursTitle: "Relatório de horas trabalhadas",
    totalHours: "Total de horas",
    entries: "Lançamentos",
    dailyAverage: "Média diária",
    hoursUnit: "horas",
    entriesOf: (month: string) => `Lançamentos de ${month}`,
    duration: "Duração",
    project: "Projeto",
    date: "Data",
    page: (n: number, total: number) => `Página ${n}/${total}`,
    invoiceFile: (client: string, number: string) => `Invoice ${client} ${number}.pdf`,
    hoursFile: (client: string, period: string) => `Relatorio de horas - ${client} - ${period}.pdf`,
  },
  en: {
    invoice: "Invoice",
    billedTo: "Billed to",
    issueDate: "Issue date",
    description: "Description",
    qtyHours: "Qty / Hrs",
    amount: "Amount",
    technicalServices: "Technical Services",
    total: "Total",
    thanks: (company: string) => `Thank you for choosing ${company}. It's a pleasure working with you!`,
    hoursTitle: "Worked hours report",
    totalHours: "Total hours",
    entries: "Entries",
    dailyAverage: "Daily average",
    hoursUnit: "hours",
    entriesOf: (month: string) => `Entries for ${month}`,
    duration: "Duration",
    project: "Project",
    date: "Date",
    page: (n: number, total: number) => `Page ${n}/${total}`,
    invoiceFile: (client: string, number: string) => `Invoice ${client} ${number}.pdf`,
    hoursFile: (client: string, period: string) => `Hours report - ${client} - ${period}.pdf`,
  },
} as const;

export interface InvoiceLine {
  description: string;
  hours: number | null;
  amount: number;
}

/** Hours are charged exactly (decimal), one line; each billable fixed service is a line of its own. */
export function invoiceLines(
  totalSeconds: number,
  rate: number,
  services: Pick<ClientService, "name" | "amount" | "billable">[],
  locale: DocumentLocale
): InvoiceLine[] {
  const hours = totalSeconds / 3600;
  const lines: InvoiceLine[] = [];
  if (totalSeconds > 0) {
    lines.push({ description: DOCUMENT_TEXT[locale].technicalServices, hours, amount: round2(hours * rate) });
  }
  for (const s of services) {
    if (s.billable) lines.push({ description: s.name, hours: null, amount: s.amount });
  }
  return lines;
}

export function invoiceTotal(lines: InvoiceLine[]): number {
  return round2(lines.reduce((sum, l) => sum + l.amount, 0));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Total, entry count and the average over the days that have time — the hours report's summary strip. */
export function hoursSummary(entries: Pick<ReportDetailedEntry, "start" | "duration">[]) {
  const totalSeconds = entries.reduce((sum, e) => sum + e.duration, 0);
  const days = new Set(entries.map((e) => format(parseISO(e.start), "yyyy-MM-dd"))).size;
  return { totalSeconds, entryCount: entries.length, dailyAverageHours: days ? totalSeconds / 3600 / days : 0 };
}

export function formatMoney(amount: number, currency: string, locale: DocumentLocale): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);
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

export function formatDay(iso: string, locale: DocumentLocale): string {
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric" }).format(parseISO(iso));
}

/** "setembro de 2026" / "September 2026". */
export function formatMonth(day: string, locale: DocumentLocale): string {
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(parseISO(day));
}
