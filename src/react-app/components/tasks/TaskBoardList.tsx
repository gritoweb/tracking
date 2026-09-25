import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { CollectionHeader } from "@/components/layout/CollectionHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TaskBoardListToolbar } from "./TaskBoardListToolbar";
import { TaskListView } from "./TaskListView";
import { TaskDialog } from "./TaskDialog";
import { TaskDetail } from "./TaskDetail";
import { TaskBoard } from "./board/TaskBoard";
import { TaskProjectRail } from "./TaskProjectRail";
import { useAllTasks, useDeleteTask, useUpdateTask } from "@/hooks/useTasks";
import { useProjects } from "@/hooks/useProjects";
import { useTaskStatuses } from "@/hooks/useTaskStatuses";
import { useAuth } from "@/hooks/useAuth";
import { useUIStore } from "@/stores/uiStore";
import { useMediaQuery, BELOW_MD } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";
import {
  buildTaskSections,
  midpointOrder,
  withSubtasks,
  type DueFilter,
  type GroupBy,
  type SortBy,
  type StatusFilter,
  type TaskSection,
} from "@/lib/taskUtils";
import { todayLocalDate } from "@shared/task-recurrence";
import { taskPath, type TaskTab } from "@shared/task-links";
import type { Task } from "@shared/schemas";

type Layout = "board" | "list";

interface TaskBoardListProps {
  /** From the `/tasks/:id` route: the URL is what opens a task's detail sheet, so every state has a link. */
  openTaskId?: string | null;
  openTab?: TaskTab;
}

