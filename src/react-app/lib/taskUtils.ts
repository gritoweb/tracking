import {
  addLocalDays,
  compareLocalDates,
  isLocalDate,
  localWeekday,
  todayLocalDate,
} from "@shared/task-recurrence";
import type { Project, Task, TaskStatusCategory } from "@shared/schemas";

// ─── Priority ────────────────────────────────────────────────────────────────

/**
 * Only P1 and P2 carry colour.
 *
 * Priority renders as a tint on the done-toggle's ring — the element already at
 * the row's leading edge, which is both where the eye lands and the one spot
 * that isn't a `border-left` accent stripe (a named ban in DESIGN.md §8).
 * Letting all four levels colour it would put a saturated marker on every row
 * and spend the One Accent Rule on decoration; P3 and P4 stay neutral, and P4
 * is the default, so most rows show nothing at all.
 */
export const PRIORITY_RING: Record<number, string> = {
  1: "border-destructive text-destructive",
  2: "border-warning text-warning",
  3: "border-muted-foreground/60",
  4: "border-muted-foreground/40",
};

export const PRIORITY_LABEL: Record<number, string> = {
  1: "Urgent",
  2: "High",
  3: "Normal",
  4: "None",
};

export const PRIORITIES = [1, 2, 3, 4] as const;

// ─── Project grouping (task rail) ───────────────────────────────────────────

/** Projects bucketed under their client, clients alphabetical; client-less projects come last. */
export interface ProjectClientGroup {
  clientId: string | null;
  clientName: string | null;
  projects: Project[];
}

export function groupProjectsByClient(projects: Project[]): ProjectClientGroup[] {
  const byClient = new Map<string, Project[]>();
  for (const project of projects) {
    const client = project.clientName ?? "";
    byClient.set(client, [...(byClient.get(client) ?? []), project]);
  }
  return [...byClient.entries()]
    .sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)))
    .map(([clientName, group]) => ({
      clientId: group[0]?.clientId ?? null,
      clientName: clientName || null,
      projects: group,
    }));
}

// ─── Status categories ───────────────────────────────────────────────────────

/** A status category, in the workspace's own words. Only `completed` is behaviour. */
export const STATUS_CATEGORY_LABEL: Record<TaskStatusCategory, string> = {
  not_started: "Not started",
  active: "Active",
  completed: "Completed",
};

// ─── Due-date filter ─────────────────────────────────────────────────────────

export type DueFilter = "all" | "today" | "upcoming";

export const DUE_FILTER_LABEL: Record<DueFilter, string> = {
  all: "All dates",
  today: "Today",
  upcoming: "Upcoming",
};

/** Overdue and just-completed both count as "today"; "upcoming" is the next 7 days. */
export function matchesDueFilter(task: Task, filter: DueFilter, today: string): boolean {
  if (filter === "all") return true;
  if (filter === "today") {
    if (task.active) return !!task.dueDate && compareLocalDates(task.dueDate, today) <= 0;
    return !!task.completedAt && task.completedAt.slice(0, 10) === today;
  }
  if (!task.active || !task.dueDate) return false;
  return (
    compareLocalDates(task.dueDate, today) > 0 &&
    compareLocalDates(task.dueDate, addLocalDays(today, 7)) <= 0
  );
}

// ─── Due dates ───────────────────────────────────────────────────────────────

const WEEKDAY_LONG = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export type DueTone = "overdue" | "today" | "soon" | "later";

export function dueTone(dueDate: string | null, today = todayLocalDate()): DueTone | null {
  if (!dueDate) return null;
  const delta = compareLocalDates(dueDate, today);
  if (delta < 0) return "overdue";
  if (delta === 0) return "today";
  return compareLocalDates(dueDate, addLocalDays(today, 7)) <= 0 ? "soon" : "later";
}

