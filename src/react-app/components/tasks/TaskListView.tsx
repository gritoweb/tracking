import { Plus, ListChecks, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ColorDot } from "@/components/ColorDot";
import { TaskRow } from "./TaskRow";
import { QuickAddTask } from "./QuickAddTask";
import { formatDurationShort } from "@/lib/dateUtils";
import {
  DUE_FILTER_LABEL,
  type DueFilter,
  type GroupBy,
  type StatusFilter,
  type TaskNode,
  type TaskSection,
} from "@/lib/taskUtils";
import type { Task } from "@shared/schemas";

export type { TaskSection } from "@/lib/taskUtils";

interface TaskListViewProps {
  sections: TaskSection[];
  groupBy: GroupBy;
  isLoading: boolean;
  hasAnyTask: boolean;
  status: StatusFilter;
  dueFilter: DueFilter;
  defaultDueDate: string | null;
  collapsed: Set<string>;
  onToggleCollapsed: (id: string) => void;
  dragId: string | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDrop: (ordered: Task[], toIndex: number) => void;
  subtaskParent: string | null;
  onOpenSubtaskAdd: (id: string) => void;
  onCloseSubtaskAdd: () => void;
  onRequestDelete: (task: Task) => void;
  onEdit: (task: Task) => void;
  onLogTime: (task: Task) => void;
  onCreateTask: () => void;
  onClearFilters: () => void;
}

/** The List layout's grouped rows, empty states and inline quick-add — pure view. */
export function TaskListView({
  sections,
  groupBy,
  isLoading,
  hasAnyTask,
  status,
  dueFilter,
  defaultDueDate,
  collapsed,
  onToggleCollapsed,
  dragId,
  onDragStart,
  onDragEnd,
  onDrop,
  subtaskParent,
  onOpenSubtaskAdd,
  onCloseSubtaskAdd,
  onRequestDelete,
  onEdit,
  onLogTime,
  onCreateTask,
  onClearFilters,
}: TaskListViewProps) {
  if (isLoading) return null;

  const isEmpty = sections.length === 0;

  if (isEmpty) {
    if (!hasAnyTask) {
      return (
        <EmptyState
          icon={ListChecks}
          title="What do you plan to work on?"
          description="Create a task to start planning your projects, then start a timer on it in one click."
          className="py-24"
          action={
            <Button size="sm" className="gap-1.5" onClick={onCreateTask}>
              <Plus className="h-4 w-4" />
              Create a task
            </Button>
          }
        />
      );
    }
    const clauses = [
      status !== "all" ? (status === "done" ? "done" : "active") : null,
      dueFilter !== "all" ? DUE_FILTER_LABEL[dueFilter].toLowerCase() : null,
    ].filter(Boolean);
    return (
      <EmptyState
        icon={SearchX}
        title="No tasks match this filter"
        description={clauses.length ? `Showing ${clauses.join(", ")} tasks only.` : undefined}
        className="py-24"
        action={
          <Button size="sm" variant="outline" onClick={onClearFilters}>
            Clear filters
          </Button>
        }
      />
    );
  }

  const renderNode = (node: TaskNode, ordered: Task[], index: number, section: TaskSection) => {
    const open = !collapsed.has(node.task.id);
    const dragHandlers = section.reorderable
      ? {
          draggable: true,
          onDragStart: () => onDragStart(node.task.id),
          onDragEnd,
          onDragOver: (e: React.DragEvent) => e.preventDefault(),
          onDrop: (e: React.DragEvent) => {
            e.preventDefault();
            onDrop(ordered, index);
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
          onToggleExpanded={() => onToggleCollapsed(node.task.id)}
          onRequestDelete={onRequestDelete}
          onEdit={onEdit}
          onLogTime={onLogTime}
          onAddSubtask={(t) => onOpenSubtaskAdd(t.id)}
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
                onRequestDelete={onRequestDelete}
                onEdit={onEdit}
                onLogTime={onLogTime}
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
              onDone={onCloseSubtaskAdd}
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {hasAnyTask && <QuickAddTask className="mb-4" defaultDueDate={defaultDueDate} />}

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
                <h2 className="text-xs font-medium text-muted-foreground">{section.label}</h2>
                <span className="text-xs text-muted-foreground/70">{section.nodes.length}</span>
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
    </>
  );
}
