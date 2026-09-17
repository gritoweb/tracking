import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, ListChecks, SearchX, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { CollectionHeader } from "@/components/layout/CollectionHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ColorDot } from "@/components/ColorDot";
import { TaskRow } from "./TaskRow";
import { QuickAddTask } from "./QuickAddTask";
import { TaskDialog } from "./TaskDialog";
import { TaskSheet } from "./TaskSheet";
import { TaskBoard } from "./board/TaskBoard";
import { TaskProjectRail } from "./TaskProjectRail";
import { useAllTasks, useDeleteTask, useUpdateTask } from "@/hooks/useTasks";
import { useProjects } from "@/hooks/useProjects";
import { useTaskStatuses } from "@/hooks/useTaskStatuses";
import { useAuth } from "@/hooks/useAuth";
import { useUIStore } from "@/stores/uiStore";
import { useMediaQuery, BELOW_MD } from "@/hooks/useMediaQuery";
import { formatDurationShort } from "@/lib/dateUtils";
import { cn } from "@/lib/utils";
import {
  formatDueHeading,
  matchesDueFilter,
  midpointOrder,
  nest,
  withSubtasks,
  DUE_FILTER_LABEL,
  SORTERS,
  type DueFilter,
  type GroupBy,
  type SortBy,
  type StatusFilter,
  type TaskNode,
} from "@/lib/taskUtils";
import { todayLocalDate } from "@shared/task-recurrence";
import type { Task } from "@shared/schemas";

type Layout = "board" | "list";

const LAYOUT_OPTIONS = [
  { value: "board" as const, label: "Board" },
  { value: "list" as const, label: "List" },
];
const DUE_FILTER_OPTIONS: DueFilter[] = ["all", "today", "upcoming"];

interface Section {
  key: string;
  label: string;
  color?: string | null;
  trackedSeconds: number;
  nodes: TaskNode[];
  defaultProjectId?: string | null;
  defaultDueDate?: string | null;
  /** Drag-to-reorder is only meaningful where the order is the user's own. */
  reorderable?: boolean;
}

/** Tracked total for a node and everything under it, without double-counting. */
function nodeSeconds(node: TaskNode) {
  // `trackedSeconds` on a parent already rolls its children up (TASK_SELECT),
  // so summing the children again here would count every subtask twice.
  return node.task.trackedSeconds;
}

interface TaskBoardListProps {
  /** From the `/tasks/:id` route — opens that task's detail sheet on mount (D5). */
  openTaskId?: string | null;
}

