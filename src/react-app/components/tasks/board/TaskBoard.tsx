import { useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  getFirstCollision,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
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
import { usePanScroll } from "@/hooks/usePanScroll";
import { matchesDueFilter, midpointOrder, type DueFilter } from "@/lib/taskUtils";
import { todayLocalDate } from "@shared/task-recurrence";
import type { Task } from "@shared/schemas";

const COLUMN_PREFIX = "column:";

interface TaskBoardProps {
  tasks: Task[];
  /** Board-level project filter; `null` means every project. */
  projectId: string | null;
  dueFilter: DueFilter;
  onOpenTask: (task: Task) => void;
}

/** Which column a droppable id names — a column's own background, or the task sitting in it. */
function columnIdOf(id: string, columns: Map<string, Task[]>): string | undefined {
  if (id.startsWith(COLUMN_PREFIX)) return id.slice(COLUMN_PREFIX.length);
  for (const [statusId, tasks] of columns) {
    if (tasks.some((t) => t.id === id)) return statusId;
  }
  return undefined;
}

/** The kanban view. Top-level tasks only — a subtask rides its parent's card as a `2/5` chip. */
export function TaskBoard({ tasks, projectId, dueFilter, onOpenTask }: TaskBoardProps) {
  const { data: statuses = [], isLoading } = useTaskStatuses();
  const { canManage } = useWorkspaceRole();
  const move = useMoveTask();
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const lastOverId = useRef<string | null>(null);
  const panRef = usePanScroll<HTMLDivElement>();

  const sensors = useSensors(
    // A few pixels of slop, so pressing the card's own buttons doesn't start a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const today = todayLocalDate();
  const serverColumns = useMemo(() => {
    const visible = tasks.filter(
      (t) =>
        !t.parentId &&
        (!projectId || t.projectId === projectId) &&
        matchesDueFilter(t, dueFilter, today)
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
  }, [tasks, statuses, projectId, dueFilter, today]);

  // Live-reshuffled while dragging (two separate SortableContexts can't do this alone); server truth otherwise.
  const [liveColumns, setLiveColumns] = useState<Map<string, Task[]> | null>(null);
  const columns = liveColumns ?? serverColumns;

  const dragging = draggingId ? tasks.find((t) => t.id === draggingId) ?? null : null;

  // pointerWithin alone missed fast upward drags near a column's top edge; rectIntersection is the fallback.
  const collisionDetection: CollisionDetection = (args) => {
    const pointerHits = pointerWithin(args);
    const hits = pointerHits.length > 0 ? pointerHits : rectIntersection(args);
    const id = getFirstCollision(hits, "id");
    if (id != null) {
      lastOverId.current = String(id);
      return [{ id }];
    }
    return lastOverId.current ? [{ id: lastOverId.current }] : [];
  };

  const onDragStart = (event: DragStartEvent) => {
    setDraggingId(String(event.active.id));
    lastOverId.current = null;
    setLiveColumns(new Map([...serverColumns].map(([k, v]) => [k, [...v]])));
  };

  const onDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || !liveColumns) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    const fromColumn = columnIdOf(activeId, liveColumns);
    const toColumn = columnIdOf(overId, liveColumns);
    if (!fromColumn || !toColumn) return;

    const fromItems = liveColumns.get(fromColumn)!;
    const activeIndex = fromItems.findIndex((t) => t.id === activeId);
    if (activeIndex === -1) return;

    const toItems = liveColumns.get(toColumn)!;
    const overIndex = toItems.findIndex((t) => t.id === overId);

    let newIndex: number;
    if (overId.startsWith(COLUMN_PREFIX)) {
      newIndex = toItems.length;
    } else if (overIndex === -1) {
      newIndex = toItems.length;
    } else {
      // Above or below by the dragged card's own edge, not the pointer — survives a fast flick.
      const isBelow =
        active.rect.current.translated &&
        active.rect.current.translated.top > over.rect.top + over.rect.height / 2;
      newIndex = overIndex + (isBelow ? 1 : 0);
    }

    if (fromColumn === toColumn && newIndex === activeIndex) return;

    setLiveColumns((prev) => {
      if (!prev) return prev;
      const next = new Map(prev);
      const source = [...next.get(fromColumn)!];
      const [moved] = source.splice(activeIndex, 1);
      next.set(fromColumn, source);
      if (fromColumn === toColumn) {
        const adjusted = newIndex > activeIndex ? newIndex - 1 : newIndex;
        source.splice(adjusted, 0, moved);
      } else {
        const dest = [...next.get(toColumn)!];
        dest.splice(newIndex, 0, moved);
        next.set(toColumn, dest);
      }
      return next;
    });
  };

  const onDragEnd = (event: DragEndEvent) => {
    const activeId = String(event.active.id);
    const finalColumns = liveColumns;
    setDraggingId(null);
    // Keep liveColumns through the drop animation, or it samples the old spot and snaps back first.
    requestAnimationFrame(() => requestAnimationFrame(() => setLiveColumns(null)));

    if (!finalColumns) return;
    const task = tasks.find((t) => t.id === activeId);
    const columnId = columnIdOf(activeId, finalColumns);
    if (!task || !columnId) return;
    const status = statuses.find((s) => s.id === columnId);
    if (!status) return;

    const ordered = finalColumns.get(columnId)!;
    const index = ordered.findIndex((t) => t.id === activeId);
    const before = ordered[index - 1] ?? null;
    const after = ordered[index + 1] ?? null;
    const boardOrder = midpointOrder(before?.boardOrder ?? null, after?.boardOrder ?? null);

    if (task.statusId === status.id && boardOrder === task.boardOrder) return;
    move.mutate({ id: activeId, status, boardOrder });
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
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setDraggingId(null);
        setLiveColumns(null);
      }}
      accessibility={{
        announcements: {
          onDragStart: ({ active }) => `Picked up ${active.id}. Use the arrow keys to move it.`,
          onDragOver: () => "",
          onDragEnd: ({ over }) => (over ? "Dropped." : "Cancelled."),
          onDragCancel: () => "Cancelled.",
        },
      }}
    >
      <div ref={panRef} className="flex h-full min-h-0 items-stretch gap-3 overflow-x-auto pb-4">
        {statuses.map((status) => (
          <TaskBoardColumn
            key={status.id}
            status={status}
            statuses={statuses}
            tasks={columns.get(status.id) ?? []}
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
