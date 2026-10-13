// The client documents' texts and money math, shared by the PDFs in the app and the MCP tool that prepares them.
import type { ClientService, ReportDetailedEntry } from "./schemas";

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

/** Total, entry count and the average over the days that have time; `dayOf` turns an entry's start into its local day. */
export function hoursSummary(entries: Pick<ReportDetailedEntry, "start" | "duration">[], dayOf: (startIso: string) => string) {
  const totalSeconds = entries.reduce((sum, e) => sum + e.duration, 0);
  const days = new Set(entries.map((e) => dayOf(e.start))).size;
  return { totalSeconds, entryCount: entries.length, dailyAverageHours: days ? totalSeconds / 3600 / days : 0 };
}