/** "Overdue" / "Today" / "Tomorrow" / "Thursday" / "12 Mar". */
export function formatDueDate(dueDate: string, today = todayLocalDate()): string {
  if (dueDate === today) return "Today";
  if (dueDate === addLocalDays(today, 1)) return "Tomorrow";
  if (dueDate === addLocalDays(today, -1)) return "Yesterday";
  // Inside the coming week a weekday name is more useful than a number — it's
  // how someone actually plans ("I'll do it Thursday").
  if (compareLocalDates(dueDate, today) > 0 && compareLocalDates(dueDate, addLocalDays(today, 7)) < 0) {
    return WEEKDAY_LONG[localWeekday(dueDate)];
  }
  const [y, m, d] = dueDate.split("-").map(Number);
  const thisYear = Number(today.slice(0, 4));
  return `${d} ${MONTHS[m - 1]}${y === thisYear ? "" : ` ${y}`}`;
}

/** Heading for one day of the Upcoming list — "Today · Mon 3 Mar". */
export function formatDueHeading(dueDate: string, today = todayLocalDate()): string {
  const [, m, d] = dueDate.split("-").map(Number);
  const rel = formatDueDate(dueDate, today);
  const abs = `${WEEKDAY_LONG[localWeekday(dueDate)].slice(0, 3)} ${d} ${MONTHS[m - 1]}`;
  return rel === abs ? abs : `${rel} · ${abs}`;
}

/** Convert a local date string into a Date at local midnight (for the picker). */
export function localDateToDate(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function dateToLocalDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// ─── Quick-add parsing ───────────────────────────────────────────────────────

export interface ParsedQuickAdd {
  name: string;
  dueDate: string | null;
  priority: number | null;
  /** Matched `#project` text, lowercased — resolved against real projects by the caller. */
  projectHint: string | null;
}

const WEEKDAY_TOKENS: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};

/**
 * Parse date and priority tokens out of a quick-add line — `tomorrow`, `fri`,
 * `3d`, `p1`, `#project`.
 *
 * **Deliberately deterministic, with no AI round-trip.** Capture has to be
 * instant and repeatable: the same words must always produce the same task, and
 * a model that is usually right is a worse trade here than a small vocabulary
 * that is always right. The same reasoning keeps AI out of `lib/pacing.ts`. The
 * AI path already exists for *entries* (`/api/ai/quick-entry`) where the input
 * is a free-form sentence rather than a line the user is typing by muscle memory.
 */
export function parseQuickAdd(input: string, today = todayLocalDate()): ParsedQuickAdd {
  let dueDate: string | null = null;
  let priority: number | null = null;
  let projectHint: string | null = null;

  const kept: string[] = [];
  for (const raw of input.split(/\s+/)) {
    if (!raw) continue;
    const token = raw.toLowerCase();

    // Only the *first* match of each kind wins, so a task literally named
    // "review p1 findings" keeps its second "p1" as text.
    if (priority === null && /^p[1-4]$/.test(token)) {
      priority = Number(token[1]);
      continue;
    }
    if (dueDate === null) {
      if (token === "today") { dueDate = today; continue; }
      if (token === "tomorrow" || token === "tmr") { dueDate = addLocalDays(today, 1); continue; }
      if (token in WEEKDAY_TOKENS) {
        // The *next* such weekday, never today — "fri" typed on a Friday means
        // the coming Friday, which is the only reading that isn't ambiguous.
        const want = WEEKDAY_TOKENS[token];
        for (let i = 1; i <= 7; i++) {
          const candidate = addLocalDays(today, i);
          if (localWeekday(candidate) === want) { dueDate = candidate; break; }
        }
        continue;
      }
      const rel = /^(\d{1,3})([dwm])$/.exec(token);
      if (rel) {
        const n = Number(rel[1]);
        dueDate = addLocalDays(today, rel[2] === "d" ? n : rel[2] === "w" ? n * 7 : n * 30);
        continue;
      }
      if (isLocalDate(token)) { dueDate = token; continue; }
    }
    if (projectHint === null && token.startsWith("#") && token.length > 1) {
      projectHint = token.slice(1);
      continue;
    }
    kept.push(raw);
  }

  return { name: kept.join(" ").trim(), dueDate, priority, projectHint };
}

// ─── Ordering ────────────────────────────────────────────────────────────────

/**
 * Fractional index between two neighbours, so a drag rewrites **one** row.
 * `null` on either side means "the end of the list in that direction".
 */