export function TaskBoardList({ openTaskId = null }: TaskBoardListProps) {
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
  const [editTarget, setEditTarget] = useState<Task | null>(null);
  const [syncedOpenTaskId, setSyncedOpenTaskId] = useState<string | null>(null);
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

  // Adjusted during render, not an effect: the `/tasks/:id` route needs the sheet open on the
  // very first paint the matching task is available, same idiom TaskDialog/TaskSheet use to
  // reseed on a prop change.
  if (openTaskId && openTaskId !== syncedOpenTaskId) {
    const match = tasks.find((t) => t.id === openTaskId);
    if (match) {
      setSyncedOpenTaskId(openTaskId);
      setEditTarget(match);
    }
  }

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

  // The Board filters the same way internally, from `assigneeFilteredTasks` below.
  const scopedTasks = useMemo(() => {
    if (railProjectId) return assigneeFilteredTasks.filter((t) => t.projectId === railProjectId);
    if (railClientId) return assigneeFilteredTasks.filter((t) => clientProjectIds.has(t.projectId));
    return assigneeFilteredTasks;
  }, [assigneeFilteredTasks, railProjectId, railClientId, clientProjectIds]);

  const sections = useMemo<Section[]>(() => {
    if (layout === "board") return [];
    const compare = SORTERS[sortBy];

    let byDue = scopedTasks;
    if (dueFilter !== "all") {
      const matched = scopedTasks.filter((t) => matchesDueFilter(t, dueFilter, today));
      // Subtasks have no due date of their own, so a matched parent needs them re-attached.
      byDue = withSubtasks(matched, scopedTasks);
    }
    const filtered = byDue.filter((t) =>
      status === "all" ? true : status === "active" ? t.active : !t.active
    );

    if (groupBy === "none") {
      const nodes = nest(filtered, compare);
      return nodes.length
        ? [
            {
              key: "all",
              label: "All tasks",
              trackedSeconds: nodes.reduce((sum, n) => sum + nodeSeconds(n), 0),
              nodes,
              reorderable: sortBy === "plan",
            },
          ]
        : [];
    }

    const map = new Map<string, { label: string; color?: string | null; tasks: Task[]; defaultProjectId?: string | null; defaultDueDate?: string | null }>();
    for (const t of filtered) {
      let key: string;
      let label: string;
      if (groupBy === "project") {
        key = t.projectId ?? "none";
        label = t.projectName ?? "No project";
      } else if (groupBy === "status") {
        // The real columns now, not just Active/Done.
        key = t.statusId ?? "none";
        label = t.statusName ?? "No status";
      } else {
        key = t.dueDate ?? "none";
        label = t.dueDate ? formatDueHeading(t.dueDate, today) : "No due date";
      }
      let bucket = map.get(key);
      if (!bucket) {
        bucket = {
          label,
          color: groupBy === "project" ? t.projectColor : groupBy === "status" ? t.statusColor : null,
          tasks: [],
          defaultProjectId: groupBy === "project" ? t.projectId : null,
          defaultDueDate: groupBy === "due" && t.dueDate ? t.dueDate : null,
        };
        map.set(key, bucket);
      }
      bucket.tasks.push(t);
    }

    const entries = [...map.entries()].map(([key, b]) => {
      const nodes = nest(b.tasks, compare);
      return {
        key,
        label: b.label,
        color: b.color,
        defaultProjectId: b.defaultProjectId,
        defaultDueDate: b.defaultDueDate,
        nodes,
        trackedSeconds: nodes.reduce((sum, n) => sum + nodeSeconds(n), 0),
        // Ordering is only the user's own inside a project; in any other
        // grouping a drag would be rewriting a sequence the group doesn't own.
        reorderable: groupBy === "project" && sortBy === "plan",
      };
    });

    // Due groups sort chronologically; status groups follow the board's own column order.
    if (groupBy === "due") {
      return entries.sort((a, b) =>
        a.key === "none" ? 1 : b.key === "none" ? -1 : a.key.localeCompare(b.key)
      );
    }
    if (groupBy === "status") {
      const rank = new Map(statuses.map((s, i) => [s.id, i]));
      return entries.sort(
        (a, b) => (rank.get(a.key) ?? Infinity) - (rank.get(b.key) ?? Infinity)
      );
    }
    return entries.sort((a, b) => a.label.localeCompare(b.label));
  }, [scopedTasks, layout, dueFilter, status, groupBy, sortBy, today, statuses]);

  const isEmpty = sections.length === 0;

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

  // "No tasks yet" teaches the surface; anything else is a filter with nothing left.
  let empty: React.ReactNode = null;
  if (isEmpty && !isLoading && layout === "list") {
    if (!hasAnyTask) {
      empty = (
        <EmptyState
          icon={ListChecks}
          title="What do you plan to work on?"
          description="Create a task to start planning your projects, then start a timer on it in one click."
          className="py-24"
          action={
            <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" />
              Create a task
            </Button>
          }
        />
      );
    } else {
      const clauses = [
        status !== "all" ? (status === "done" ? "done" : "active") : null,
        dueFilter !== "all" ? DUE_FILTER_LABEL[dueFilter].toLowerCase() : null,
      ].filter(Boolean);
      empty = (
        <EmptyState
          icon={SearchX}
          title="No tasks match this filter"
          description={clauses.length ? `Showing ${clauses.join(", ")} tasks only.` : undefined}
          className="py-24"
          action={
            <Button size="sm" variant="outline" onClick={clearFilters}>
              Clear filters
            </Button>
          }
        />
      );
    }
  }

  const renderNode = (node: TaskNode, ordered: Task[], index: number, section: Section) => {
    const open = !collapsed.has(node.task.id);
    const dragHandlers = section.reorderable
      ? {
          draggable: true,
          onDragStart: () => setDragId(node.task.id),
          onDragEnd: () => setDragId(null),
          onDragOver: (e: React.DragEvent) => e.preventDefault(),
          onDrop: (e: React.DragEvent) => {
            e.preventDefault();
            handleDrop(ordered, index);
          },
        }
      : undefined;

    return (
      <div key={node.task.id}>
        <TaskRow
          task={node.task}
          showProject={groupBy !== "project"}
          showStatus={groupBy !== "status"}
          expanded={open}
          onToggleExpanded={() => toggleCollapsed(node.task.id)}
          onRequestDelete={setDeleteTarget}
          onEdit={setEditTarget}
          onLogTime={(t) => openTaskLogTime(t.id)}
          onAddSubtask={(t) => {
            setCollapsed((prev) => {
              const next = new Set(prev);
              next.delete(t.id);
              return next;
            });
            setSubtaskParent(t.id);
          }}
          dragHandlers={dragHandlers}
          dragging={dragId === node.task.id}
        />
        {open && node.children.length > 0 && (
          <div className="border-t">
            {node.children.map((child) => (
              <TaskRow
                key={child.id}
                task={child}
                nested
                onRequestDelete={setDeleteTarget}
                onEdit={setEditTarget}
                onLogTime={(t) => openTaskLogTime(t.id)}
              />
            ))}
          </div>
        )}
        {subtaskParent === node.task.id && (
          <div className="border-t px-2 py-1.5 pl-8">
            <QuickAddTask
              autoFocus
              parentId={node.task.id}
              defaultProjectId={node.task.projectId}
              placeholder="Add a subtask"
              onDone={() => setSubtaskParent(null)}
            />
          </div>
        )}
      </div>
    );
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
        <SegmentedControl value={layout} options={LAYOUT_OPTIONS} onChange={setLayout} label="Task layout" />

        <Select value={dueFilter} onValueChange={(v) => setDueFilter(v as DueFilter)}>
          <SelectTrigger size="sm" className="w-32" aria-label="Filter by due date">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DUE_FILTER_OPTIONS.map((f) => (
              <SelectItem key={f} value={f}>
                {DUE_FILTER_LABEL[f]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant={assignedToMe ? "secondary" : "outline"}
          size="sm"
          className="gap-1.5"
          aria-pressed={assignedToMe}
          onClick={() => setAssignedToMe((v) => !v)}
        >
          <User className="h-3.5 w-3.5" />
          Assigned to me
        </Button>

        <div className="mx-1 h-5 w-px bg-border" aria-hidden />

        <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
          <SelectTrigger size="sm" className="w-28" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="done">Done</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={layout === "board" ? boardGroupBy : groupBy}
          onValueChange={(v) => (layout === "board" ? setBoardGroupBy : setGroupBy)(v as GroupBy)}
        >
          <SelectTrigger size="sm" className="w-36" aria-label="Group by">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="project">Group: Project</SelectItem>
            <SelectItem value="due">Group: Due date</SelectItem>
            {layout === "list" && <SelectItem value="status">Group: Status</SelectItem>}
            <SelectItem value="none">Group: None</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
          <SelectTrigger size="sm" className="w-36" aria-label="Sort by">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="plan">Sort: Plan order</SelectItem>
            <SelectItem value="recent">Sort: Recent</SelectItem>
            <SelectItem value="name">Sort: Name</SelectItem>
            <SelectItem value="estimate">Sort: Estimate</SelectItem>
            <SelectItem value="tracked">Sort: Tracked</SelectItem>
          </SelectContent>
        </Select>

        {hasAnyTask && (
          <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" />
            Add task
          </Button>
        )}
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
              tasks={assigneeFilteredTasks}
              projectId={railProjectId}
              dueFilter={dueFilter}
              status={status}
              sortBy={sortBy}
              groupBy={boardGroupBy}
              onOpenTask={setEditTarget}
            />
          ) : (
          <>
          {hasAnyTask && (
            <QuickAddTask className="mb-4" defaultDueDate={defaultDueDate} />
          )}

          {empty ?? (
            <div className="space-y-6">
              {sections.map((section) => {
                const ordered = section.nodes.map((n) => n.task);
                return (
                  <div key={section.key}>
                    <div className="mb-1 flex items-center gap-2 px-2">
                      {groupBy === "project" && <ColorDot color={section.color} />}
                      {/* Sentence case at Label weight. Uppercase + tracking on every group
                          heading is the eyebrow pattern PRODUCT.md and DESIGN.md §8 both
                          reject by name; the ColorDot and count already do the work. */}
                      <h2 className="text-xs font-medium text-muted-foreground">
                        {section.label}
                      </h2>
                      <span className="text-xs text-muted-foreground/70">
                        {section.nodes.length}
                      </span>
                      {section.trackedSeconds > 0 && (
                        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                          {formatDurationShort(section.trackedSeconds)}
                        </span>
                      )}
                    </div>
                    <div className="divide-y rounded-md border">
                      {section.nodes.map((node, i) => renderNode(node, ordered, i, section))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          </>
          )}
        </div>
      )}

      <TaskDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        defaultDueDate={defaultDueDate}
      />

      <TaskSheet
        open={!!editTarget}
        // Reads the live row, not the click's snapshot — otherwise a save never visually reflects back into the sheet.
        task={editTarget && (tasks.find((t) => t.id === editTarget.id) ?? editTarget)}
        onClose={() => {
          setEditTarget(null);
          if (openTaskId) navigate("/tasks");
        }}
        onRequestDelete={setDeleteTarget}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete task?"
        description={
          deleteTarget?.subtaskTotal
            ? `"${deleteTarget.name}" and its ${deleteTarget.subtaskTotal} subtask${
                deleteTarget.subtaskTotal === 1 ? "" : "s"
              } will be permanently deleted. Time already tracked against them is kept.`
            : `"${deleteTarget?.name}" will be permanently deleted. This cannot be undone.`
        }
        onConfirm={() => {
          if (deleteTarget) deleteTask.mutate(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />
      </div>
    </div>
  );
}
