import { downloadBlob } from "@/lib/download";
import { formatSeconds, formatEntryTime, localDayKey } from "./dateUtils";
import { buildXlsx } from "./xlsx";

interface ExportEntry {
  start: string;
  stop: string | null;
  duration: number | null;
  description: string;
  projectName?: string | null;
  clientName?: string | null;
  taskName?: string | null;
  billable: boolean;
  amount?: number;
  tags: string[];
}

export interface ExportOptions {
  /** False drops the Amount column, for a report that goes to a client. */
  includeAmount?: boolean;
}

const EXPORT_HEADERS = [
  "Date",
  "Start",
  "Stop",
  "Duration",
  "Description",
  "Client",
  "Project",
  "Task",
  "Billable",
  "Amount",
  "Tags",
];

const AMOUNT_COLUMN = EXPORT_HEADERS.indexOf("Amount");

function withoutAmount<T>(cells: T[], options: ExportOptions): T[] {
  return options.includeAmount === false ? cells.filter((_, i) => i !== AMOUNT_COLUMN) : cells;
}

// Row cells shared by CSV and XLSX (Amount kept numeric for spreadsheets).
function exportRow(e: ExportEntry): (string | number)[] {
  return [
    // Local date, matching the Date column to the Start time beside it — the
    // UTC slice dated an 18:00 entry to the next day for anyone west of UTC.
    localDayKey(e.start),
    formatEntryTime(e.start),
    e.stop ? formatEntryTime(e.stop) : "",
    e.duration ? formatSeconds(e.duration) : "",
    e.description ?? "",
    e.clientName ?? "",
    e.projectName ?? "",
    e.taskName ?? "",
    e.billable ? "Yes" : "No",
    Number((e.amount ?? 0).toFixed(2)),
    (e.tags ?? []).join(", "),
  ];
}

export function exportToCSV(
  entries: ExportEntry[],
  filename = "time-entries",
  options: ExportOptions = {}
): void {
  // A leading apostrophe stops Excel/Sheets evaluating a text cell as a formula; numbers stay untouched.
  const csvCell = (v: string | number) =>
    typeof v === "number"
      ? String(v)
      : `"${(/^[=+\-@\t\r]/.test(v) ? `'${v}` : v).replace(/"/g, '""')}"`;
  const lines = [
    withoutAmount(EXPORT_HEADERS, options).join(","),
    ...entries.map((e) => withoutAmount(exportRow(e), options).map(csvCell).join(",")),
  ];
  downloadBlob(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" }), `${filename}.csv`);
}

// Real .xlsx (OOXML) via the dependency-free writer — opens in Excel/Sheets
// without the format-mismatch warning the old HTML-table .xls trick produced.
export function exportToExcel(
  entries: ExportEntry[],
  filename = "time-entries",
  options: ExportOptions = {}
): void {
  const rows = [
    withoutAmount(EXPORT_HEADERS, options),
    ...entries.map((e) => withoutAmount(exportRow(e), options)),
  ];
  const bytes = buildXlsx("Time entries", rows);
  downloadBlob(
    new Blob([bytes as BlobPart], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `${filename}.xlsx`
  );
}

