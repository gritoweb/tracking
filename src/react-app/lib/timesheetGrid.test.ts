import { describe, expect, it } from "vitest";
import { buildTimesheetGrid, rowKeyOf, timesheetDayTotals } from "./timesheetGrid";
import type { TimeEntry } from "@shared/schemas";

const WEEK_START = new Date(2026, 0, 12); // a Monday, local time

function makeEntry(overrides: Partial<TimeEntry> = {}): TimeEntry {
  return {
    id: "e1",
    workspaceId: "w1",
    userId: "u1",
    userName: "User",
    userEmail: null,
    userImage: null,
    projectId: "p1",
    projectName: "Project",
    projectColor: "#000000",
    clientName: null,
    taskId: null,
    taskName: null,
    description: "",
    start: "2026-01-12T14:00:00.000Z",
    stop: "2026-01-12T15:00:00.000Z",
    duration: 3600,
    billable: false,
    tags: [],
    syncStatus: null,
    externalId: null,
    syncedAt: null,
    syncError: null,
    calendarEventId: null,
    createdAt: "2026-01-12T14:00:00.000Z",
    updatedAt: "2026-01-12T14:00:00.000Z",
    ...overrides,
  };
}

describe("rowKeyOf", () => {
  it("joins project and task ids, tolerating either being null", () => {
    expect(rowKeyOf("p1", "t1")).toBe("p1__t1");
    expect(rowKeyOf(null, null)).toBe("__");
  });
});

describe("buildTimesheetGrid", () => {
  it("buckets an entry into its local weekday column", () => {
    const entry = makeEntry({ start: "2026-01-13T09:00:00", duration: 1800 });
    const { rows, cells } = buildTimesheetGrid([entry], [], WEEK_START);
    expect(rows).toHaveLength(1);
    const cell = cells.get(rows[0].key)![1]; // Tuesday
    expect(cell.seconds).toBe(1800);
    expect(cell.entries).toEqual([entry]);
  });

  it("drops an entry that falls outside the given week", () => {
    const entry = makeEntry({ start: "2026-01-20T09:00:00" }); // next week
    const { cells, rows } = buildTimesheetGrid([entry], [], WEEK_START);
    const totals = cells.get(rows[0].key)!.map((c) => c.seconds);
    expect(totals.every((s) => s === 0)).toBe(true);
  });

  it("sums same-day entries sharing a project/task row", () => {
    const a = makeEntry({ id: "a", start: "2026-01-12T09:00:00", duration: 1000 });
    const b = makeEntry({ id: "b", start: "2026-01-12T11:00:00", duration: 500 });
    const { rows, cells } = buildTimesheetGrid([a, b], [], WEEK_START);
    const cell = cells.get(rows[0].key)![0];
    expect(cell.seconds).toBe(1500);
    expect(cell.entries).toHaveLength(2);
  });

  it("includes manually-added empty rows with all-zero cells", () => {
    const extra = { key: "p2__", projectId: "p2", taskId: null, projectName: "Other", projectColor: null, taskName: null };
    const { rows, cells } = buildTimesheetGrid([], [extra], WEEK_START);
    expect(rows.map((r) => r.key)).toEqual(["p2__"]);
    expect(cells.get("p2__")!.every((c) => c.seconds === 0)).toBe(true);
  });

  it("sorts rows by project name then task name", () => {
    const a = makeEntry({ id: "a", projectId: "p-zeta", projectName: "Zeta", start: "2026-01-12T09:00:00" });
    const b = makeEntry({ id: "b", projectId: "p-alpha", projectName: "Alpha", start: "2026-01-12T09:00:00" });
    const { rows } = buildTimesheetGrid([a, b], [], WEEK_START);
    expect(rows.map((r) => r.projectName)).toEqual(["Alpha", "Zeta"]);
  });
});

describe("timesheetDayTotals", () => {
  it("sums every row's cell for each day", () => {
    const cells = new Map([
      ["row1", [{ seconds: 100, entries: [] }, { seconds: 0, entries: [] }]],
      ["row2", [{ seconds: 50, entries: [] }, { seconds: 25, entries: [] }]],
    ]);
    expect(timesheetDayTotals(cells)).toEqual([150, 25, 0, 0, 0, 0, 0]);
  });

  it("returns all zeros for no rows", () => {
    expect(timesheetDayTotals(new Map())).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });
});
