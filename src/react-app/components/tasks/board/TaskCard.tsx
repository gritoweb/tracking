import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Play, Repeat, Square, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProjectBadge } from "@/components/ProjectBadge";
import { UserAvatar } from "@/components/layout/UserAvatar";
import { MultiSelect } from "@/components/reports/MultiSelect";
import { TaskStatusChip } from "../TaskStatusChip";
import { useTimer } from "@/hooks/useTimer";
import { useTimerStore } from "@/stores/timerStore";
import { useUpdateTask } from "@/hooks/useTasks";
import { useWorkspaceMembers } from "@/hooks/useWorkspaceRole";
import { formatDurationShort } from "@/lib/dateUtils";
import {
  PRIORITIES,
  PRIORITY_LABEL,
  PRIORITY_RING,
  dateToLocalDate,
  dueTone,
  formatDueDate,
  localDateToDate,
} from "@/lib/taskUtils";
import { describeRecurRule } from "@shared/task-recurrence";
import { descriptionToPlainText } from "@/lib/richText";
import { cn } from "@/lib/utils";
import type { Task } from "@shared/schemas";

const DUE_TONE_CLASS: Record<string, string> = {
  overdue: "text-destructive",
  today: "text-foreground",
  soon: "text-muted-foreground",
  later: "text-muted-foreground",
};

interface TaskCardProps {
  task: Task;
  onOpen: (task: Task) => void;
  /** Rendered inside the DragOverlay — no sortable wiring, no transform. */
  overlay?: boolean;
}

