import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { Skeleton } from "@/components/ui/skeleton";
import { TaskBoardColumn } from "./TaskBoardColumn";
import { TaskCard } from "./TaskCard";
import { AddStatusColumn } from "./AddStatusColumn";
import { useMoveTask } from "@/hooks/useTasks";
import { useTaskStatuses } from "@/hooks/useTaskStatuses";
import { useWorkspaceRole } from "@/hooks/useWorkspaceRole";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { midpointOrder } from "@/lib/taskUtils";
import type { Task, TaskStatus } from "@shared/schemas";

const COLUMN_PREFIX = "column:";

interface TaskBoardProps {
  tasks: Task[];
  /** Board-level project filter; `null` means every project. */
  projectId: string | null;
  onOpenTask: (task: Task) => void;
}

/** The kanban view. Top-level tasks only — a subtask rides its parent's card as a `2/5` chip. */
export function TaskBoard({ tasks, projectId, onOpenTask }: TaskBoardProps) {
  const { data: statuses = [], isLoading } = useTaskStatuses();
  const { canManage } = useWorkspaceRole();
  const move = useMoveTask();
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const sensors = useSensors(
    // A few pixels of slop, so pressing the card's own buttons doesn't start a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const byColumn = useMemo(() => {
    const visible = tasks.filter(
      (t) => !t.parentId && (!projectId || t.projectId === projectId)
    );
    const map = new Map<string, Task[]>();
    for (const status of statuses) map.set(status.id, []);
    for (const task of visible) {
      const bucket = task.statusId ? map.get(task.statusId) : undefined;
      // A status archived out from under a task lands it in the first column, not nowhere.
      (bucket ?? map.get(statuses[0]?.id ?? "") ?? []).push(task);
    }
    for (const list of map.values()) list.sort((a, b) => a.boardOrder - b.boardOrder);
    return map;
  }, [tasks, statuses, projectId]);

  const dragging = draggingId ? tasks.find((t) => t.id === draggingId) ?? null : null;

  /** The column a drop landed on — either a column's own droppable, or a card in it. */
  const columnOf = (overId: string): TaskStatus | undefined => {
    if (overId.startsWith(COLUMN_PREFIX)) {
      return statuses.find((s) => s.id === overId.slice(COLUMN_PREFIX.length));
    }
    const overTask = tasks.find((t) => t.id === overId);
    return statuses.find((s) => s.id === overTask?.statusId);
  };

  const onDragStart = (event: DragStartEvent) => setDraggingId(String(event.active.id));

  const onDragEnd = (event: DragEndEvent) => {
    const activeId = String(event.active.id);
    setDraggingId(null);
    if (!event.over) return;

    const overId = String(event.over.id);
    const target = columnOf(overId);
    const task = tasks.find((t) => t.id === activeId);
    if (!target || !task) return;

    // The midpoint of the two rows it lands between — a drop rewrites exactly one row.
    const column = (byColumn.get(target.id) ?? []).filter((t) => t.id !== activeId);
    const index = overId.startsWith(COLUMN_PREFIX)
      ? column.length
      : (() => {
          const at = column.findIndex((t) => t.id === overId);
          if (at === -1) return column.length;
          // Dragging down within the same column lands after the card you were over.
          const wasBefore =
            task.statusId === target.id &&
            (byColumn.get(target.id) ?? []).findIndex((t) => t.id === activeId) < at + 1;
          return wasBefore ? at + 1 : at;
        })();

    const before = column[index - 1] ?? null;
    const after = column[index] ?? null;
    const boardOrder = midpointOrder(before?.boardOrder ?? null, after?.boardOrder ?? null);

    if (task.statusId === target.id && boardOrder === task.boardOrder) return;
    move.mutate({ id: activeId, status: target, boardOrder });
  };

  if (isLoading) {
    return (
      <div className="flex gap-3 overflow-x-auto pb-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-64 w-72 shrink-0 rounded-container" />
        ))}
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDraggingId(null)}
      accessibility={{
        announcements: {
          onDragStart: ({ active }) => `Picked up ${active.id}. Use the arrow keys to move it.`,
          onDragOver: () => "",
          onDragEnd: ({ over }) => (over ? "Dropped." : "Cancelled."),
          onDragCancel: () => "Cancelled.",
        },
      }}
    >
      <div className="flex h-full min-h-0 items-stretch gap-3 overflow-x-auto pb-4">
        {statuses.map((status) => (
          <TaskBoardColumn
            key={status.id}
            status={status}
            statuses={statuses}
            tasks={byColumn.get(status.id) ?? []}
            canManage={canManage}
            defaultProjectId={projectId}
            onOpenTask={onOpenTask}
          />
        ))}
        {canManage && <AddStatusColumn statuses={statuses} />}
      </div>

      {/* The overlay is what actually follows the pointer; the card in the column
          stays put as a hole (TaskCard). `dropAnimation: null` under reduced
          motion — the CSS rule in index.css can't reach an animation JS owns. */}
      <DragOverlay dropAnimation={reducedMotion ? null : undefined}>
        {dragging ? <TaskCard task={dragging} onOpen={onOpenTask} overlay /> : null}
      </DragOverlay>
    </DndContext>
  );
}