export function midpointOrder(before: number | null, after: number | null): number {
  if (before === null && after === null) return 1;
  if (before === null) return after! - 1;
  if (after === null) return before + 1;
  return (before + after) / 2;
}

/**
 * Plan order within a section: overdue first, then by due date, then priority,
 * then the manual sequence. Undated tasks sort after dated ones — an undated
 * task is explicitly *not* scheduled, so it should never outrank one that is.
 */
export function comparePlanned(a: Task, b: Task): number {
  if (a.dueDate !== b.dueDate) {
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return compareLocalDates(a.dueDate, b.dueDate);
  }
  if (a.priority !== b.priority) return a.priority - b.priority;
  return a.sortOrder - b.sortOrder;
}

// ─── Status/sort filters (List and Board share these) ───────────────────────

export type StatusFilter = "all" | "active" | "done";
export type SortBy = "name" | "estimate" | "tracked" | "recent" | "plan";
export type GroupBy = "project" | "status" | "due" | "none";

export const SORTERS: Record<SortBy, (a: Task, b: Task) => number> = {
  plan: comparePlanned,
  name: (a, b) => a.name.localeCompare(b.name),
  estimate: (a, b) => (b.estimatedSeconds ?? 0) - (a.estimatedSeconds ?? 0),
  tracked: (a, b) => b.trackedSeconds - a.trackedSeconds,
  recent: (a, b) => b.createdAt.localeCompare(a.createdAt),
};

export interface TaskCluster {
  key: string;
  /** Empty string means "don't render a sub-header" — the flat, ungrouped case. */
  label: string;
  tasks: Task[];
}

/**
 * Buckets an already-sorted list into labeled clusters, order preserved by
 * first appearance. Used by the Board to sub-group a column's own cards —
 * a lighter version of the List's own section grouping, since a column
 * already carries its own status.
 */
export function clusterTasks(tasks: Task[], groupBy: GroupBy, today: string): TaskCluster[] {
  if (groupBy === "status" || groupBy === "none" || !tasks.length) {
    return tasks.length ? [{ key: "all", label: "", tasks }] : [];
  }
  const order: string[] = [];
  const map = new Map<string, TaskCluster>();
  for (const task of tasks) {
    const key = groupBy === "project" ? task.projectId ?? "none" : task.dueDate ?? "none";
    const label =
      groupBy === "project"
        ? task.projectName ?? "No project"
        : task.dueDate
          ? formatDueHeading(task.dueDate, today)
          : "No due date";
    let cluster = map.get(key);
    if (!cluster) {
      cluster = { key, label, tasks: [] };
      map.set(key, cluster);
      order.push(key);
    }
    cluster.tasks.push(task);
  }
  return order.map((key) => map.get(key)!);
}

/**
 * Group subtasks under their parents, dropping any child whose parent isn't in
 * the same list. A subtask rendered as a top-level row loses the only context
 * that made it readable.
 */
export interface TaskNode {
  task: Task;
  children: Task[];
}

/**
 * Re-attach the subtasks of every selected parent, drawn from the full list.
 *
 * The dated views select on `due_date`, and a subtask doesn't have one — it is
 * due when its parent is. Without this a parent in Today rendered "0/3" over an
 * empty disclosure: the count said three children existed and the list showed
 * none, which reads as a broken component rather than a filter.
 */
export function withSubtasks(selected: Task[], all: Task[]): Task[] {
  const ids = new Set(selected.filter((t) => !t.parentId).map((t) => t.id));
  if (!ids.size) return selected;
  const have = new Set(selected.map((t) => t.id));
  return [
    ...selected,
    ...all.filter((t) => t.parentId && ids.has(t.parentId) && !have.has(t.id)),
  ];
}

export function nest(tasks: Task[], compare: (a: Task, b: Task) => number): TaskNode[] {
  const children = new Map<string, Task[]>();
  for (const t of tasks) {
    if (!t.parentId) continue;
    const list = children.get(t.parentId) ?? [];
    list.push(t);
    children.set(t.parentId, list);
  }
  return tasks
    .filter((t) => !t.parentId)
    .sort(compare)
    .map((task) => ({
      task,
      children: (children.get(task.id) ?? []).sort((a, b) => a.sortOrder - b.sortOrder),
    }));
}
