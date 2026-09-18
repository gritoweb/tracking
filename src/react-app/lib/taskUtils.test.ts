import { describe, expect, it } from "vitest";
import {
  buildTaskSections,
  clusterTasks,
  comparePlanned,
  dateToLocalDate,
  dueTone,
  formatDueDate,
  formatDueHeading,
  groupProjectsByClient,
  localDateToDate,
  matchesDueFilter,
  midpointOrder,
  nest,
  parseQuickAdd,
  withSubtasks,
} from "./taskUtils";
import type { Project, Task } from "@shared/schemas";

const TODAY = "2026-01-15"; // a Thursday

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    workspaceId: "w1",
    projectId: "p1",
    projectName: "Project",
    projectColor: "#000000",
    name: "Task",
    description: null,
    active: true,
    statusId: null,
    statusName: null,
    statusColor: null,
    statusCategory: null,
    estimatedSeconds: null,
    trackedSeconds: 0,
    dueDate: null,
    priority: 4,
    sortOrder: 0,
    boardOrder: 0,
    parentId: null,
    completedAt: null,
    recurRule: null,
    subtaskTotal: 0,
    subtaskDone: 0,
    commentCount: 0,
    assignees: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "p1",
    workspaceId: "w1",
    clientId: null,
    clientName: null,
    name: "Project",
    color: "#000000",
    billable: false,
    rate: null,
    active: true,
    startDate: null,
    endDate: null,
    estimatedHours: null,
    integrationId: null,
    externalProjectId: null,
    externalTaskId: null,
    trackedSeconds: 0,
    budgetSeconds: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("groupProjectsByClient", () => {
  it("groups projects under their client, clients alphabetical", () => {
    const projects = [
      makeProject({ id: "p1", clientId: "c2", clientName: "Zeta" }),
      makeProject({ id: "p2", clientId: "c1", clientName: "Acme" }),
    ];
    const groups = groupProjectsByClient(projects);
    expect(groups.map((g) => g.clientName)).toEqual(["Acme", "Zeta"]);
  });

  it("puts client-less projects last", () => {
    const projects = [
      makeProject({ id: "p1", clientId: null, clientName: null }),
      makeProject({ id: "p2", clientId: "c1", clientName: "Acme" }),
    ];
    const groups = groupProjectsByClient(projects);
    expect(groups.map((g) => g.clientName)).toEqual(["Acme", null]);
  });

  it("returns an empty list for no projects", () => {
    expect(groupProjectsByClient([])).toEqual([]);
  });
});

describe("matchesDueFilter", () => {
  it("'all' always matches", () => {
    expect(matchesDueFilter(makeTask(), "all", TODAY)).toBe(true);
  });

  it("'today' matches an active overdue task", () => {
    expect(matchesDueFilter(makeTask({ dueDate: "2026-01-10", active: true }), "today", TODAY)).toBe(true);
  });

  it("'today' matches an active task due exactly today", () => {
    expect(matchesDueFilter(makeTask({ dueDate: TODAY, active: true }), "today", TODAY)).toBe(true);
  });

  it("'today' excludes an active task due in the future", () => {
    expect(matchesDueFilter(makeTask({ dueDate: "2026-01-16", active: true }), "today", TODAY)).toBe(false);
  });

  it("'today' matches a task completed today regardless of due date", () => {
    const task = makeTask({ active: false, completedAt: `${TODAY}T10:00:00.000Z`, dueDate: null });
    expect(matchesDueFilter(task, "today", TODAY)).toBe(true);
  });

  it("'today' excludes a task completed on a different day", () => {
    const task = makeTask({ active: false, completedAt: "2026-01-14T10:00:00.000Z" });
    expect(matchesDueFilter(task, "today", TODAY)).toBe(false);
  });

  it("'upcoming' excludes undated and completed tasks", () => {
    expect(matchesDueFilter(makeTask({ dueDate: null }), "upcoming", TODAY)).toBe(false);
    expect(matchesDueFilter(makeTask({ active: false, dueDate: "2026-01-16" }), "upcoming", TODAY)).toBe(false);
  });

  it("'upcoming' excludes today itself and anything beyond 7 days", () => {
    expect(matchesDueFilter(makeTask({ dueDate: TODAY }), "upcoming", TODAY)).toBe(false);
    expect(matchesDueFilter(makeTask({ dueDate: "2026-01-23" }), "upcoming", TODAY)).toBe(false); // 8 days out
  });

  it("'upcoming' includes the next 7 days, boundary inclusive", () => {
    expect(matchesDueFilter(makeTask({ dueDate: "2026-01-16" }), "upcoming", TODAY)).toBe(true);
    expect(matchesDueFilter(makeTask({ dueDate: "2026-01-22" }), "upcoming", TODAY)).toBe(true); // exactly 7 days out
  });
});

