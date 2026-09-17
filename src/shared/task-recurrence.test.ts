import { describe, expect, it } from "vitest";
import {
  addLocalDays,
  compareLocalDates,
  describeRecurRule,
  isLocalDate,
  localWeekday,
  nextOccurrence,
  normalizeRecurRule,
  parseRecurRule,
  todayLocalDate,
} from "./task-recurrence";

describe("isLocalDate", () => {
  it("accepts a well-formed calendar date", () => {
    expect(isLocalDate("2026-03-15")).toBe(true);
  });

  it.each(["", "2026-3-15", "2026/03/15", "not-a-date", "2026-13-01"])("rejects %s", (value) => {
    expect(isLocalDate(value)).toBe(false);
  });

  it("does not validate calendar correctness, only the pattern and parseability - 2026-02-30 rolls over rather than being rejected", () => {
    expect(isLocalDate("2026-02-30")).toBe(true);
  });
});

describe("parseRecurRule", () => {
  it("returns null for an empty/undefined/null rule", () => {
    expect(parseRecurRule(null)).toBeNull();
    expect(parseRecurRule(undefined)).toBeNull();
    expect(parseRecurRule("")).toBeNull();
  });

  it("returns null for an unrecognised kind", () => {
    expect(parseRecurRule("yearly:1")).toBeNull();
  });

  it("parses daily and weekdays with fixed day sets", () => {
    expect(parseRecurRule("daily")).toEqual({ kind: "daily", daysOfWeek: [], dayOfMonth: 1 });
    expect(parseRecurRule("weekdays")).toEqual({ kind: "weekdays", daysOfWeek: [1, 2, 3, 4, 5], dayOfMonth: 1 });
  });

  it("dedupes and sorts weekly days regardless of input order", () => {
    expect(parseRecurRule("weekly:5,1,3,1")).toEqual({ kind: "weekly", daysOfWeek: [1, 3, 5], dayOfMonth: 1 });
  });

  it("drops out-of-range/non-numeric weekly days, and returns null if none remain", () => {
    expect(parseRecurRule("weekly:9,-1,abc")).toBeNull();
    expect(parseRecurRule("weekly:9,3")).toEqual({ kind: "weekly", daysOfWeek: [3], dayOfMonth: 1 });
  });

  it("parses a valid monthly day of month", () => {
    expect(parseRecurRule("monthly:31")).toEqual({ kind: "monthly", daysOfWeek: [], dayOfMonth: 31 });
  });

  it("rejects a monthly day outside 1-31", () => {
    expect(parseRecurRule("monthly:0")).toBeNull();
    expect(parseRecurRule("monthly:32")).toBeNull();
    expect(parseRecurRule("monthly:abc")).toBeNull();
  });
});

describe("normalizeRecurRule", () => {
  it("round-trips every kind through parse", () => {
    expect(normalizeRecurRule("daily")).toBe("daily");
    expect(normalizeRecurRule("weekdays")).toBe("weekdays");
    expect(normalizeRecurRule("weekly:5,1,3")).toBe("weekly:1,3,5");
    expect(normalizeRecurRule("monthly:15")).toBe("monthly:15");
  });

  it("returns null for an unusable rule", () => {
    expect(normalizeRecurRule("bogus")).toBeNull();
    expect(normalizeRecurRule(null)).toBeNull();
  });
});

describe("addLocalDays / localWeekday / compareLocalDates", () => {
  it("adds and subtracts local days across a month boundary", () => {
    expect(addLocalDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addLocalDays("2026-02-01", -1)).toBe("2026-01-31");
  });

  it("adds across a year boundary", () => {
    expect(addLocalDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("reports the correct weekday for a known date", () => {
    // 2026-03-15 is a Sunday.
    expect(localWeekday("2026-03-15")).toBe(0);
    expect(localWeekday("2026-03-16")).toBe(1);
  });

  it("compares dates lexically as calendar order", () => {
    expect(compareLocalDates("2026-01-01", "2026-01-02")).toBeLessThan(0);
    expect(compareLocalDates("2026-01-02", "2026-01-01")).toBeGreaterThan(0);
    expect(compareLocalDates("2026-01-01", "2026-01-01")).toBe(0);
  });
});

describe("todayLocalDate", () => {
  it("formats an injected Date as YYYY-MM-DD in its own local fields", () => {
    expect(todayLocalDate(new Date(2026, 2, 5))).toBe("2026-03-05");
  });

  it("pads single-digit month and day", () => {
    expect(todayLocalDate(new Date(2026, 0, 9))).toBe("2026-01-09");
  });
});

describe("nextOccurrence", () => {
  it("returns null for an unusable rule or date", () => {
    expect(nextOccurrence("bogus", "2026-01-01")).toBeNull();
    expect(nextOccurrence("daily", "not-a-date")).toBeNull();
  });

  it("daily is always the next calendar day", () => {
    expect(nextOccurrence("daily", "2026-01-31")).toBe("2026-02-01");
  });

  it("weekdays completed on Friday spawns Monday", () => {
    // 2026-01-16 is a Friday.
    expect(nextOccurrence("weekdays", "2026-01-16")).toBe("2026-01-19");
  });

  it("weekly picks the next matching day, wrapping to next week if needed", () => {
    // 2026-01-16 is a Friday; weekly Mon/Wed -> next is Monday 2026-01-19.
    expect(nextOccurrence("weekly:1,3", "2026-01-16")).toBe("2026-01-19");
  });

  it("monthly stays in the current month when the target day is still ahead", () => {
    expect(nextOccurrence("monthly:20", "2026-01-05")).toBe("2026-01-20");
  });

  it("monthly rolls to next month once the target day has passed", () => {
    expect(nextOccurrence("monthly:5", "2026-01-05")).toBe("2026-02-05");
  });

  it("monthly clamps the 31st to the shorter month, both non-leap and leap February", () => {
    expect(nextOccurrence("monthly:31", "2026-01-01")).toBe("2026-01-31");
    expect(nextOccurrence("monthly:31", "2026-01-31")).toBe("2026-02-28"); // 2026 is not a leap year
    expect(nextOccurrence("monthly:31", "2028-01-31")).toBe("2028-02-29"); // 2028 is a leap year
  });

  it("monthly rolls December into January of the next year", () => {
    expect(nextOccurrence("monthly:15", "2026-12-15")).toBe("2027-01-15");
  });
});

describe("describeRecurRule", () => {
  it("returns null for an unusable rule", () => {
    expect(describeRecurRule("bogus")).toBeNull();
  });

  it("describes each kind in plain language", () => {
    expect(describeRecurRule("daily")).toBe("Every day");
    expect(describeRecurRule("weekdays")).toBe("Every weekday");
    expect(describeRecurRule("weekly:1,4")).toBe("Every Mon, Thu");
  });

  it("gives monthly the correct ordinal suffix", () => {
    expect(describeRecurRule("monthly:1")).toBe("Monthly on the 1st");
    expect(describeRecurRule("monthly:2")).toBe("Monthly on the 2nd");
    expect(describeRecurRule("monthly:3")).toBe("Monthly on the 3rd");
    expect(describeRecurRule("monthly:4")).toBe("Monthly on the 4th");
    expect(describeRecurRule("monthly:11")).toBe("Monthly on the 11th");
    expect(describeRecurRule("monthly:12")).toBe("Monthly on the 12th");
    expect(describeRecurRule("monthly:13")).toBe("Monthly on the 13th");
    expect(describeRecurRule("monthly:21")).toBe("Monthly on the 21st");
  });
});