/** One task on the board — a dense cell (`rounded-lg`), never a pill; grab anywhere on it to drag. */
export function TaskCard({ task, onOpen, overlay = false }: TaskCardProps) {
  const { startTimer, stopTimer } = useTimer();
  const runningEntry = useTimerStore((s) => s.runningEntry);
  const running = runningEntry?.taskId === task.id;
  const updateTask = useUpdateTask();
  const { data: members = [], isPending: membersLoading } = useWorkspaceMembers(!overlay);
  const [dueOpen, setDueOpen] = useState(false);

  const saveAssignees = (assigneeIds: string[]) => {
    const optimisticAssignees = members
      .filter((m) => assigneeIds.includes(m.userId))
      .map((m) => ({ userId: m.userId, name: m.name, image: m.image }));
    updateTask.mutate({ id: task.id, data: { assigneeIds }, optimisticAssignees });
  };

  // role: "group" — the default "button" would nest inside the two real buttons below.
  const sortable = useSortable({
    id: task.id,
    disabled: overlay,
    attributes: { role: "group", roleDescription: "task card" },
  });
  const tone = dueTone(task.dueDate);
  const plainDescription = descriptionToPlainText(task.description);
  const repeats = task.recurRule ? describeRecurRule(task.recurRule) : null;
  const done = task.statusCategory === "completed";

  return (
    <div
      ref={overlay ? undefined : sortable.setNodeRef}
      style={
        overlay
          ? undefined
          : { transform: CSS.Translate.toString(sortable.transform), transition: sortable.transition }
      }
      // The whole card is the drag surface; the pointer sensor's activation distance still lets clicks through.
      {...(overlay ? {} : sortable.attributes)}
      {...(overlay ? {} : sortable.listeners)}
      aria-label={overlay ? undefined : `Move ${task.name}`}
      title={overlay ? undefined : "Drag, or press Space and use the arrow keys"}
      className={cn(
        "group flex flex-col gap-1.5 rounded-lg bg-popover p-2.5",
        "transition-colors duration-fast ease-out-quart",
        !overlay && "cursor-grab touch-none active:cursor-grabbing",
        !overlay && "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        running && "bg-primary/5",
        // Stays in place as a hole while the overlay follows the pointer.
        !overlay && sortable.isDragging && "opacity-40",
        // The overlay renders in a portal, outside the column's own width — without this it
        // sizes to its content instead of matching the card it was picked up from.
        overlay && "w-[272px] shadow-lg"
      )}
    >
      <div className="flex items-start gap-1.5">
        {/* Same vocabulary as the list: tinted ring, only P1/P2 carry colour. Clickable here — the
            board had no way to change priority except opening the sheet. */}
        {task.priority < 4 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                title={`Priority: ${PRIORITY_LABEL[task.priority]} — change`}
                aria-label={`Priority ${PRIORITY_LABEL[task.priority]} — change`}
                className={cn(
                  "mt-1 h-2 w-2 shrink-0 rounded-full border-2 transition-transform duration-fast ease-out-quart hover:scale-125",
                  "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  PRIORITY_RING[task.priority]
                )}
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuRadioGroup
                value={String(task.priority)}
                onValueChange={(v) => updateTask.mutate({ id: task.id, data: { priority: Number(v) } })}
              >
                {PRIORITIES.map((p) => (
                  <DropdownMenuRadioItem key={p} value={String(p)}>
                    {PRIORITY_LABEL[p]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <button
          type="button"
          onClick={() => onOpen(task)}
          className={cn(
            "min-w-0 flex-1 text-left text-sm",
            "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 rounded",
            done && "text-muted-foreground line-through"
          )}
        >
          {task.name}
        </button>

        {running ? (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Stop timer for ${task.name}`}
            onClick={() => stopTimer()}
            className="shrink-0 text-primary"
          >
            <span className="relative flex items-center justify-center">
              <span className="absolute inline-flex h-4 w-4 animate-running-dot rounded-full bg-primary/25" aria-hidden />
              <Square className="relative h-3 w-3 fill-current" />
            </span>
          </Button>
        ) : (
          // Persistent, not hover-revealed — the primary action of the surface.
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Start timer for ${task.name}`}
            title="Start a timer on this task"
            disabled={done}
            onClick={() => startTimer({ description: task.name, projectId: task.projectId, taskId: task.id })}
            className="shrink-0 text-muted-foreground hover:text-primary"
          >
            <Play className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {task.description && (
        <p className="line-clamp-1 text-micro text-muted-foreground" title={plainDescription}>
          {plainDescription}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {!overlay && <TaskStatusChip task={task} className="px-1.5 py-0" />}
        {task.projectName && (
          <ProjectBadge name={task.projectName} color={task.projectColor} className="max-w-36" />
        )}
        {task.dueDate && (
          <Popover open={dueOpen} onOpenChange={setDueOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={`Due ${formatDueDate(task.dueDate)} — change`}
                className={cn(
                  "rounded px-1 text-xs transition-colors duration-fast ease-out-quart hover:bg-muted",
                  DUE_TONE_CLASS[tone ?? "later"]
                )}
              >
                {formatDueDate(task.dueDate)}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={localDateToDate(task.dueDate)}
                onSelect={(date) => {
                  updateTask.mutate({
                    id: task.id,
                    data: { dueDate: date ? dateToLocalDate(date) : null },
                  });
                  setDueOpen(false);
                }}
              />
              <div className="border-t p-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => {
                    updateTask.mutate({ id: task.id, data: { dueDate: null } });
                    setDueOpen(false);
                  }}
                >
                  Clear due date
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        )}
        {repeats && <Repeat className="h-3 w-3 text-muted-foreground" aria-label={repeats} />}
        {/* Subtasks ride their parent here — the board shows top-level work only. */}
        {task.subtaskTotal > 0 && (
          <span
            className="text-micro tabular-nums text-muted-foreground"
            title={`${task.subtaskDone} of ${task.subtaskTotal} subtasks done`}
          >
            {task.subtaskDone}/{task.subtaskTotal}
          </span>
        )}
        {task.trackedSeconds > 0 && (
          <span className={cn("text-micro tabular-nums text-muted-foreground", overlay && task.assignees.length === 0 && "ml-auto")}>
            {formatDurationShort(task.trackedSeconds)}
          </span>
        )}
        {!overlay && (
          <MultiSelect
            label="Assignees"
            closeOnSelect
            options={members.map((m) => ({ value: m.userId, label: m.name, image: m.image }))}
            value={task.assignees.map((a) => a.userId)}
            onChange={saveAssignees}
            loading={membersLoading}
            trigger={
              task.assignees.length > 0 ? (
                <button
                  type="button"
                  aria-label="Edit assignees"
                  className="ml-auto flex -space-x-1.5 rounded-full focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  {task.assignees.slice(0, 3).map((a) => (
                    <UserAvatar
                      key={a.userId}
                      name={a.name}
                      image={a.image}
                      className="h-5 w-5 border-2 border-background text-micro"
                    />
                  ))}
                </button>
              ) : (
                <button
                  type="button"
                  aria-label="Add assignee"
                  title="Add assignee"
                  className="tt-reveal ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-dashed border-muted-foreground/50 text-muted-foreground/50 hover:border-muted-foreground hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <UserPlus className="h-3 w-3" />
                </button>
              )
            }
          />
        )}
      </div>
    </div>
  );
}
