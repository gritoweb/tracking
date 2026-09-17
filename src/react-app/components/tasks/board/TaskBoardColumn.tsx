import { useState, type CSSProperties } from "react";
import { Plus } from "lucide-react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Button } from "@/components/ui/button";
import { ColorDot } from "@/components/ColorDot";
import { QuickAddTask } from "../QuickAddTask";
import { TaskCard } from "./TaskCard";
import { StatusColumnMenu } from "./StatusColumnMenu";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import { clusterTasks, type GroupBy } from "@/lib/taskUtils";
import { todayLocalDate } from "@shared/task-recurrence";
import { cn } from "@/lib/utils";
import type { Task, TaskStatus } from "@shared/schemas";

interface TaskBoardColumnProps {
  status: TaskStatus;
  statuses: TaskStatus[];
  tasks: Task[];
  canManage: boolean;
  /** Seeds the column's own quick-add, so capture inherits the board's filter. */
  defaultProjectId: string | null;
  groupBy: GroupBy;
  onOpenTask: (task: Task) => void;
}

/** One column of the board — `useDroppable` here (not just the sortable list) is what lets an empty column receive a card. */
export function TaskBoardColumn({
  status,
  statuses,
  tasks,
  canManage,
  defaultProjectId,
  groupBy,
  onOpenTask,
}: TaskBoardColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `column:${status.id}` });
  const [adding, setAdding] = useState(false);
  const outsideRef = useOutsideClick<HTMLDivElement>(() => setAdding(false));
  const clusters = clusterTasks(tasks, groupBy, todayLocalDate());

  return (
    <section aria-label={status.name} className="flex w-72 shrink-0 flex-col rounded-container">
      {/* The drop/scroll region is always full column height (so you can drop into the empty
          space below a short list), but the tint wrapper inside it is natural-height — it only
          covers the header and however many cards there are, same as the ClickUp reference,
          instead of always painting the whole column down to the bottom. */}
      <div
        ref={setNodeRef}
        className={cn("flex min-h-0 flex-1 flex-col overflow-y-auto", isOver && "bg-muted/60")}
      >
        <div
          style={{ "--swatch": status.color } as CSSProperties}
          className="flex flex-col tt-swatch-column rounded-container"
        >
          <header className="flex items-center gap-2 px-3 pb-2 pt-3">
            <ColorDot color={status.color} />
            <h2 className="min-w-0 flex-1 truncate text-sm font-medium">{status.name}</h2>
            <span className="text-xs tabular-nums text-muted-foreground">{tasks.length}</span>
            {canManage && (
              <StatusColumnMenu
                status={status}
                statuses={statuses}
                taskCount={tasks.length}
                projectId={defaultProjectId}
              />
            )}
          </header>

          <div className="px-2 pb-2">
            {/* One SortableContext for the whole column — drag order isn't scoped per
                cluster, the sub-header just labels how the (already-sorted) cards read. */}
            <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              {clusters.map((cluster) => (
                <div key={cluster.key} className="space-y-1.5 [&:not(:first-child)]:mt-3">
                  {cluster.label && (
                    <h3 className="truncate px-1 text-micro font-medium text-muted-foreground">
                      {cluster.label}
                    </h3>
                  )}
                  {cluster.tasks.map((task) => (
                    <TaskCard key={task.id} task={task} onOpen={onOpenTask} />
                  ))}
                </div>
              ))}
            </SortableContext>
          </div>

          {/* Inside the tint, right after the cards — not pinned to the column's bottom edge,
              which for a short column left it floating far below the last card. Text picks up
              the status's own ink colour, same as the ClickUp reference, instead of plain grey. */}
          <div className="px-2 pb-2 pt-1">
            {adding ? (
              <div ref={outsideRef}>
                <QuickAddTask
                  autoFocus
                  defaultProjectId={defaultProjectId}
                  defaultStatusId={status.id}
                  placeholder="Add a task"
                  onDone={() => setAdding(false)}
                  stacked
                />
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setAdding(true)}
                className="w-full justify-start gap-1.5 tt-swatch-ink hover:bg-background/40"
              >
                <Plus className="h-4 w-4" />
                Add a task
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