describe("dueTone", () => {
  it("is null with no due date", () => {
    expect(dueTone(null, TODAY)).toBeNull();
  });

  it("classifies overdue, today, soon and later", () => {
    expect(dueTone("2026-01-14", TODAY)).toBe("overdue");
    expect(dueTone(TODAY, TODAY)).toBe("today");
    expect(dueTone("2026-01-22", TODAY)).toBe("soon"); // 7 days out, inclusive
    expect(dueTone("2026-01-23", TODAY)).toBe("later"); // 8 days out
  });
});

describe("formatDueDate", () => {
  it("labels today/tomorrow/yesterday", () => {
    expect(formatDueDate(TODAY, TODAY)).toBe("Today");
    expect(formatDueDate("2026-01-16", TODAY)).toBe("Tomorrow");
    expect(formatDueDate("2026-01-14", TODAY)).toBe("Yesterday");
  });

  it("uses a weekday name inside the coming week", () => {
    // 2026-01-19 is a Monday.
    expect(formatDueDate("2026-01-19", TODAY)).toBe("Monday");
  });

  it("uses day + month beyond the coming week, appending the year only when it differs", () => {
    expect(formatDueDate("2026-06-01", TODAY)).toBe("1 Jun");
    expect(formatDueDate("2027-06-01", TODAY)).toBe("1 Jun 2027");
  });
});

describe("formatDueHeading", () => {
  it("combines the relative label with the absolute date when they differ", () => {
    expect(formatDueHeading(TODAY, TODAY)).toBe("Today · Thu 15 Jan");
  });

  it("does not duplicate when the relative label already reads like the absolute one", () => {
    expect(formatDueHeading("2026-01-19", TODAY)).toBe("Monday · Mon 19 Jan");
  });
});

describe("localDateToDate / dateToLocalDate", () => {
  it("round-trips a local date string", () => {
    const date = localDateToDate("2026-03-05");
    expect(dateToLocalDate(date)).toBe("2026-03-05");
  });

  it("builds a Date at local midnight, not shifted by UTC", () => {
    const date = localDateToDate("2026-03-05");
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(2);
    expect(date.getDate()).toBe(5);
    expect(date.getHours()).toBe(0);
  });
});

describe("parseQuickAdd", () => {
  it("extracts a due date, priority and project hint, leaving the rest as the name", () => {
    const result = parseQuickAdd("Ship the release tomorrow p1 #website", TODAY);
    expect(result).toEqual({
      name: "Ship the release",
      dueDate: "2026-01-16",
      priority: 1,
      projectHint: "website",
    });
  });

  it("parses 'today' and relative day/week/month offsets", () => {
    expect(parseQuickAdd("today", TODAY).dueDate).toBe(TODAY);
    expect(parseQuickAdd("3d", TODAY).dueDate).toBe("2026-01-18");
    expect(parseQuickAdd("2w", TODAY).dueDate).toBe("2026-01-29");
  });

  it("resolves a weekday name to the next occurrence, never today", () => {
    // TODAY is Thursday; "thu" should resolve to next Thursday, not today.
    expect(parseQuickAdd("thu", TODAY).dueDate).toBe("2026-01-22");
  });

  it("accepts a bare ISO date token", () => {
    expect(parseQuickAdd("2026-02-01", TODAY).dueDate).toBe("2026-02-01");
  });

  it("only honors the first match of each kind, keeping later ones as text", () => {
    const result = parseQuickAdd("review p1 findings p2", TODAY);
    expect(result.priority).toBe(1);
    expect(result.name).toBe("review findings p2");
  });

  it("ignores a bare '#' with nothing after it", () => {
    expect(parseQuickAdd("fix bug #", TODAY)).toEqual({
      name: "fix bug #",
      dueDate: null,
      priority: null,
      projectHint: null,
    });
  });

  it("returns an empty name for blank input", () => {
    expect(parseQuickAdd("   ", TODAY).name).toBe("");
  });
});

