import type { ReactNode } from "react";
import { AlertTriangle, CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ColorDot } from "@/components/ColorDot";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { formatDurationShort, formatTimeInput } from "@/lib/dateUtils";
import { cn } from "@/lib/utils";
import { weekGrid } from "@/lib/weekGridColumns";
import { WeekGrid } from "@/components/week-grid/WeekGrid";
import { PlanPair } from "./PlanPair";
import type { PlanCell, PlannerRowMeta } from "./plannerTypes";

export const PLANNER_LOCKED_HELP_ID = "planner-locked-cell-help";

interface EditingCell {
  row: string;
  day: number;
}

interface PlannerGridProps {
  days: Date[];
  rows: PlannerRowMeta[];
  cells: Map<string, PlanCell[]>;
  dayTotals: PlanCell[];
  grandTotal: PlanCell;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  emptyStateActions: ReactNode;
  editing: EditingCell | null;
  draft: string;
  onDraftChange: (value: string) => void;
  onStartEdit: (row: PlannerRowMeta, dayIndex: number) => void;
  onCommitCell: (row: PlannerRowMeta, dayIndex: number) => void;
  onCancelEdit: () => void;
}

/** Pure view for the Planner's project/task × day grid — data and edit state come from the controller. */
export function PlannerGrid({
  days,
  rows,
  cells,
  dayTotals,
  grandTotal,
  isLoading,
  isError,
  onRetry,
  emptyStateActions,
  editing,
  draft,
  onDraftChange,
  onStartEdit,
  onCommitCell,
  onCancelEdit,
}: PlannerGridProps) {
  return (
    <>
      <span id={PLANNER_LOCKED_HELP_ID} className="sr-only">
        Assign a project to this row before planning hours against it.
      </span>
      <WeekGrid>
        <WeekGrid.Header
          days={days}
          projectLabel={
            // The cells stack two numbers and the only thing naming them was
            // the totals row, at the far bottom-left of a scrolling grid. A
            // reader meeting the Planner for the first time met the stack
            // before the legend.
            <span className="flex flex-col leading-tight">
              <span>Project</span>
              <span className="text-micro font-normal text-muted-foreground/80">planned / tracked</span>
            </span>
          }
        />
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
                  title="Couldn't load this week's plan"
                  description="The request didn't get through. Your plan is safe."
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
                  icon={CalendarRange}
                  title="No plan for this week"
                  description="Add a row to plan hours by project and day, copy last week's plan, or import allocations from a CSV."
                  action={<div className="flex items-center gap-2">{emptyStateActions}</div>}
                  className="py-0"
                />
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const rowCells = cells.get(row.key)!;
              const rowTotal = rowCells.reduce(
                (acc, c) => ({ planned: acc.planned + c.planned, actual: acc.actual + c.actual }),
                { planned: 0, actual: 0 }
              );
              const plannable = row.projectId !== null;
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
                            className="h-11 w-16 px-1 text-center text-xs tabular-nums"
                          />
                        ) : (
                          // Whole cell is the click target (opens the inline duration editor).
                          <button
                            type="button"
                            // See the timesheet's matching cell: aria-disabled
                            // keeps the control reachable so its explanation is
                            // actually announced.
                            aria-disabled={!plannable || undefined}
                            aria-describedby={!plannable ? PLANNER_LOCKED_HELP_ID : undefined}
                            title={
                              plannable && (cell.planned > 0 || cell.actual > 0)
                                ? `Planned ${formatDurationShort(cell.planned)} · Tracked ${formatDurationShort(cell.actual)}`
                                : undefined
                            }
                            onClick={() => {
                              if (!plannable) return;
                              onDraftChange(formatTimeInput(cell.planned || null));
                              onStartEdit(row, dayIndex);
                            }}
                            className={cn(
                              "mx-auto flex h-11 w-16 items-center justify-center rounded border text-xs transition-colors duration-fast ease-out-quart",
                              cell.planned > 0
                                ? "border-border"
                                : "border-transparent text-muted-foreground/40 hover:border-border",
                              // Dashed is reserved for "empty, click to fill".
                              plannable ? "hover:bg-muted" : "cursor-not-allowed opacity-50"
                            )}
                          >
                            <PlanPair cell={cell} />
                          </button>
                        )}
                      </WeekGrid.DayCell>
                    );
                  })}
                  <td className="px-3 py-2 text-right text-xs">
                    <PlanPair cell={rowTotal} alignRight strong />
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
                <span className="flex flex-col leading-tight">
                  <span>Planned</span>
                  <span className="text-micro">Tracked</span>
                </span>
              </td>
              {dayTotals.map((t, i) => (
                <td key={i} className="px-2 py-2 text-center text-xs">
                  <PlanPair cell={t} />
                </td>
              ))}
              <td className="px-3 py-2 text-right text-xs">
                <PlanPair cell={grandTotal} alignRight strong />
              </td>
            </tr>
          </tfoot>
        )}
      </WeekGrid>
    </>
  );
}
