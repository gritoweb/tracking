import type { TimeEntry } from "@shared/schemas";

export interface TimesheetRowMeta {
  key: string;
  projectId: string | null;
  taskId: string | null;
  projectName: string | null;
  projectColor: string | null;
  taskName: string | null;
}

export interface TimesheetCell {
  seconds: number;
  entries: TimeEntry[];
}

export const rowKeyOf = (projectId: string | null, taskId: string | null) =>
  `${projectId ?? ""}__${taskId ?? ""}`;

/** Build the timesheet's rows + a rowKey→dayIndex→cell lookup from a week's entries. */
export function buildTimesheetGrid(
  entries: TimeEntry[],
  extraRows: TimesheetRowMeta[],
  weekStart: Date
): { rows: TimesheetRowMeta[]; cells: Map<string, TimesheetCell[]> } {
  const rowMap = new Map<string, TimesheetRowMeta>();
  const cellMap = new Map<string, TimesheetCell[]>();

  const ensureRow = (m: TimesheetRowMeta) => {
    if (!rowMap.has(m.key)) {
      rowMap.set(m.key, m);
      cellMap.set(m.key, Array.from({ length: 7 }, () => ({ seconds: 0, entries: [] })));
    }
  };

  for (const e of entries) {
    const key = rowKeyOf(e.projectId, e.taskId);
    ensureRow({
      key,
      projectId: e.projectId,
      taskId: e.taskId,
      projectName: e.projectName,
      projectColor: e.projectColor,
      taskName: e.taskName ?? null,
    });
    // Day index from the entry's local start date.
    const start = new Date(e.start);
    const dayIndex = Math.floor(
      (new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime() -
        new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate()).getTime()) /
        86_400_000
    );
    if (dayIndex < 0 || dayIndex > 6) continue;
    const cell = cellMap.get(key)![dayIndex];
    cell.seconds += e.duration ?? 0;
    cell.entries.push(e);
  }

  // Include manually-added empty rows.
  for (const r of extraRows) ensureRow(r);

  const rows = [...rowMap.values()].sort((a, b) => {
    const pa = a.projectName ?? "￿";
    const pb = b.projectName ?? "￿";
    return pa.localeCompare(pb) || (a.taskName ?? "").localeCompare(b.taskName ?? "");
  });
  return { rows, cells: cellMap };
}

export function timesheetDayTotals(cells: Map<string, TimesheetCell[]>): number[] {
  const totals = Array(7).fill(0);
  for (const list of cells.values()) list.forEach((c, i) => (totals[i] += c.seconds));
  return totals;
}