describe("midpointOrder", () => {
  it("is 1 for an empty list", () => {
    expect(midpointOrder(null, null)).toBe(1);
  });

  it("goes before the first item, and after the last", () => {
    expect(midpointOrder(null, 5)).toBe(4);
    expect(midpointOrder(5, null)).toBe(6);
  });

  it("splits the midpoint between two neighbours", () => {
    expect(midpointOrder(2, 4)).toBe(3);
    expect(midpointOrder(1, 2)).toBe(1.5);
  });
});

describe("comparePlanned", () => {
  it("sorts undated tasks after dated ones, in either comparison direction", () => {
    const dated = makeTask({ id: "a", dueDate: TODAY });
    const undated = makeTask({ id: "b", dueDate: null });
    expect(comparePlanned(undated, dated)).toBeGreaterThan(0);
    expect(comparePlanned(dated, undated)).toBeLessThan(0);
  });

  it("sorts by due date first", () => {
    const earlier = makeTask({ id: "a", dueDate: "2026-01-15" });
    const later = makeTask({ id: "b", dueDate: "2026-01-16" });
    expect(comparePlanned(earlier, later)).toBeLessThan(0);
  });

  it("falls back to priority when due dates match", () => {
    const urgent = makeTask({ id: "a", dueDate: TODAY, priority: 1 });
    const low = makeTask({ id: "b", dueDate: TODAY, priority: 4 });
    expect(comparePlanned(urgent, low)).toBeLessThan(0);
  });

  it("falls back to sortOrder when due date and priority match", () => {
    const first = makeTask({ id: "a", dueDate: TODAY, priority: 2, sortOrder: 1 });
    const second = makeTask({ id: "b", dueDate: TODAY, priority: 2, sortOrder: 2 });
    expect(comparePlanned(first, second)).toBeLessThan(0);
  });
});

describe("clusterTasks", () => {
  it("returns a single flat cluster for 'status'/'none' or an empty list", () => {
    const tasks = [makeTask({ id: "a" })];
    expect(clusterTasks(tasks, "status", TODAY)).toEqual([{ key: "all", label: "", tasks }]);
    expect(clusterTasks([], "none", TODAY)).toEqual([]);
  });

  it("groups by project, preserving first-appearance order", () => {
    const tasks = [
      makeTask({ id: "a", projectId: "p2", projectName: "Beta" }),
      makeTask({ id: "b", projectId: "p1", projectName: "Alpha" }),
      makeTask({ id: "c", projectId: "p2", projectName: "Beta" }),
    ];
    const clusters = clusterTasks(tasks, "project", TODAY);
    expect(clusters.map((c) => c.label)).toEqual(["Beta", "Alpha"]);
    expect(clusters[0].tasks.map((t) => t.id)).toEqual(["a", "c"]);
  });

  it("labels a nameless project and a due-less bucket", () => {
    // Every task has a projectId (D3), but its name can still be missing.
    const byProject = clusterTasks([makeTask({ projectName: null })], "project", TODAY);
    expect(byProject[0].label).toBe("No project");
    const byDue = clusterTasks([makeTask({ dueDate: null })], "due", TODAY);
    expect(byDue[0].label).toBe("No due date");
  });
});

describe("withSubtasks", () => {
  it("re-attaches selected parents' subtasks from the full list", () => {
    const parent = makeTask({ id: "parent" });
    const child = makeTask({ id: "child", parentId: "parent" });
    const result = withSubtasks([parent], [parent, child]);
    expect(result.map((t) => t.id)).toEqual(["parent", "child"]);
  });

  it("does not duplicate a subtask already selected", () => {
    const parent = makeTask({ id: "parent" });
    const child = makeTask({ id: "child", parentId: "parent" });
    const result = withSubtasks([parent, child], [parent, child]);
    expect(result.map((t) => t.id)).toEqual(["parent", "child"]);
  });

  it("drops a child whose parent isn't selected", () => {
    const other = makeTask({ id: "other" });
    const orphan = makeTask({ id: "orphan", parentId: "missing-parent" });
    expect(withSubtasks([other], [other, orphan])).toEqual([other]);
  });

  it("is a no-op when nothing selected has children", () => {
    const solo = makeTask({ id: "solo" });
    expect(withSubtasks([solo], [solo])).toEqual([solo]);
  });
});

