import { MoreHorizontal, Edit2, Archive, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ColorDot } from "@/components/ColorDot";
import { SpentFigure } from "@/components/ui/spent-figure";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TaskList } from "./TaskList";
import { pacingLabel, pacingToneClass } from "@/lib/pacing";
import { formatDurationShort, formatPlainDate } from "@/lib/dateUtils";
import { formatCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";
import type { Project, ProjectPacing } from "@shared/schemas";

interface ProjectListRowProps {
  project: Project;
  pacing: ProjectPacing | undefined;
  period: string;
  periodLabel: string;
  currency: string;
  canManage: boolean;
  isExpanded: boolean;
  onToggleExpanded: () => void;
  onEdit: () => void;
  onArchiveToggle: () => void;
}

export function ProjectListRow({
  project,
  pacing,
  period,
  periodLabel,
  currency,
  canManage,
  isExpanded,
  onToggleExpanded,
  onEdit,
  onArchiveToggle,
}: ProjectListRowProps) {
  // budgetSeconds, not trackedSeconds: the bar is cumulative against the estimate
  // and must not follow the period control, or `11h / 40h` becomes a sentence
  // whose two halves cover different spans.
  const budgetPercent =
    project.estimatedHours && project.budgetSeconds !== undefined
      ? Math.min(100, Math.round((project.budgetSeconds / (project.estimatedHours * 3600)) * 100))
      : null;
  const paceLabel = pacing ? pacingLabel(pacing) : null;
  const progressTone =
    budgetPercent === null
      ? "default"
      : budgetPercent >= 100
        ? "destructive"
        : budgetPercent >= 80
          ? "warning"
          : "default";

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggleExpanded}>
      <div className="rounded-lg bg-card">
        <div className="flex items-center gap-3 px-4 py-3">
          <ColorDot color={project.color} className="h-3 w-3" />
          <div className="min-w-0 flex-1">
            {/* Wrapping, with the name claiming a whole line below sm. The row
                used to be a nowrap flex where the badges couldn't shrink, so a
                name long enough to need two lines broke *around* the badge —
                four of five rows on a 390px screen rendered as a ragged L,
                with the rate outranking the thing it describes. The
                identifier gets the line; the rate is a detail and can sit
                beneath it. */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span
                className={cn(
                  "min-w-0 max-w-full basis-full truncate text-sm font-medium sm:basis-auto",
                  !project.active && "text-muted-foreground line-through"
                )}
              >
                {project.name}
              </span>
              {!project.active && (
                <Badge variant="outline" className="text-xs">Archived</Badge>
              )}
              {project.billable && (
                <Badge variant="secondary" className="text-xs">
                  Billable{project.rate ? ` ${formatCurrency(project.rate, currency)}/h` : ""}
                </Badge>
              )}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {project.clientName && <span>{project.clientName}</span>}
              {project.trackedSeconds > 0 && (
                <span>
                  {formatDurationShort(project.trackedSeconds)} tracked
                  {period !== "all" && (
                    <span className="text-muted-foreground/80"> {periodLabel.toLowerCase()}</span>
                  )}
                </span>
              )}
              {/* A project with time in it, but none inside the chosen window,
                  said nothing at all — indistinguishable from a project
                  nobody has ever touched. */}
              {project.trackedSeconds === 0 && project.budgetSeconds > 0 && (
                <span>Nothing tracked {periodLabel.toLowerCase()}</span>
              )}
              {project.endDate && <span>Due {formatPlainDate(project.endDate)}</span>}
            </div>
            {/* Budget progress bar */}
            {budgetPercent !== null && (
              <div className="mt-1.5 flex items-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Progress
                      value={budgetPercent}
                      tone={progressTone}
                      aria-label={`${Math.round(budgetPercent)}% of budget used, all time`}
                      className="h-1.5 flex-1"
                    />
                  </TooltipTrigger>
                  <TooltipContent>
                    {Math.round(budgetPercent)}% of budget used — all time
                  </TooltipContent>
                </Tooltip>
                <SpentFigure
                  spent={formatDurationShort(project.budgetSeconds)}
                  of={`${project.estimatedHours}h${period !== "all" ? " all time" : ""}`}
                />
              </div>
            )}
            {/* The percentage says where the project is; this says where it's
                going. Only rendered when there's something specific to report
                — a dormant project isn't "on pace" for anything, and
                inventing a verdict for it would cry wolf. */}
            {paceLabel && pacing && (
              <div className={cn("mt-1 text-micro font-medium", pacingToneClass(pacing.status))}>
                {paceLabel}
              </div>
            )}
          </div>

          {/* Tasks toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground"
                  aria-label={isExpanded ? "Hide tasks" : "Show tasks"}
                >
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 transition-transform duration-fast ease-out-quart",
                      isExpanded && "rotate-180"
                    )}
                  />
                </Button>
              </CollapsibleTrigger>
            </TooltipTrigger>
            <TooltipContent>{isExpanded ? "Hide tasks" : "Show tasks"}</TooltipContent>
          </Tooltip>

          {canManage && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Project actions">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onEdit}>
                  <Edit2 className="mr-2 h-3.5 w-3.5" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onArchiveToggle}>
                  <Archive className="mr-2 h-3.5 w-3.5" />
                  {project.active ? "Archive" : "Unarchive"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Tasks section */}
        <CollapsibleContent>
          <div className="border-t px-4 pb-3">
            <TaskList projectId={project.id} />
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
