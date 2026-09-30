import { useRef, useState, type CSSProperties } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useBulkTaskAction } from "@/hooks/useTasks";
import { useCanDeleteTask } from "@/hooks/useTaskPermissions";
import { Plus } from "lucide-react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { ColorDot } from "@/components/ColorDot";
import { QuickAddTask } from "../QuickAddTask";
import { TaskCard } from "./TaskCard";
import { StatusColumnMenu } from "./StatusColumnMenu";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import { clusterTasks, type GroupBy } from "@/lib/taskUtils";
import { todayLocalDate } from "@shared/task-recurrence";
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
  onRequestDelete: (task: Task) => void;
  selectedIds: ReadonlySet<string>;
  onToggleSelect: (task: Task, range: boolean) => void;
  /** The column menu's "Select all": adds the column's cards to the selection. */
  onSelectColumn: (tasks: Task[]) => void;
  /** "Deselect all", shown instead once every card of the column is selected. */
  onDeselectColumn: (tasks: Task[]) => void;
  /** Present while "Show archived" is on: the column pages through its archive, and offers no quick-add (a new task would be live). */
  archivePaging?: ArchivePaging;
}

/** How the archive view pages each list, 50 per page; `null` status is the List's single archive list. */
export interface ArchivePaging {
  total: (statusId: string | null) => number;
  page: (statusId: string | null) => number;
  pageCount: (statusId: string | null) => number;
  busy: (statusId: string | null) => boolean;
  onPage: (statusId: string | null, page: number) => void;
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
  onRequestDelete,
  selectedIds,
  onToggleSelect,
  onSelectColumn,
  onDeselectColumn,
  archivePaging,
}: TaskBoardColumnProps) {
  const { setNodeRef } = useDroppable({ id: `column:${status.id}` });
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [adding, setAdding] = useState(false);
  const outsideRef = useOutsideClick<HTMLDivElement>(() => setAdding(false));
  const clusters = clusterTasks(tasks, groupBy, todayLocalDate());
  const selecting = selectedIds.size > 0;
  const bulk = useBulkTaskAction();
  const canDelete = useCanDeleteTask();
  const [archiveAllOpen, setArchiveAllOpen] = useState(false);
  const allSelected = tasks.length > 0 && tasks.every((t) => selectedIds.has(t.id));
  // Same rule as the selection bar: unarchive only when every card is archived; otherwise archive the live ones.
  const allArchived = tasks.length > 0 && tasks.every((t) => t.archivedAt);
  const archiveTargets = allArchived ? tasks : tasks.filter((t) => !t.archivedAt);
  const countLabel = `${archiveTargets.length} task${archiveTargets.length === 1 ? "" : "s"}`;

  return (
    <section aria-label={status.name} className="flex w-(--size-board-column) shrink-0 flex-col rounded-container">
      {/* The drop/scroll region is always full column height (so you can drop into the empty
          space below a short list), but the tint wrapper inside it is natural-height — it only
          covers the header and however many cards there are, same as the reference layout,
          instead of always painting the whole column down to the bottom. */}
      <div
        ref={(node) => {
          setNodeRef(node);
          scrollRef.current = node;
        }}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto"
      >
        <div
          style={{ "--swatch": status.color } as CSSProperties}
          className="flex flex-col tt-swatch-column rounded-container"
        >
          <header className="flex items-center gap-2 px-3 pb-2 pt-3">
            <ColorDot color={status.color} />
            <h2 className="min-w-0 flex-1 truncate text-sm font-medium">{status.name}</h2>
            <span className="text-xs tabular-nums text-muted-foreground">{archivePaging ? archivePaging.total(status.id) : tasks.length}</span>
            <StatusColumnMenu
              status={status}
              statuses={statuses}
              taskCount={tasks.length}
              projectId={defaultProjectId}
              canManage={canManage}
              onSelectAll={() => (allSelected ? onDeselectColumn(tasks) : onSelectColumn(tasks))}
              allSelected={allSelected}
              onArchiveAll={() => setArchiveAllOpen(true)}
              canArchiveAll={tasks.every(canDelete)}
              allArchived={allArchived}
            />
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
                    <TaskCard
                      key={task.id}
                      task={task}
                      onOpen={onOpenTask}
                      onRequestDelete={onRequestDelete}
                      selected={selectedIds.has(task.id)}
                      selecting={selecting}
                      onToggleSelect={onToggleSelect}
                    />
                  ))}
                </div>
              ))}
            </SortableContext>
          </div>

          {/* Inside the tint, right after the cards — not pinned to the column's bottom edge,
              which for a short column left it floating far below the last card. Text picks up
              the status's own ink colour, same as the reference layout, instead of plain grey. */}
          {archivePaging && (
            <Pagination
              page={archivePaging.page(status.id)}
              pageCount={archivePaging.pageCount(status.id)}
              onPageChange={(page) => {
                archivePaging.onPage(status.id, page);
                // The new page starts at the column's top, not where the old one was scrolled to.
                scrollRef.current?.scrollTo({ top: 0 });
              }}
              label={`${status.name} archive pages`}
              disabled={archivePaging.busy(status.id)}
              className="px-2 pb-2 pt-1"
            />
          )}
          {!archivePaging && (
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
          )}
        </div>
      </div>
      <ConfirmDialog
        open={archiveAllOpen}
        onOpenChange={setArchiveAllOpen}
        title={allArchived ? `Unarchive ${countLabel} in ${status.name}?` : `Archive ${countLabel} in ${status.name}?`}
        description={
          allArchived
            ? "They go back to the board with their subtasks, in the column they were in."
            : "They leave the board with their subtasks; nothing is deleted and their tracked time stays. Turn on Show archived to see or unarchive them."
        }
        confirmLabel={allArchived ? "Unarchive" : "Archive"}
        onConfirm={() => {
          setArchiveAllOpen(false);
          bulk.mutate({ ids: archiveTargets.map((t) => t.id), action: allArchived ? "unarchive" : "archive" });
        }}
      />
    </section>
  );
}
