import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  formatDayHeader,
  formatStamp,
  formatDurationShort,
  formatFullDate,
  formatListRangeLabel,
  formatPeriodLabel,
  formatPlainDate,
  formatSeconds,
  formatShortDate,
  formatTimeInput,
  getDateRangePresets,
  getElapsedSeconds,
  isCalendarWeek,
  localDayKey,
  parseTimeInput,
  resolveListRange,
  summarizePeriod,
} from "./dateUtils";

// TZ is forced to America/Chicago (vitest.config.ts) and "now" is pinned below, so every local/isToday/isSameYear assertion here is deterministic.
const FIXED_NOW = new Date("2026-01-14T21:00:00.000Z"); // Wed 2026-01-14, 15:00 America/Chicago

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});
afterEach(() => vi.useRealTimers());

describe("formatSeconds", () => {
  it("pads to HH:MM:SS", () => {
    expect(formatSeconds(0)).toBe("00:00:00");
    expect(formatSeconds(59)).toBe("00:00:59");
    expect(formatSeconds(3661)).toBe("01:01:01");
  });
});

describe("formatDurationShort", () => {
  it("floors non-positive input to 0m", () => {
    expect(formatDurationShort(0)).toBe("0m");
    expect(formatDurationShort(-5)).toBe("0m");
  });

  it("shows raw seconds under a minute, so a real sub-minute entry isn't '0m'", () => {
    expect(formatDurationShort(1)).toBe("1s");
    expect(formatDurationShort(59)).toBe("59s");
  });

  it("shows minutes under an hour", () => {
    expect(formatDurationShort(60)).toBe("1m");
    expect(formatDurationShort(2700)).toBe("45m");
  });

  it("drops the trailing 0m on an exact hour", () => {
    expect(formatDurationShort(3600)).toBe("1h");
    expect(formatDurationShort(7200)).toBe("2h");
  });

  it("shows hours and minutes otherwise", () => {
    expect(formatDurationShort(5400)).toBe("1h 30m");
  });
});

describe("parseTimeInput", () => {
  it("returns null for empty/unparseable input", () => {
    expect(parseTimeInput("")).toBeNull();
    expect(parseTimeInput("   ")).toBeNull();
    expect(parseTimeInput("abc")).toBeNull();
  });

  it("parses HH:MM and HH:MM:SS", () => {
    expect(parseTimeInput("1:30")).toBe(5400);
    expect(parseTimeInput("1:30:15")).toBe(5415);
  });

  it("parses combinations of h/m/s", () => {
    expect(parseTimeInput("1h 30m")).toBe(5400);
    expect(parseTimeInput("1h30m")).toBe(5400);
    expect(parseTimeInput("2h")).toBe(7200);
    expect(parseTimeInput("90m")).toBe(5400);
    expect(parseTimeInput("30s")).toBe(30);
  });

  it("treats a bare number as minutes", () => {
    expect(parseTimeInput("45")).toBe(2700);
  });
});

describe("formatTimeInput", () => {
  it("is empty for null or zero", () => {
    expect(formatTimeInput(null)).toBe("");
    expect(formatTimeInput(0)).toBe("");
  });

  it("formats hours and minutes, omitting whichever is zero", () => {
    expect(formatTimeInput(3600)).toBe("1h");
    expect(formatTimeInput(1800)).toBe("30m");
    expect(formatTimeInput(5400)).toBe("1h 30m");
  });
});

describe("localDayKey", () => {
  it("buckets an instant by the viewer's local calendar date, not the UTC one", () => {
    // 04:30 UTC is still the previous evening in America/Chicago (UTC-6 in January).
    expect(localDayKey("2026-01-16T04:30:00.000Z")).toBe("2026-01-15");
  });

  it("agrees with the UTC date when local and UTC fall on the same day", () => {
    expect(localDayKey("2026-01-15T18:00:00.000Z")).toBe("2026-01-15");
  });
});

describe("formatDayHeader", () => {
  it("falls back to a weekday + date for a day that isn't today or yesterday", () => {
    // Fixed historical date - never "today" relative to the test run.
    expect(formatDayHeader("2020-05-01T18:00:00.000Z")).toBe("Friday, May 1");
  });
});

describe("isCalendarWeek", () => {
  it("is true for exactly one Monday-start week", () => {
    const mon = new Date(2026, 0, 12); // Mon
    const sun = new Date(2026, 0, 18); // Sun
    expect(isCalendarWeek(mon, sun, 1)).toBe(true);
  });

  it("is false for a range that isn't a full week", () => {
    const mon = new Date(2026, 0, 12);
    const sat = new Date(2026, 0, 17);
    expect(isCalendarWeek(mon, sat, 1)).toBe(false);
  });

  it("is false for a rolling 7-day window that doesn't start on the week boundary", () => {
    const tue = new Date(2026, 0, 13);
    const nextMon = new Date(2026, 0, 19);
    expect(isCalendarWeek(tue, nextMon, 1)).toBe(false);
  });
});

describe("formatPeriodLabel", () => {
  it("renders a single day as itself", () => {
    const day = new Date(2020, 4, 1);
    expect(formatPeriodLabel(day, day)).toBe("Fri, May 1, 2020");
  });

  it("renders a same-month range compactly", () => {
    const since = new Date(2026, 6, 14);
    const until = new Date(2026, 6, 20);
    expect(formatPeriodLabel(since, until, { weekStamp: false })).toBe("Jul 14 – 20");
  });

  it("spells out the end month for a cross-month range", () => {
    const since = new Date(2026, 5, 30);
    const until = new Date(2026, 6, 6);
    expect(formatPeriodLabel(since, until, { weekStamp: false })).toBe("Jun 30 – Jul 6");
  });

  it("appends the week number when asked", () => {
    const since = new Date(2026, 6, 14); // ISO week 29
    const until = new Date(2026, 6, 20);
    expect(formatPeriodLabel(since, until)).toBe("Jul 14 – 20 · W29");
  });
});

