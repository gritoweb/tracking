import { Badge } from "@/components/ui/badge";
import { ColorDot } from "@/components/ColorDot";
import { UserAvatar } from "@/components/layout/UserAvatar";
import { Duration } from "@/components/ui/numeric";
import { formatShortDate, formatEntryTime } from "@/lib/dateUtils";
import { formatCurrency } from "@/lib/currency";
import type { ReportDetailedEntry } from "@shared/schemas";

// Pinned on the worker's own response — see routes/reports.ts `/detailed`.
export type DetailedEntry = ReportDetailedEntry;

export type ColumnKey =
  | "description"
  | "client"
  | "project"
  | "task"
  | "person"
  | "date"
  | "time"
  | "amount"
  | "duration";

export interface ColumnDef {
  key: ColumnKey;
  label: string;
  defaultVisible: boolean;
  align?: "right";
  sortValue: (e: DetailedEntry) => string | number;
}

export const COLUMNS: ColumnDef[] = [
  { key: "description", label: "Description", defaultVisible: true, sortValue: (e) => e.description.toLowerCase() },
  { key: "client", label: "Client", defaultVisible: false, sortValue: (e) => (e.clientName ?? "").toLowerCase() },
  { key: "project", label: "Project", defaultVisible: true, sortValue: (e) => (e.projectName ?? "").toLowerCase() },
  { key: "task", label: "Task", defaultVisible: false, sortValue: (e) => (e.taskName ?? "").toLowerCase() },
  { key: "person", label: "Person", defaultVisible: true, sortValue: (e) => (e.userName ?? e.userEmail ?? "").toLowerCase() },
  { key: "date", label: "Date", defaultVisible: true, sortValue: (e) => e.start },
  { key: "time", label: "Time", defaultVisible: true, sortValue: (e) => e.start },
  { key: "amount", label: "Amount", defaultVisible: true, align: "right", sortValue: (e) => e.amount },
  { key: "duration", label: "Duration", defaultVisible: true, align: "right", sortValue: (e) => e.duration ?? 0 },
];

export function renderCell(
  key: ColumnKey,
  entry: DetailedEntry,
  timeFormat: "24h" | "12h",
  currency: string
) {
  switch (key) {
    case "description":
      return (
        <div className="min-w-0">
          <span className="block truncate text-sm font-medium">
            {entry.description || (
              <span className="italic text-muted-foreground">No description</span>
            )}
          </span>
          <div className="mt-0.5 flex flex-wrap items-center gap-1">
            {entry.billable && (
              <span className="text-micro font-semibold text-primary">$</span>
            )}
            {entry.tags.map((tag) => (
              <Badge key={tag} variant="outline" className="h-4 px-1 py-0 text-micro font-normal">
                {tag}
              </Badge>
            ))}
          </div>
        </div>
      );
    case "client":
      return entry.clientName ? (
        <span className="truncate text-xs">{entry.clientName}</span>
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      );
    case "project":
      return entry.projectName ? (
        <div className="flex items-center gap-1.5">
          <ColorDot color={entry.projectColor} className="h-2 w-2" />
          <span className="truncate text-xs">{entry.projectName}</span>
        </div>
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      );
    case "task":
      return entry.taskName ? (
        <span className="truncate text-xs">{entry.taskName}</span>
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      );
    case "person":
      return entry.userName || entry.userEmail ? (
        <div className="flex items-center gap-1.5">
          <UserAvatar
            name={entry.userName}
            email={entry.userEmail}
            image={entry.userImage}
            className="h-5 w-5 text-micro"
          />
          <span className="truncate text-xs">{entry.userName ?? entry.userEmail}</span>
        </div>
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      );
    case "date":
      return formatShortDate(entry.start);
    case "time":
      return (
        <>
          {formatEntryTime(entry.start, timeFormat)}
          {entry.stop && <> – {formatEntryTime(entry.stop, timeFormat)}</>}
        </>
      );
    case "amount":
      return entry.amount ? formatCurrency(entry.amount, currency) : "–";
    case "duration":
      return entry.duration ? <Duration seconds={entry.duration} size="xs" /> : "–";
  }
}