describe("buildTaskSections", () => {
  const base = { dueFilter: "all" as const, status: "all" as const, sortBy: "plan" as const, today: TODAY, statusOrder: [] };

  it("groups into a single 'All tasks' section when groupBy is 'none'", () => {
    const tasks = [makeTask({ id: "a" }), makeTask({ id: "b" })];
    const sections = buildTaskSections({ ...base, tasks, groupBy: "none" });
    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({ key: "all", label: "All tasks", reorderable: true });
    expect(sections[0].nodes).toHaveLength(2);
  });

  it("returns no sections for an empty ungrouped list", () => {
    expect(buildTaskSections({ ...base, tasks: [], groupBy: "none" })).toEqual([]);
  });

  it("groups by project, sorted by label, and marks the section reorderable only for plan order", () => {
    const tasks = [
      makeTask({ id: "a", projectId: "p2", projectName: "Zeta" }),
      makeTask({ id: "b", projectId: "p1", projectName: "Alpha" }),
    ];
    const sections = buildTaskSections({ ...base, tasks, groupBy: "project" });
    expect(sections.map((s) => s.label)).toEqual(["Alpha", "Zeta"]);
    expect(sections.every((s) => s.reorderable)).toBe(true);
    expect(buildTaskSections({ ...base, tasks, groupBy: "project", sortBy: "name" })[0].reorderable).toBe(false);
  });

  it("groups by status honoring the given column order, undefined ranks last", () => {
    const tasks = [
      makeTask({ id: "a", statusId: "s2", statusName: "Done" }),
      makeTask({ id: "b", statusId: "s1", statusName: "Todo" }),
    ];
    const sections = buildTaskSections({ ...base, tasks, groupBy: "status", statusOrder: ["s1", "s2"] });
    expect(sections.map((s) => s.key)).toEqual(["s1", "s2"]);
  });

  it("groups by due date chronologically, with 'none' last", () => {
    const tasks = [
      makeTask({ id: "a", dueDate: null }),
      makeTask({ id: "b", dueDate: "2026-01-20" }),
      makeTask({ id: "c", dueDate: "2026-01-16" }),
    ];
    const sections = buildTaskSections({ ...base, tasks, groupBy: "due" });
    expect(sections.map((s) => s.key)).toEqual(["2026-01-16", "2026-01-20", "none"]);
  });

  it("filters by status and due date before grouping", () => {
    const tasks = [
      makeTask({ id: "a", active: false, projectName: "P" }),
      makeTask({ id: "b", active: true, projectName: "P" }),
    ];
    const sections = buildTaskSections({ ...base, tasks, groupBy: "project", status: "active" });
    expect(sections[0].nodes.map((n) => n.task.id)).toEqual(["b"]);
  });

  it("sums tracked seconds without double-counting subtasks", () => {
    const parent = makeTask({ id: "p", trackedSeconds: 100, projectName: "P" });
    const tasks = [parent];
    const sections = buildTaskSections({ ...base, tasks, groupBy: "project" });
    expect(sections[0].trackedSeconds).toBe(100);
  });
});

describe("nest", () => {
  it("nests children under their parent, sorted by sortOrder", () => {
    const parent = makeTask({ id: "p" });
    const childB = makeTask({ id: "b", parentId: "p", sortOrder: 2 });
    const childA = makeTask({ id: "a", parentId: "p", sortOrder: 1 });
    const nodes = nest([parent, childB, childA], (x, y) => x.id.localeCompare(y.id));
    expect(nodes).toHaveLength(1);
    expect(nodes[0].children.map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("excludes subtasks from the top level", () => {
    const parent = makeTask({ id: "p" });
    const child = makeTask({ id: "c", parentId: "p" });
    const nodes = nest([parent, child], (x, y) => x.id.localeCompare(y.id));
    expect(nodes.map((n) => n.task.id)).toEqual(["p"]);
  });
});