describe("formatFullDate / formatShortDate / formatPlainDate", () => {
  it("formats a full date, appending the year only outside the current year", () => {
    expect(formatFullDate("2020-05-01T12:00:00.000Z")).toBe("Fri, May 1, 2020");
  });

  it("formats a short month/day date", () => {
    expect(formatShortDate("2026-05-01T12:00:00.000Z")).toBe("May 1");
  });

  it("anchors a bare YYYY-MM-DD to noon so it never shifts a day", () => {
    expect(formatPlainDate("2026-05-01")).toBe("May 1, 2026");
  });
});

describe("getElapsedSeconds", () => {
  it("is the whole-second difference from now", () => {
    vi.setSystemTime(new Date("2026-01-15T12:00:30.000Z"));
    expect(getElapsedSeconds("2026-01-15T12:00:00.000Z")).toBe(30);
  });
});

describe("getDateRangePresets", () => {
  it("bounds 'today' to local midnight-to-midnight", () => {
    const { today } = getDateRangePresets();
    expect(today.since).toBe("2026-01-14T06:00:00.000Z");
    expect(today.until).toBe("2026-01-15T05:59:59.999Z");
  });

  it("bounds 'thisWeek' to Monday-Sunday", () => {
    const { thisWeek } = getDateRangePresets();
    expect(thisWeek.since).toBe("2026-01-12T06:00:00.000Z"); // Monday local midnight
    expect(thisWeek.until).toBe("2026-01-19T05:59:59.999Z"); // Sunday local end-of-day
  });
});

describe("resolveListRange", () => {
  const now = new Date(2026, 0, 14); // Wed, local

  it("'all' floors at the year-2000 constant and runs through today", () => {
    const { since, until } = resolveListRange("all", null, null, 1, now);
    expect(since.getFullYear()).toBe(2000);
    expect(until.getDate()).toBe(14);
  });

  it("'thisWeek'/'lastWeek' honor the workspace's weekStart", () => {
    const sundayStart = resolveListRange("thisWeek", null, null, 0, now);
    expect(sundayStart.since.getDay()).toBe(0);
    const mondayStart = resolveListRange("thisWeek", null, null, 1, now);
    expect(mondayStart.since.getDay()).toBe(1);
  });

  it("falls back to today on the missing side of a half-filled custom range", () => {
    const { since } = resolveListRange("custom", null, "2026-01-20", 1, now);
    expect(since.getDate()).toBe(now.getDate());
  });

  it("swaps an inverted custom range instead of returning empty", () => {
    const { since, until } = resolveListRange("custom", "2026-01-20", "2026-01-10", 1, now);
    expect(since.getDate()).toBe(10);
    expect(until.getDate()).toBe(20);
  });
});

describe("formatListRangeLabel", () => {
  it("has no span for 'all'", () => {
    expect(formatListRangeLabel("all", new Date(2000, 0, 1), new Date(2026, 0, 1))).toBe("All dates");
  });

  it("reads as a day header for a single-day range", () => {
    const day = new Date(2020, 4, 1);
    expect(formatListRangeLabel("thisWeek", day, day)).toBe("Friday, May 1");
  });

  it("stamps the ISO week only for a genuine calendar week", () => {
    const mon = new Date(2026, 0, 12);
    const sun = new Date(2026, 0, 18);
    expect(formatListRangeLabel("thisWeek", mon, sun, 1)).toBe("Jan 12 – 18 · W3");
  });
});

describe("summarizePeriod", () => {
  it("names today/yesterday relative to now", () => {
    const day = new Date(2026, 0, 14);
    expect(summarizePeriod(day, day, 1)).toBe("today");
  });

  it("names 'this week' / 'last week' relative to now", () => {
    const thisMon = new Date(2026, 0, 12);
    const thisSun = new Date(2026, 0, 18);
    expect(summarizePeriod(thisMon, thisSun, 1)).toBe("this week");

    const lastMon = new Date(2026, 0, 5);
    const lastSun = new Date(2026, 0, 11);
    expect(summarizePeriod(lastMon, lastSun, 1)).toBe("last week");
  });

  it("names a whole calendar month relative to now", () => {
    const start = new Date(2026, 0, 1);
    const end = new Date(2026, 0, 31);
    expect(summarizePeriod(start, end, 1)).toBe("this month");
  });

  it("falls back to an explicit range for anything else", () => {
    const since = new Date(2026, 0, 3);
    const until = new Date(2026, 0, 9);
    expect(summarizePeriod(since, until, 1)).toBe("Jan 3 – 9");
  });
});

describe("formatStamp (ClickUp's comment/activity time)", () => {
  const now = new Date(2026, 8, 24, 9, 42);
  it("says Just now inside the first minute", () => {
    expect(formatStamp(new Date(2026, 8, 24, 9, 41, 30).toISOString(), "12h", now)).toBe("Just now");
  });
  it("gives the day and a lowercase am/pm time in 12h", () => {
    expect(formatStamp(new Date(2026, 8, 22, 12, 1).toISOString(), "12h", now)).toBe("Sep 22 at 12:01 pm");
  });
  it("gives a 24h time when that's the person's preference", () => {
    expect(formatStamp(new Date(2026, 8, 22, 12, 1).toISOString(), "24h", now)).toBe("Sep 22 at 12:01");
  });
  it("adds the year once it isn't this one", () => {
    expect(formatStamp(new Date(2025, 11, 31, 18, 5).toISOString(), "12h", now)).toBe("Dec 31, 2025 at 6:05 pm");
  });
});
