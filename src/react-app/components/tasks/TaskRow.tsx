import { useState } from "react";
import { ChevronRight, Pencil, Play, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { TaskRowIdentity } from "./TaskRowIdentity";
import { TaskRowMeta } from "./TaskRowMeta";
import { TaskRowActions } from "./TaskRowActions";
import { useUpdateTask, useCompleteTask } from "@/hooks/useTasks";
import { useWorkspaceMembers } from "@/hooks/useWorkspaceRole";
import { useTimer } from "@/hooks/useTimer";
import { useTimerStore } from "@/stores/timerStore";
import { useUIStore } from "@/stores/uiStore";
import { formatSeconds, parseTimeInput, formatTimeInput } from "@/lib/dateUtils";
import { dueTone, PRIORITY_LABEL } from "@/lib/taskUtils";
import { describeRecurRule } from "@shared/task-recurrence";
import { cn } from "@/lib/utils";
import type { Task } from "@shared/schemas";

// Priority 1/2 borrow the destructive/warning checkbox tones; 3/4 stay the neutral default.
const PRIORITY_TONE: Record<number, "destructive" | "warning" | "default"> = {
  1: "destructive",
  2: "warning",
  3: "default",
  4: "default",
};

interface TaskRowProps {
  task: Task;
  /** Show the project pill on the row (hidden when the list is grouped by project). */
  showProject?: boolean;
  /** Show the status chip (hidden when the list is already grouped by status). */
  showStatus?: boolean;
  /** Rendered as a subtask: indented, no project pill, no nesting affordances. */
  nested?: boolean;
  /** Compact single-line form for the Timer rail. */
  dense?: boolean;
  expanded?: boolean;
  onToggleExpanded?: () => void;
  onRequestDelete: (task: Task) => void;
  /** Open the full task form (notes, estimate, due date, priority, repeat). */
  onEdit?: (task: Task) => void;
  /** Open the "log time to task" sheet; the list owns the sheet instance. */
  onLogTime: (task: Task) => void;
  onAddSubtask?: (task: Task) => void;
  /**
   * Wired by the list when rows are reorderable; absent means drag is off.
   *
   * Deliberately **cannot carry `className`**: spreading a handler bag that
   * includes one after the row's own `className` prop silently replaces it — an
   * `undefined` in the bag stripped every layout class off the row and collapsed
   * the whole list into a single column. The visual drag state travels as
   * `dragging` instead, and gets merged.
   */
  dragHandlers?: Omit<React.HTMLAttributes<HTMLDivElement>, "className"> & {
    draggable?: boolean;
  };
  dragging?: boolean;
}

// Self-contained task row: done toggle, inline-edit name, click-to-edit estimate
// with a tracked/estimate progress bar, and — the point of the whole surface —
// a one-click start control that turns the task into a running timer.
//
// Controller: owns hooks/mutations/state; TaskRowIdentity/Meta/Actions are pure views.
export function TaskRow({
  task,
  showProject = true,
  showStatus = true,
  nested = false,
  dense = false,
  expanded = false,
  onToggleExpanded,
  onRequestDelete,
  onEdit,
  onLogTime,
  onAddSubtask,
  dragHandlers,
  dragging = false,
}: TaskRowProps) {
  const updateTask = useUpdateTask();
  const { data: members = [], isPending: membersLoading } = useWorkspaceMembers(true);
  const completeTask = useCompleteTask();
  const { startTimer, stopTimer } = useTimer();
  const runningEntry = useTimerStore((s) => s.runningEntry);
  const elapsed = useTimerStore((s) => s.elapsed);
  const openTaskLogTime = useUIStore((s) => s.openTaskLogTime);

  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(task.name);
  const [editingTime, setEditingTime] = useState(false);
  const [estimate, setEstimate] = useState("");
  const [dueOpen, setDueOpen] = useState(false);

  const running = runningEntry?.taskId === task.id;

  const saveAssignees = (assigneeIds: string[]) => {
    const optimisticAssignees = members
      .filter((m) => assigneeIds.includes(m.userId))
      .map((m) => ({ userId: m.userId, name: m.name, image: m.image }));
    updateTask.mutate({ id: task.id, data: { assigneeIds }, optimisticAssignees });
  };

  const saveName = () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== task.name) updateTask.mutate({ id: task.id, data: { name: trimmed } });
    else setName(task.name);
    setEditingName(false);
  };

  const startEditTime = () => {
    setEstimate(formatTimeInput(task.estimatedSeconds));
    setEditingTime(true);
  };

  const saveEstimate = () => {
    const trimmed = estimate.trim();
    if (trimmed === "") {
      updateTask.mutate({ id: task.id, data: { estimatedSeconds: null } });
    } else {
      const parsed = parseTimeInput(trimmed);
      if (parsed !== null) updateTask.mutate({ id: task.id, data: { estimatedSeconds: parsed } });
    }
    setEditingTime(false);
  };

  const progress = task.estimatedSeconds
    ? Math.min(100, Math.round((task.trackedSeconds / task.estimatedSeconds) * 100))
    : null;

  const tone = dueTone(task.dueDate);
  const repeats = describeRecurRule(task.recurRule);
  const hasChildren = task.subtaskTotal > 0;

  /**
   * The start control is **persistent**, not revealed on hover.
   *
   * It is the primary action of this entire surface — the fastest path from a
   * plan to tracked time — and a primary action you have to find by hovering is
   * not one. It stays a muted ghost until hover (DESIGN.md's One Accent Rule:
   * the brand red belongs to the running timer and nothing else on the list), and
   * becomes a Stop disc with the running-dot treatment on the one row that is
   * actually running.
   */
  const startControl = running ? (
    <Button
      variant="ghost"
      size={dense ? "icon-xs" : "icon-sm"}
      aria-label={`Stop timer for ${task.name}`}
      title={`Stop — ${formatSeconds(elapsed)}`}
      onClick={stopTimer}
      className="shrink-0 text-primary hover:text-primary"
    >
      <span className="relative flex items-center justify-center">
        <span className="absolute inline-flex h-4 w-4 animate-running-dot rounded-full bg-primary/25" aria-hidden />
        <Square className="relative h-3 w-3 fill-current" />
      </span>
    </Button>
  ) : (
    <Button
      variant="ghost"
      size={dense ? "icon-xs" : "icon-sm"}
      aria-label={`Start timer for ${task.name}`}
      title="Start a timer on this task"
      disabled={!task.active}
      onClick={() =>
        startTimer({
          description: task.name,
          projectId: task.projectId,
          taskId: task.id,
        })
      }
      className="shrink-0 text-muted-foreground hover:text-primary"
    >
      <Play className="h-3.5 w-3.5" />
    </Button>
  );

  const doneToggle = (
    <Checkbox
      checked={!task.active}
      onCheckedChange={(checked) => completeTask(task, checked === true)}
      tone={PRIORITY_TONE[task.priority] ?? "default"}
      aria-label={task.active ? "Mark task done" : "Mark task not done"}
      title={task.priority < 4 ? `Priority: ${PRIORITY_LABEL[task.priority]}` : undefined}
    />
  );

  // The rail trades everything that isn't identity or action for width: one
  // line, no estimate bar, no metadata beyond the due tone.
  if (dense) {
    return (
      <div
        className={cn(
          "group flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors duration-fast ease-out-quart hover:bg-muted/50",
          dragging && "opacity-50"
        )}
        {...dragHandlers}
      >
        {doneToggle}
        <span className={cn("min-w-0 flex-1 truncate text-sm", !task.active && "text-muted-foreground line-through")}>
          {task.name}
        </span>
        {task.dueDate && tone === "overdue" && (
          <span className="shrink-0 text-micro text-destructive">Overdue</span>
        )}
        {startControl}
      </div>
    );
  }

  const row = (
    <div
      className={cn(
        "group flex items-center gap-2 rounded-md px-2 py-2 transition-colors duration-fast ease-out-quart hover:bg-muted/50",
        nested && "pl-8",
        running && "bg-primary/5",
        dragging && "opacity-50"
      )}
      {...dragHandlers}
    >
      {doneToggle}

      {/* Disclosure sits between the toggle and the name so the subtask rows
          below line up under the name, not under the checkbox. */}
      {!nested && hasChildren && (
        <button
          onClick={onToggleExpanded}
          aria-expanded={expanded}
          aria-label={expanded ? "Hide subtasks" : "Show subtasks"}
          className="-ml-1 flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors duration-fast ease-out-quart hover:text-foreground"
        >
          <ChevronRight
            className={cn(
              "h-3.5 w-3.5 transition-transform duration-fast ease-out-quart",
              expanded && "rotate-90"
            )}
          />
        </button>
      )}

      <TaskRowIdentity
        task={task}
        editingName={editingName}
        name={name}
        onNameChange={setName}
        onStartEditName={() => {
          setName(task.name);
          setEditingName(true);
        }}
        onSaveName={saveName}
        onCancelEditName={() => {
          setName(task.name);
          setEditingName(false);
        }}
        editingTime={editingTime}
        estimate={estimate}
        onEstimateChange={setEstimate}
        onStartEditTime={startEditTime}
        onSaveEstimate={saveEstimate}
        onCancelEditTime={() => setEditingTime(false)}
        progress={progress}
      />

      <TaskRowMeta
        task={task}
        nested={nested}
        showStatus={showStatus}
        showProject={showProject}
        hasChildren={hasChildren}
        repeats={repeats}
        tone={tone}
        dueOpen={dueOpen}
        onDueOpenChange={setDueOpen}
        onChangeDueDate={(dueDate) => updateTask.mutate({ id: task.id, data: { dueDate } })}
        members={members}
        membersLoading={membersLoading}
        onChangeAssignees={saveAssignees}
      />

      {/* ─── Actions ───────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-0.5">
        <TaskRowActions
          task={task}
          nested={nested}
          onEdit={onEdit}
          onLogTime={onLogTime}
          onAddSubtask={onAddSubtask}
          onRequestDelete={onRequestDelete}
          onOpenLogTimeSheet={() => openTaskLogTime(task.id)}
          onChangePriority={(priority) => updateTask.mutate({ id: task.id, data: { priority } })}
          onChangeRecurRule={(recurRule) => updateTask.mutate({ id: task.id, data: { recurRule } })}
        />

        {startControl}
      </div>
    </div>
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
      <ContextMenuContent>
        {onEdit && (
          <ContextMenuItem onSelect={() => onEdit(task)}>
            <Pencil />
            Edit task…
          </ContextMenuItem>
        )}
        <ContextMenuItem variant="destructive" onSelect={() => onRequestDelete(task)}>
          <Trash2 />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
