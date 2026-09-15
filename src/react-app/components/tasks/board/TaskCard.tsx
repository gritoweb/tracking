import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Play, Repeat, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProjectBadge } from "@/components/ProjectBadge";
import { useTimer } from "@/hooks/useTimer";
import { useTimerStore } from "@/stores/timerStore";
import { formatDurationShort } from "@/lib/dateUtils";
import { PRIORITY_LABEL, PRIORITY_RING, dueTone, formatDueDate } from "@/lib/taskUtils";
import { describeRecurRule } from "@shared/task-recurrence";
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

/**
 * One task on the board.
 *
 * A card is a **dense data cell**, not a container: `rounded-lg`, per the
 * Geometry Rule (DESIGN.md §5). A column of twenty pills would trade scanning a
 * sprint for a look. The status colour lives on the column header alone — the
 * card repeating it would paint the same fact twenty times and spend the One
 * Accent Rule on a thing the column already says.
 *
 * The drag handle is explicit rather than "the whole card is draggable": the
 * card is also a click target (it opens the editor) and a host for the Start
 * button, and a card that moves when you meant to press play is the failure that
 * makes people stop trusting the board.
 */
export function TaskCard({ task, onOpen, overlay = false }: TaskCardProps) {
  const { startTimer, stopTimer } = useTimer();
  const runningEntry = useTimerStore((s) => s.runningEntry);
  const running = runningEntry?.taskId === task.id;

  const sortable = useSortable({ id: task.id, disabled: overlay });
  const tone = dueTone(task.dueDate);
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
      className={cn(
        "group flex flex-col gap-1.5 rounded-lg bg-background p-2.5",
        "transition-colors duration-fast ease-out-quart",
        running && "bg-primary/5",
        // The original stays in place as a hole while the overlay follows the
        // pointer: hiding it entirely makes the list collapse and re-expand under
        // the cursor, so the drop target moves while you are aiming at it.
        !overlay && sortable.isDragging && "opacity-40",
        overlay && "shadow-lg"
      )}
    >
      <div className="flex items-start gap-1.5">
        {!overlay && (
          <button
            type="button"
            {...sortable.attributes}
            {...sortable.listeners}
            aria-label={`Move ${task.name}`}
            title="Drag, or press Space and use the arrow keys"
            className={cn(
              "-ml-1 mt-0.5 shrink-0 cursor-grab touch-none rounded text-muted-foreground/40",
              "transition-colors duration-fast ease-out-quart hover:text-muted-foreground",
              "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            )}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}

        {/* Priority keeps the same vocabulary as the list: a tinted ring at the
            row's leading edge, and only P1/P2 carry colour. */}
        {task.priority < 4 && (
          <span
            title={`Priority: ${PRIORITY_LABEL[task.priority]}`}
            aria-label={`Priority ${PRIORITY_LABEL[task.priority]}`}
            className={cn("mt-1 h-2 w-2 shrink-0 rounded-full border-2", PRIORITY_RING[task.priority])}
          />
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
          // Persistent, not hover-revealed: starting a timer on a task is the
          // primary action of this whole surface (TaskRow makes the same call).
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
        <p className="line-clamp-1 pl-4 text-micro text-muted-foreground" title={task.description}>
          {task.description}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-4">
        {task.projectName && (
          <ProjectBadge name={task.projectName} color={task.projectColor} className="max-w-36" />
        )}
        {task.dueDate && (
          <span className={cn("text-xs", DUE_TONE_CLASS[tone ?? "later"])}>
            {formatDueDate(task.dueDate)}
          </span>
        )}
        {repeats && <Repeat className="h-3 w-3 text-muted-foreground" aria-label={repeats} />}
        {/* Subtasks ride their parent here. The board shows top-level work only —
            thirty cards where twenty are checklist items is a list, not a board. */}
        {task.subtaskTotal > 0 && (
          <span
            className="text-micro tabular-nums text-muted-foreground"
            title={`${task.subtaskDone} of ${task.subtaskTotal} subtasks done`}
          >
            {task.subtaskDone}/{task.subtaskTotal}
          </span>
        )}
        {task.trackedSeconds > 0 && (
          <span className="ml-auto text-micro tabular-nums text-muted-foreground">
            {formatDurationShort(task.trackedSeconds)}
          </span>
        )}
      </div>
    </div>
  );
}
