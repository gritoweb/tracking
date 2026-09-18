import * as React from "react";
import { format } from "date-fns";

import { cn } from "@/lib/utils";
import { weekGrid } from "@/lib/weekGridColumns";

type WeekGridProps = React.ComponentProps<"table">;

/** Shared table skeleton for Timesheet and Planner — see WeekGrid.Header/Row/LabelCell/DayCell. */
export function WeekGrid({ className, ...props }: WeekGridProps) {
  return <table className={cn(weekGrid.table, className)} {...props} />;
}

interface WeekGridHeaderProps {
  days: Date[];
  taskLabel?: React.ReactNode;
  projectLabel?: React.ReactNode;
  totalLabel?: React.ReactNode;
}

export function WeekGridHeader({
  days,
  taskLabel = "Task",
  projectLabel = "Project",
  totalLabel = "Total",
}: WeekGridHeaderProps) {
  return (
    <thead className="sticky top-0 z-overlay bg-background">
      <tr className="border-b text-xs text-muted-foreground">
        <th className={weekGrid.headTask}>{taskLabel}</th>
        <th className={weekGrid.headProject}>{projectLabel}</th>
        {days.map((d, i) => (
          <th key={i} className="px-2 py-2 text-center font-medium">
            <div className="uppercase">{format(d, "EEE")}</div>
            <div className="text-micro text-muted-foreground">{format(d, "MMM d")}</div>
          </th>
        ))}
        <th className="px-3 py-2 text-right font-medium">{totalLabel}</th>
      </tr>
    </thead>
  );
}

export function WeekGridRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      className={cn(
        "group/row border-b border-border-strong transition-colors duration-fast ease-out-quart hover:bg-muted/30",
        className
      )}
      {...props}
    />
  );
}

interface WeekGridLabelCellProps extends React.ComponentProps<"td"> {
  variant: "task" | "project";
}

export function WeekGridLabelCell({ variant, className, ...props }: WeekGridLabelCellProps) {
  return (
    <td
      className={cn(variant === "task" ? weekGrid.cellTask : weekGrid.cellProject, className)}
      {...props}
    />
  );
}

export function WeekGridDayCell({ className, ...props }: React.ComponentProps<"td">) {
  return <td className={cn("px-1 py-1 text-center", className)} {...props} />;
}

// Dot-notation on top of the plain exports above, assigned (not re-exported) so react-refresh stays quiet.
WeekGrid.Header = WeekGridHeader;
WeekGrid.Row = WeekGridRow;
WeekGrid.LabelCell = WeekGridLabelCell;
WeekGrid.DayCell = WeekGridDayCell;