export function TaskBoardList({ openTaskId = null, openTab = "task" }: TaskBoardListProps) {
  const { data: tasks = [], isLoading } = useAllTasks();
  const deleteTask = useDeleteTask();
  const updateTask = useUpdateTask();
  const openTaskLogTime = useUIStore((s) => s.openTaskLogTime);
  const narrow = useMediaQuery(BELOW_MD);
  const { user } = useAuth();
  const navigate = useNavigate();

  const [layout, setLayout] = useState<Layout>("board");
  // Due date is a filter, not a view: it narrows either layout, it isn't a third one.
  const [dueFilter, setDueFilter] = useState<DueFilter>("all");
  const [assignedToMe, setAssignedToMe] = useState(false);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [groupBy, setGroupBy] = useState<GroupBy>("project");
  // The Board already groups by status via its columns — a second default grouping
  // on top of that is exactly the clutter this page is trying to shed, so it starts
  // flat. List keeps its own "project" default, tracked separately.
  const [boardGroupBy, setBoardGroupBy] = useState<GroupBy>("none");
  const [sortBy, setSortBy] = useState<SortBy>("plan");
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [subtaskParent, setSubtaskParent] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  // The rail's own scope: filters both layouts alike. Mutually exclusive with the client
  // filter below — picking one clears the other, same as picking "All tasks" clears both.
  const [railProjectId, setRailProjectIdRaw] = useState<string | null>(null);
  const [railClientId, setRailClientIdRaw] = useState<string | null>(null);
  const setRailProjectId = (id: string | null) => {
    setRailProjectIdRaw(id);
    setRailClientIdRaw(null);
  };
  const setRailClientId = (id: string | null) => {
    setRailClientIdRaw(id);
    setRailProjectIdRaw(null);
  };
  const { data: projects = [] } = useProjects();
  const clientProjectIds = useMemo(
    () => new Set(projects.filter((p) => p.clientId === railClientId).map((p) => p.id)),
    [projects, railClientId]
  );
  // A client has no status fork of its own — falls back to the workspace's global set.
  const { data: statuses = [] } = useTaskStatuses(railClientId ? null : railProjectId);

  const openTask = openTaskId ? tasks.find((t) => t.id === openTaskId) ?? null : null;
  const openTaskNotFound = !!openTaskId && !isLoading && !openTask;
  // A shared link to a task this person can't see (or that is gone) lands on the plain list, with the reason.
  // Ids deleted from this screen: a stale route id for one is our own deletion, not a bad link (the list refetch can land before the navigation).
  const deletedIds = useRef(new Set<string>());
  useEffect(() => {
    if (!openTaskNotFound || (openTaskId && deletedIds.current.has(openTaskId))) return;
    toast.error("That task doesn't exist or you don't have access to it");
    navigate("/tasks", { replace: true });
  }, [openTaskNotFound, openTaskId, navigate]);
  const openSheet = (task: Task) => navigate(taskPath(task.id));

  const today = todayLocalDate();
  const hasAnyTask = tasks.length > 0;
  const defaultDueDate = dueFilter === "today" ? today : null;

  // Assignee filter applies before the Board does its own project/due filtering internally.
  const assigneeFilteredTasks = useMemo(() => {
    if (!assignedToMe || !user) return tasks;
    return withSubtasks(
      tasks.filter((t) => t.assignees.some((a) => a.userId === user.id)),
      tasks
    );
  }, [tasks, assignedToMe, user]);

  // Both layouts read this: the Board has no client filter of its own.
  const scopedTasks = useMemo(() => {
    if (railProjectId) return assigneeFilteredTasks.filter((t) => t.projectId === railProjectId);
    if (railClientId) return assigneeFilteredTasks.filter((t) => clientProjectIds.has(t.projectId));
    return assigneeFilteredTasks;
  }, [assigneeFilteredTasks, railProjectId, railClientId, clientProjectIds]);

  const sections = useMemo<TaskSection[]>(() => {
    if (layout === "board") return [];
    return buildTaskSections({
      tasks: scopedTasks,
      dueFilter,
      status,
      groupBy,
      sortBy,
      today,
      statusOrder: statuses.map((s) => s.id),
    });
  }, [scopedTasks, layout, dueFilter, status, groupBy, sortBy, today, statuses]);

  /** Commit a drag: one row's `sort_order` becomes the midpoint of its new neighbours. */
  const handleDrop = (ordered: Task[], toIndex: number) => {
    if (!dragId) return;
    const fromIndex = ordered.findIndex((t) => t.id === dragId);
    setDragId(null);
    if (fromIndex === -1 || fromIndex === toIndex) return;
    const without = ordered.filter((t) => t.id !== dragId);
    const before = without[toIndex - 1] ?? null;
    const after = without[toIndex] ?? null;
    updateTask.mutate({
      id: dragId,
      data: { sortOrder: midpointOrder(before?.sortOrder ?? null, after?.sortOrder ?? null) },
    });
  };

  const toggleCollapsed = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const clearFilters = () => {
    setStatus("all");
    setDueFilter("all");
  };

  const openSubtaskAdd = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setSubtaskParent(id);
  };

  return (
    <div
      className={cn(
        "flex h-full min-h-0 gap-4 p-6 pb-0",
        // The rail collapses to a Select on narrow screens; the page stacks to match.
        narrow ? "flex-col" : "flex-row"
      )}
    >
      <TaskProjectRail
        tasks={assigneeFilteredTasks}
        projectId={railProjectId}
        onChange={setRailProjectId}
        clientId={railClientId}
        onClientChange={setRailClientId}
      />

      {/* min-w-0: without it the board's wide columns stretch this flex item past the viewport. */}
      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      {/* Same header shape as Projects and Clients. This used to be a bordered
          toolbar with a `text-sm` <h1> — a page title rendered at body size,
          6px under every sibling page's, in the one collection page that also
          centred itself in a 768px column. */}
      <CollectionHeader title="Tasks" className="shrink-0">
        <TaskBoardListToolbar
          layout={layout}
          onLayoutChange={setLayout}
          dueFilter={dueFilter}
          onDueFilterChange={setDueFilter}
          assignedToMe={assignedToMe}
          onToggleAssignedToMe={() => setAssignedToMe((v) => !v)}
          status={status}
          onStatusChange={setStatus}
          groupBy={layout === "board" ? boardGroupBy : groupBy}
          onGroupByChange={layout === "board" ? setBoardGroupBy : setGroupBy}
          sortBy={sortBy}
          onSortByChange={setSortBy}
          hasAnyTask={hasAnyTask}
          onAddTask={() => setAddOpen(true)}
        />
      </CollectionHeader>

      {isLoading ? (
        <div className="space-y-2 p-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : (
        <div
          className={cn(
            "-mx-6 min-h-0 flex-1 px-6 pb-6",
            // The board and each column scroll themselves; a page scroll too would fight the cursor.
            layout === "board" ? "overflow-hidden" : "overflow-y-auto"
          )}
        >
          {layout === "board" ? (
            <TaskBoard
              tasks={scopedTasks}
              projectId={railProjectId}
              dueFilter={dueFilter}
              status={status}
              sortBy={sortBy}
              groupBy={boardGroupBy}
              onOpenTask={openSheet}
              onRequestDelete={setDeleteTarget}
            />
          ) : (
            <TaskListView
              sections={sections}
              groupBy={groupBy}
              isLoading={isLoading}
              hasAnyTask={hasAnyTask}
              status={status}
              dueFilter={dueFilter}
              defaultDueDate={defaultDueDate}
              collapsed={collapsed}
              onToggleCollapsed={toggleCollapsed}
              dragId={dragId}
              onDragStart={setDragId}
              onDragEnd={() => setDragId(null)}
              onDrop={handleDrop}
              subtaskParent={subtaskParent}
              onOpenSubtaskAdd={openSubtaskAdd}
              onCloseSubtaskAdd={() => setSubtaskParent(null)}
              onRequestDelete={setDeleteTarget}
              onEdit={openSheet}
              onLogTime={(t) => openTaskLogTime(t.id)}
              onCreateTask={() => setAddOpen(true)}
              onClearFilters={clearFilters}
            />
          )}
        </div>
      )}

      <TaskDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        defaultDueDate={defaultDueDate}
      />

      <TaskDetail
        open={!!openTask}
        task={openTask}
        tab={openTab}
        onTabChange={(tab) => openTask && navigate(taskPath(openTask.id, tab))}
        onClose={() => navigate("/tasks")}
        onRequestDelete={setDeleteTarget}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={deleteTarget?.parentId ? "Delete subtask?" : "Delete task?"}
        description={
          deleteTarget?.subtaskTotal
            ? `"${deleteTarget.name}" and its ${deleteTarget.subtaskTotal} subtask${
                deleteTarget.subtaskTotal === 1 ? "" : "s"
              } will be permanently deleted. Time already tracked against them is kept.`
            : `"${deleteTarget?.name}" will be permanently deleted. This cannot be undone.`
        }
        onConfirm={() => {
          if (deleteTarget) {
            deletedIds.current.add(deleteTarget.id);
            deleteTask.mutate(deleteTarget.id);
          }
          // Deleting the subtask being viewed lands on its parent, which is still there.
          if (deleteTarget?.parentId && deleteTarget.id === openTaskId) navigate(taskPath(deleteTarget.parentId));
          setDeleteTarget(null);
        }}
      />
      </div>
    </div>
  );
}
