import { CalendarDays, CircleDot, Flag, FolderOpen, Hourglass, Play, Square, Timer as TimerIcon, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProjectPicker } from "@/components/pickers/ProjectPicker";
import { MultiSelect } from "@/components/pickers/MultiSelect";
import { AvatarStack } from "@/components/ui/avatar";
import { ColorDot } from "@/components/ColorDot";
import { FieldRow } from "@/components/FieldRow";
import { TaskStatusChip } from "./TaskStatusChip";
import type { WorkspaceMember } from "@/hooks/useWorkspaceRole";
import { formatDurationShort } from "@/lib/dateUtils";
import { TASK_TIMER_ENABLED } from "@/lib/features";
import { PRIORITIES, PRIORITY_LABEL, PRIORITY_RING, dateToLocalDate, formatDueDate, localDateToDate } from "@/lib/taskUtils";
import { cn } from "@/lib/utils";
import type { Task } from "@shared/schemas";

interface TaskPropertiesProps {
  task: Task;
  isSubtask: boolean;
  members: WorkspaceMember[];
  membersLoading: boolean;
  dueOpen: boolean;
  onDueOpenChange: (open: boolean) => void;
  estimate: string;
  onEstimateChange: (value: string) => void;
  onSaveEstimate: () => void;
  running: boolean;
  onToggleTimer: () => void;
  onChangeProject: (projectId: string) => void;
  onChangeAssignees: (assigneeIds: string[]) => void;
  onChangeDueDate: (dueDate: string | null) => void;
  onChangePriority: (priority: number) => void;
}

