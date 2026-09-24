import { CalendarDays, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ProjectBadge } from "@/components/ProjectBadge";
import { AssignButton } from "@/components/ui/assign-button";
import { SlotButton } from "@/components/ui/slot-button";
import { AvatarStack } from "@/components/ui/avatar";
import { MultiSelect } from "@/components/pickers/MultiSelect";
import { TaskStatusChip } from "./TaskStatusChip";
import { dateToLocalDate, formatDueDate, localDateToDate } from "@/lib/taskUtils";
import { cn } from "@/lib/utils";
import type { Task } from "@shared/schemas";
import type { WorkspaceMember } from "@/hooks/useWorkspaceRole";

const DUE_TONE_CLASS: Record<string, string> = {
  overdue: "text-destructive",
  today: "text-foreground",
  soon: "text-muted-foreground",
  later: "text-muted-foreground",
};

interface TaskRowMetaProps {
  task: Task;
  nested: boolean;
  showStatus: boolean;
  showProject: boolean;
  hasChildren: boolean;
  repeats: string | null;
  tone: string | null;
  dueOpen: boolean;
  onDueOpenChange: (open: boolean) => void;
  onChangeDueDate: (date: string | null) => void;
  members: WorkspaceMember[];
  membersLoading: boolean;
  onChangeAssignees: (assigneeIds: string[]) => void;
}

/** Subtask count, repeat icon, due chip, status/project chips, assignees — pure view, no mutations. */
export function TaskRowMeta({
  task,
  nested,
  showStatus,
  showProject,
  hasChildren,
  repeats,
  tone,
  dueOpen,
  onDueOpenChange,
  onChangeDueDate,
  members,
  membersLoading,
  onChangeAssignees,
}: TaskRowMetaProps) {
  return (
    <>
      {hasChildren && !nested && (
        <span
          className="shrink-0 text-micro tabular-nums text-muted-foreground"
          title={`${task.subtaskDone} of ${task.subtaskTotal} subtasks done`}
        >
          {task.subtaskDone}/{task.subtaskTotal}
        </span>
      )}

      {repeats && <Repeat className="h-3 w-3 shrink-0 text-muted-foreground" aria-label={repeats} />}

      {/* The due chip is the control, not a label beside one — clicking the date
          is how you change the date. */}
      <Popover open={dueOpen} onOpenChange={onDueOpenChange}>
        <PopoverTrigger asChild>
          {task.dueDate ? (
            <button
              aria-label={`Due ${formatDueDate(task.dueDate)} — change`}
              className={cn(
                "shrink-0 rounded px-1 text-xs transition-colors duration-fast ease-out-quart hover:bg-muted",
                DUE_TONE_CLASS[tone ?? "later"]
              )}
            >
              {formatDueDate(task.dueDate)}
            </button>
          ) : (
            // Empty, it's the same dashed slot as the assignee beside it.
            <SlotButton className="shrink-0" aria-label="Set due date">
              <CalendarDays />
            </SlotButton>
          )}
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="single"
            selected={task.dueDate ? localDateToDate(task.dueDate) : undefined}
            onSelect={(date) => {
              onChangeDueDate(date ? dateToLocalDate(date) : null);
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

      {/* A subtask always follows its parent's column, so its own is never shown. */}
      {showStatus && !nested && <TaskStatusChip task={task} />}

      {showProject && !nested && task.projectName && (
        <ProjectBadge name={task.projectName} color={task.projectColor} />
      )}

      <MultiSelect
        label="Assignees"
        closeOnSelect
        options={members.map((m) => ({ value: m.userId, label: m.name, image: m.image }))}
        value={task.assignees.map((a) => a.userId)}
        onChange={onChangeAssignees}
        loading={membersLoading}
        trigger={
          task.assignees.length > 0 ? (
            // Raw: MultiSelect's custom trigger, wrapping the avatar stack
            <button
              type="button"
              aria-label="Edit assignees"
              title={task.assignees.map((a) => a.name).join(", ")}
              className="shrink-0 rounded-full focus-ring"
            >
              <AvatarStack members={task.assignees.map((a) => ({ id: a.userId, name: a.name, image: a.image }))} max={3} size="xs" />
            </button>
          ) : (
            <AssignButton className="shrink-0" />
          )
        }
      />
    </>
  );
}
