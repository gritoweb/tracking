import { describe, expect, it } from "vitest";
import { matchListRangeKey, parseDateParam, resolveTimerPeriod, summarizeLoggedSegments } from "./timerPeriod";
import type { TimeEntry } from "@shared/schemas";

const TODAY = new Date(2026, 0, 15); // a Thursday, local time

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
    projectColor: "#ff0000",
    clientName: null,
    taskId: null,
    taskName: null,
    description: "",
    start: "2026-01-15T09:00:00.000Z",
    stop: "2026-01-15T10:00:00.000Z",
    duration: 3600,
    billable: false,
    tags: [],
    syncStatus: null,
    externalId: null,
    syncedAt: null,
    syncError: null,
    calendarEventId: null,
    createdAt: "2026-01-15T09:00:00.000Z",
    updatedAt: "2026-01-15T09:00:00.000Z",
    ...overrides,
  };
}

describe("resolveTimerPeriod", () => {
  const base = {
    isListView: false,
    isMonthView: false,
    isDayView: false,
    listRangeKey: "thisWeek" as const,
    listRangeSince: null,
    listRangeUntil: null,
    weekStartsOn: 1 as const,
    today: TODAY,
    anchor: TODAY,
  };

  it("scopes by month when the month view is active", () => {
    const { since, until } = resolveTimerPeriod({ ...base, isMonthView: true });
    expect(since.getDate()).toBe(1);
    expect(until.getMonth()).toBe(0);
  });

  it("scopes by the single day when the day view is active", () => {
    const { since, until } = resolveTimerPeriod({ ...base, isDayView: true });
    expect(since.getDate()).toBe(15);
    expect(until.getDate()).toBe(15);
  });

  it("scopes by the anchor's week otherwise", () => {
    const { since, until } = resolveTimerPeriod(base);
    expect(since.getDay()).toBe(1); // Monday
    expect(until.getDay()).toBe(0); // Sunday
  });

  it("scopes by the persisted list range when the list view is active", () => {
    const { since, until } = resolveTimerPeriod({ ...base, isListView: true, listRangeKey: "today" });
    expect(since.getDate()).toBe(15);
    expect(until.getDate()).toBe(15);
  });
});

describe("summarizeLoggedSegments", () => {
  it("sums durations per project, largest first", () => {
    const entries = [
      makeEntry({ projectId: "a", projectName: "A", duration: 100 }),
      makeEntry({ projectId: "b", projectName: "B", duration: 300 }),
      makeEntry({ projectId: "a", projectName: "A", duration: 50 }),
    ];
    const { periodSeconds, segments } = summarizeLoggedSegments(entries);
    expect(periodSeconds).toBe(450);
    expect(segments.map((s) => s.projectId)).toEqual(["b", "a"]);
    expect(segments[1].seconds).toBe(150);
  });

  it("ignores entries with no or zero duration (a running timer)", () => {
    const entries = [makeEntry({ duration: null }), makeEntry({ duration: 0 })];
    expect(summarizeLoggedSegments(entries)).toEqual({ periodSeconds: 0, segments: [] });
  });

  it("falls back to the default color for a project-less entry", () => {
    const entries = [makeEntry({ projectId: null, projectName: null, projectColor: null, duration: 60 })];
    const { segments } = summarizeLoggedSegments(entries);
    expect(segments[0].color).toBeTruthy();
  });
});

describe("matchListRangeKey", () => {
  const wso = 1 as const;

  it("names the range 'thisWeek' when it matches exactly", () => {
    const { since, until } = resolveTimerPeriod({
      isListView: false,
      isMonthView: false,
      isDayView: false,
      listRangeKey: "thisWeek",
      listRangeSince: null,
      listRangeUntil: null,
      weekStartsOn: wso,
      today: TODAY,
      anchor: TODAY,
    });
    expect(matchListRangeKey(since, until, wso, TODAY)).toEqual({ key: "thisWeek" });
  });

  it("falls back to a custom range with formatted dates otherwise", () => {
    const since = new Date(2026, 2, 1);
    const until = new Date(2026, 2, 5);
    expect(matchListRangeKey(since, until, wso, TODAY)).toEqual({
      key: "custom",
      since: "2026-03-01",
      until: "2026-03-05",
    });
  });
});

describe("parseDateParam", () => {
  it("reads a YYYY-MM-DD value as that local day", () => {
    const date = parseDateParam("2026-09-18");
    expect(date && [date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2026, 8, 18]);
  });

  it("rejects missing, malformed and impossible values", () => {
    expect(parseDateParam(null)).toBeNull();
    expect(parseDateParam("")).toBeNull();
    expect(parseDateParam("18/09/2026")).toBeNull();
    expect(parseDateParam("2026-02-31")).toBeNull();
  });
});
