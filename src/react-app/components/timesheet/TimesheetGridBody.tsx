import { Plus, Copy, AlertTriangle, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ColorDot } from "@/components/ColorDot";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { formatDurationShort, formatTimeInput } from "@/lib/dateUtils";
import { cn } from "@/lib/utils";
import { weekGrid } from "@/lib/weekGridColumns";
import { WeekGrid } from "@/components/week-grid/WeekGrid";
import type { TimesheetCell, TimesheetRowMeta } from "@/lib/timesheetGrid";

export const TIMESHEET_LOCKED_HELP_ID = "timesheet-locked-cell-help";

interface EditingCell {
  row: string;
  day: number;
}

interface TimesheetGridBodyProps {
  days: Date[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  rows: TimesheetRowMeta[];
  cells: Map<string, TimesheetCell[]>;
  dayTotals: number[];
  grandTotal: number;
  editing: EditingCell | null;
  draft: string;
  onDraftChange: (value: string) => void;
  onStartEdit: (row: string, day: number, initialValue: string) => void;
  onCommitCell: (row: TimesheetRowMeta, day: number) => void;
  onCancelEdit: () => void;
  onAddRow: () => void;
  onCopyLastWeek: () => void;
  copying: boolean;
}

/** The grid table (loading/error/empty states, rows, footer) plus the row-action bar below it — pure view. */
export function TimesheetGridBody({
  days,
  isLoading,
  isError,
  onRetry,
  rows,
  cells,
  dayTotals,
  grandTotal,
  editing,
  draft,
  onDraftChange,
  onStartEdit,
  onCommitCell,
  onCancelEdit,
  onAddRow,
  onCopyLastWeek,
  copying,
}: TimesheetGridBodyProps) {
  return (
    <>
      <span id={TIMESHEET_LOCKED_HELP_ID} className="sr-only">
        This day has several entries — edit them in the list or calendar view.
      </span>
      {/* min-w forces a horizontal scroller instead of letting seven day columns
          squeeze below legibility; the Task/Project pair stays pinned so a
          narrow screen never loses track of which row it's scrolling. */}
      <WeekGrid>
        <WeekGrid.Header days={days} />
        <tbody>
          {isLoading ? (
            <tr>
              <td colSpan={10} className="py-16 text-center text-muted-foreground">
                <Spinner size="lg" className="mx-auto" />
              </td>
            </tr>
          ) : isError ? (
            <tr>
              <td colSpan={10} className="py-10">
                <EmptyState
                  icon={AlertTriangle}
                  title="Couldn't load this week"
                  description="The request didn't get through. Your tracked time is safe."
                  action={
                    <Button variant="outline" size="sm" onClick={onRetry}>
                      Try again
                    </Button>
                  }
                  className="py-0"
                />
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={10} className="py-10">
                <EmptyState
                  icon={Table2}
                  title="Nothing tracked this week"
                  description="Add a row to fill in hours by project and task, or copy last week's rows as a starting point."
                  action={
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={onAddRow}>
                        Add row
                      </Button>
                      <Button variant="ghost" size="sm" onClick={onCopyLastWeek} disabled={copying}>
                        Copy last week
                      </Button>
                    </div>
                  }
                  className="py-0"
                />
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const rowCells = cells.get(row.key)!;
              const rowTotal = rowCells.reduce((s, c) => s + c.seconds, 0);
              return (
                <WeekGrid.Row key={row.key}>
                  <WeekGrid.LabelCell variant="task">
                    <div className={weekGrid.innerTask} title={row.taskName ?? "No task"}>
                      {row.taskName ?? <span className="italic text-muted-foreground">No task</span>}
                    </div>
                  </WeekGrid.LabelCell>
                  <WeekGrid.LabelCell variant="project">
                    {/* A fixed-width block, not just `truncate`: a <td>'s width is
                        advisory in auto table layout, so the min-content of a long
                        consultancy project name still expanded the column and pushed
                        the day columns and Total off the pane (measured 1387px inside
                        1056px). Bounding the content is what actually caps it. */}
                    <span className={weekGrid.innerProject}>
                      <ColorDot color={row.projectColor} />
                      <span
                        title={row.projectName ?? "Without project"}
                        className={cn("truncate", !row.projectName && "text-muted-foreground")}
                      >
                        {row.projectName ?? "Without project"}
                      </span>
                    </span>
                  </WeekGrid.LabelCell>
                  {rowCells.map((cell, dayIndex) => {
                    const isEditing = editing?.row === row.key && editing?.day === dayIndex;
                    const multi = cell.entries.length > 1;
                    return (
                      <WeekGrid.DayCell key={dayIndex}>
                        {isEditing ? (
                          <Input
                            autoFocus
                            value={draft}
                            onChange={(e) => onDraftChange(e.target.value)}
                            onBlur={() => onCommitCell(row, dayIndex)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") onCommitCell(row, dayIndex);
                              if (e.key === "Escape") onCancelEdit();
                            }}
                            className="h-8 w-16 px-1 text-center text-xs tabular-nums"
                          />
                        ) : (
                          // Whole cell is the click target (opens the inline duration editor).
                          <button
                            type="button"
                            // aria-disabled rather than disabled: a `disabled`
                            // button leaves the tab order, which took its own
                            // explanation with it — the reason was in a `title`
                            // that no keyboard or screen-reader user could reach.
                            aria-disabled={multi || undefined}
                            aria-describedby={multi ? TIMESHEET_LOCKED_HELP_ID : undefined}
                            onClick={() => {
                              if (multi) return;
                              onStartEdit(row.key, dayIndex, formatTimeInput(cell.seconds || null));
                            }}
                            className={cn(
                              "mx-auto flex h-8 w-16 items-center justify-center rounded border text-xs tabular-nums transition-colors duration-fast ease-out-quart",
                              cell.seconds > 0
                                ? "border-border font-medium"
                                : "border-transparent text-muted-foreground/40 hover:border-border",
                              // Dashed means "empty, click to fill" everywhere
                              // else in the app (the assign-project chip, the
                              // calendar's ghost and gap blocks). Using it for
                              // "you can't" made one border mean two opposite
                              // things; locked reads as dimmed instead.
                              multi ? "cursor-not-allowed opacity-50" : "hover:bg-muted"
                            )}
                          >
                            {cell.seconds > 0 ? formatDurationShort(cell.seconds) : "–"}
                          </button>
                        )}
                      </WeekGrid.DayCell>
                    );
                  })}
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">
                    {rowTotal > 0 ? formatDurationShort(rowTotal) : "–"}
                  </td>
                </WeekGrid.Row>
              );
            })
          )}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr className="border-t-2 font-medium">
              <td className={weekGrid.footLabel} colSpan={2}>
                Total
              </td>
              {dayTotals.map((t, i) => (
                <td key={i} className="px-2 py-2 text-center tabular-nums">
                  {t > 0 ? formatDurationShort(t) : "–"}
                </td>
              ))}
              <td className="px-3 py-2 text-right tabular-nums">
                {grandTotal > 0 ? formatDurationShort(grandTotal) : "–"}
              </td>
            </tr>
          </tfoot>
        )}
      </WeekGrid>

      {/* The empty state owns the actions while the body is empty — rendering
          them here as well put the same labels twice on one screen, 84px
          apart, which reads as a rendering bug. One rule, four screens. */}
      {rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 p-3">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={onAddRow}>
            <Plus className="h-4 w-4" />
            Add row
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={onCopyLastWeek} disabled={copying}>
            {copying ? <Spinner /> : <Copy className="h-4 w-4" />}
            Copy last week
          </Button>
        </div>
      )}
    </>
  );
}
