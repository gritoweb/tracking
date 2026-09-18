import { Plus, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  DUE_FILTER_LABEL,
  type DueFilter,
  type GroupBy,
  type SortBy,
  type StatusFilter,
} from "@/lib/taskUtils";

type Layout = "board" | "list";

const LAYOUT_OPTIONS = [
  { value: "board" as const, label: "Board" },
  { value: "list" as const, label: "List" },
];
const DUE_FILTER_OPTIONS: DueFilter[] = ["all", "today", "upcoming"];

interface TaskBoardListToolbarProps {
  layout: Layout;
  onLayoutChange: (layout: Layout) => void;
  dueFilter: DueFilter;
  onDueFilterChange: (filter: DueFilter) => void;
  assignedToMe: boolean;
  onToggleAssignedToMe: () => void;
  status: StatusFilter;
  onStatusChange: (status: StatusFilter) => void;
  groupBy: GroupBy;
  onGroupByChange: (groupBy: GroupBy) => void;
  sortBy: SortBy;
  onSortByChange: (sortBy: SortBy) => void;
  hasAnyTask: boolean;
  onAddTask: () => void;
}

/** The Tasks page filter/sort/layout strip inside `CollectionHeader` — pure view. */
export function TaskBoardListToolbar({
  layout,
  onLayoutChange,
  dueFilter,
  onDueFilterChange,
  assignedToMe,
  onToggleAssignedToMe,
  status,
  onStatusChange,
  groupBy,
  onGroupByChange,
  sortBy,
  onSortByChange,
  hasAnyTask,
  onAddTask,
}: TaskBoardListToolbarProps) {
  return (
    <>
      <SegmentedControl value={layout} options={LAYOUT_OPTIONS} onChange={onLayoutChange} label="Task layout" />

      <Select value={dueFilter} onValueChange={(v) => onDueFilterChange(v as DueFilter)}>
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
        onClick={onToggleAssignedToMe}
      >
        <User className="h-3.5 w-3.5" />
        Assigned to me
      </Button>

      <div className="mx-1 h-5 w-px bg-border" aria-hidden />

      <Select value={status} onValueChange={(v) => onStatusChange(v as StatusFilter)}>
        <SelectTrigger size="sm" className="w-28" aria-label="Filter by status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="done">Done</SelectItem>
        </SelectContent>
      </Select>

      <Select value={groupBy} onValueChange={(v) => onGroupByChange(v as GroupBy)}>
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

      <Select value={sortBy} onValueChange={(v) => onSortByChange(v as SortBy)}>
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
        <Button size="sm" className="gap-1.5" onClick={onAddTask}>
          <Plus className="h-4 w-4" />
          Add task
        </Button>
      )}
    </>
  );
}