/** The field-row block of the task detail sheet — pure view, every change flows back through a callback. */
export function TaskProperties({
  task,
  isSubtask,
  members,
  membersLoading,
  dueOpen,
  onDueOpenChange,
  estimate,
  onEstimateChange,
  onSaveEstimate,
  running,
  onToggleTimer,
  onChangeProject,
  onChangeAssignees,
  onChangeDueDate,
  onChangePriority,
}: TaskPropertiesProps) {
  return (
    // Sized by its own width, not the viewport: two fields per line in the modal, one per line in the sidebar.
    <div className="@container">
      <div className="grid grid-cols-1 gap-x-8 @xl:grid-cols-2">
        {!isSubtask && (
          <FieldRow icon={<FolderOpen className="h-3.5 w-3.5" />} label="Project">
            {/* Same lean button molecule as every other field row's trigger — the
                picker's own search-and-create panel (Popover + Command) is unchanged,
                only its default `Button` trigger (fixed height, press-scale, its own
                chrome) is swapped for one that actually matches its neighbours. */}
            <ProjectPicker value={task.projectId} onChange={(projectId) => projectId && onChangeProject(projectId)}>
              <button
                type="button"
                aria-label={task.projectName ? `Project: ${task.projectName}` : "Select project"}
                className="flex max-w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-sm transition-colors duration-fast ease-out-quart hover:bg-accent"
              >
                {task.projectName ? (
                  <>
                    <ColorDot color={task.projectColor} />
                    <span className="min-w-0 max-w-30 truncate">{task.projectName}</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">Select project</span>
                )}
              </button>
            </ProjectPicker>
          </FieldRow>
        )}

        <FieldRow icon={<CircleDot className="h-3.5 w-3.5" />} label="Status">
          {/* The list/board keep the pill (`tt-swatch-tint` is already the base class,
              `rounded` here just overrides its `rounded-full` to match every other
              field row on this panel — no pill shape isolated in the middle of plain ones). */}
          <TaskStatusChip task={task} className="rounded-md px-1.5 py-1" />
        </FieldRow>

        <FieldRow icon={<Users className="h-3.5 w-3.5" />} label="Assignees">
          <MultiSelect
            label="Assignees"
            closeOnSelect
            options={members.map((m) => ({ value: m.userId, label: m.name, image: m.image }))}
            value={task.assignees.map((a) => a.userId)}
            onChange={onChangeAssignees}
            loading={membersLoading}
            trigger={
              <button
                type="button"
                aria-label={task.assignees.length ? "Edit assignees" : "Add assignee"}
                className="flex max-w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm transition-colors duration-fast ease-out-quart hover:bg-accent"
              >
                {task.assignees.length > 0 ? (
                  <>
                    <AvatarStack members={task.assignees.map((a) => ({ id: a.userId, name: a.name, image: a.image }))} max={3} size="xs" />
                    <span className="min-w-0 flex-1 truncate">
                      {task.assignees.map((a) => a.name).join(", ")}
                    </span>
                  </>
                ) : (
                  <span className="text-muted-foreground">Add assignee</span>
                )}
              </button>
            }
          />
        </FieldRow>

        <FieldRow icon={<CalendarDays className="h-3.5 w-3.5" />} label="Due date">
          <Popover open={dueOpen} onOpenChange={onDueOpenChange}>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={task.dueDate ? `Due ${formatDueDate(task.dueDate)} — change` : "Set due date"}
                className={cn(
                  "flex max-w-full items-center rounded-md px-1.5 py-1 text-sm transition-colors duration-fast ease-out-quart hover:bg-accent",
                  !task.dueDate && "text-muted-foreground"
                )}
              >
                {task.dueDate ? formatDueDate(task.dueDate) : "Set due date"}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={task.dueDate ? localDateToDate(task.dueDate) : undefined}
                onSelect={(d) => {
                  onChangeDueDate(d ? dateToLocalDate(d) : null);
                  onDueOpenChange(false);
                }}
              />
              {task.dueDate && (
                <div className="border-t p-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => {
                      onChangeDueDate(null);
                      onDueOpenChange(false);
                    }}
                  >
                    Clear due date
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>
        </FieldRow>

        <FieldRow icon={<Flag className="h-3.5 w-3.5" />} label="Priority">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`Priority: ${PRIORITY_LABEL[task.priority]} — change`}
                className="flex max-w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-sm transition-colors duration-fast ease-out-quart hover:bg-accent"
              >
                <span className={cn("h-2 w-2 shrink-0 rounded-full border-2", PRIORITY_RING[task.priority])} />
                {PRIORITY_LABEL[task.priority]}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuRadioGroup value={String(task.priority)} onValueChange={(v) => onChangePriority(Number(v))}>
                {PRIORITIES.map((p) => (
                  <DropdownMenuRadioItem key={p} value={String(p)}>
                    {PRIORITY_LABEL[p]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </FieldRow>

        <FieldRow icon={<Hourglass className="h-3.5 w-3.5" />} label="Estimate" htmlFor="task-sheet-estimate">
          <Input
            id="task-sheet-estimate"
            value={estimate}
            onChange={(e) => onEstimateChange(e.target.value)}
            onBlur={onSaveEstimate}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            placeholder="e.g. 1h 30m"
            className="h-auto w-32 rounded-md border-transparent bg-transparent px-1.5 py-1 hover:bg-accent dark:bg-transparent dark:hover:bg-accent focus-visible:border-transparent focus-visible:ring-0"
          />
        </FieldRow>

        {/* Read-only: the total logged against this task (subtasks included); edited only by logging time. */}
        <FieldRow icon={<TimerIcon className="h-3.5 w-3.5" />} label="Time tracked">
          <div className="flex items-center gap-1.5">
            <span className="text-sm tabular-nums">{formatDurationShort(task.trackedSeconds)}</span>
            {/* Task timer hidden: no use for this feature at the moment (TASK_TIMER_ENABLED in lib/features.ts). */}
            {TASK_TIMER_ENABLED && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={running ? "Stop timer" : "Start timer on this task"}
                onClick={onToggleTimer}
                className={running ? "text-primary" : "text-muted-foreground hover:text-primary"}
              >
                {running ? <Square className="h-3.5 w-3.5 fill-current" /> : <Play className="h-3.5 w-3.5" />}
              </Button>
            )}
          </div>
        </FieldRow>
      </div>
    </div>
  );
}
