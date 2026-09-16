import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Play, Repeat, Square } from "lucide-react";
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

/** One task on the board — a dense cell (`rounded-lg`), never a pill; grab anywhere on it to drag. */
export function TaskCard({ task, onOpen, overlay = false }: TaskCardProps) {
  const { startTimer, stopTimer } = useTimer();
  const runningEntry = useTimerStore((s) => s.runningEntry);
  const running = runningEntry?.taskId === task.id;

  // role: "group" — the default "button" would nest inside the two real buttons below.
  const sortable = useSortable({
    id: task.id,
    disabled: overlay,
    attributes: { role: "group", roleDescription: "task card" },
  });
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
      // The whole card is the drag surface; the pointer sensor's activation distance still lets clicks through.
      {...(overlay ? {} : sortable.attributes)}
      {...(overlay ? {} : sortable.listeners)}
      aria-label={overlay ? undefined : `Move ${task.name}`}
      title={overlay ? undefined : "Drag, or press Space and use the arrow keys"}
      className={cn(
        "group flex flex-col gap-1.5 rounded-lg bg-background p-2.5",
        "transition-colors duration-fast ease-out-quart",
        !overlay && "cursor-grab touch-none active:cursor-grabbing",
        !overlay && "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        running && "bg-primary/5",
        // Stays in place as a hole while the overlay follows the pointer.
        !overlay && sortable.isDragging && "opacity-40",
        overlay && "shadow-lg"
      )}
    >
      <div className="flex items-start gap-1.5">
        {/* Same vocabulary as the list: tinted ring, only P1/P2 carry colour. */}
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
        <p className="line-clamp-1 text-micro text-muted-foreground" title={task.description}>
          {task.description}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {task.projectName && (
          <ProjectBadge name={task.projectName} color={task.projectColor} className="max-w-36" />
        )}
        {task.dueDate && (
          <span className={cn("text-xs", DUE_TONE_CLASS[tone ?? "later"])}>
            {formatDueDate(task.dueDate)}
          </span>
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
          <span className="ml-auto text-micro tabular-nums text-muted-foreground">
            {formatDurationShort(task.trackedSeconds)}
          </span>
        )}
      </div>
    </div>
  );
}
