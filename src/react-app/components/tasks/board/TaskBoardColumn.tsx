import { useState } from "react";
import { Plus } from "lucide-react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Button } from "@/components/ui/button";
import { ColorDot } from "@/components/ColorDot";
import { QuickAddTask } from "../QuickAddTask";
import { TaskCard } from "./TaskCard";
import { StatusColumnMenu } from "./StatusColumnMenu";
import { cn } from "@/lib/utils";
import type { Task, TaskStatus } from "@shared/schemas";

interface TaskBoardColumnProps {
  status: TaskStatus;
  statuses: TaskStatus[];
  tasks: Task[];
  canManage: boolean;
  /** Seeds the column's own quick-add, so capture inherits the board's filter. */
  defaultProjectId: string | null;
  onOpenTask: (task: Task) => void;
}

/** One column of the board — `useDroppable` here (not just the sortable list) is what lets an empty column receive a card. */
export function TaskBoardColumn({
  status,
  statuses,
  tasks,
  canManage,
  defaultProjectId,
  onOpenTask,
}: TaskBoardColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `column:${status.id}` });
  const [adding, setAdding] = useState(false);

  return (
    <section
      aria-label={status.name}
      className="flex w-72 shrink-0 flex-col rounded-container bg-muted/40"
    >
      <header className="flex items-center gap-2 px-3 pb-2 pt-3">
        <ColorDot color={status.color} />
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium">{status.name}</h2>
        <span className="text-xs tabular-nums text-muted-foreground">{tasks.length}</span>
        {canManage && (
          <StatusColumnMenu status={status} statuses={statuses} taskCount={tasks.length} />
        )}
      </header>

      <div
        ref={setNodeRef}
        className={cn(
          "min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-2",
          isOver && "rounded-b-container bg-muted/60"
        )}
      >
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} onOpen={onOpenTask} />
          ))}
        </SortableContext>

        {/* A dashed target means "empty, put something here" (The Dashed Rule).
            Without it an empty column is a blank rectangle that gives no sign it
            can receive anything. */}
        {tasks.length === 0 && (
          <div
            className={cn(
              "flex h-16 items-center justify-center rounded-lg border border-dashed",
              "text-micro text-muted-foreground/60 transition-colors duration-fast ease-out-quart",
              isOver && "border-solid border-ring text-muted-foreground"
            )}
          >
            Drop a task here
          </div>
        )}
      </div>

      {/* Collapsed until asked for — open by default, five columns rest under five project pickers. */}
      <div className="px-2 pb-2">
        {adding ? (
          <QuickAddTask
            autoFocus
            defaultProjectId={defaultProjectId}
            defaultStatusId={status.id}
            placeholder="Add a task"
            onDone={() => setAdding(false)}
            stacked
          />
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAdding(true)}
            className="w-full justify-start gap-1.5 text-muted-foreground"
          >
            <Plus className="h-4 w-4" />
            Add a task
          </Button>
        )}
      </div>
    </section>
  );
}
