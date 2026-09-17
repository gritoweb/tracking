import { afterEach, describe, expect, it, vi } from "vitest";
import {
  dayLabel,
  formatDays,
  hhmmToMinutes,
  localScheduleToUtc,
  minutesToHHMM,
  utcScheduleToLocal,
} from "./recurrence";

/** `Date.prototype.getTimezoneOffset()` is UTC-minus-local in minutes: UTC-5 (EST) is 300, UTC-6 (CST) is 360. */
function mockOffset(minutes: number) {
  vi.spyOn(Date.prototype, "getTimezoneOffset").mockReturnValue(minutes);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("localScheduleToUtc / utcScheduleToLocal", () => {
  it("round-trips a same-day schedule for a negative (west of UTC) offset", () => {
    mockOffset(300); // UTC-5
    // Mon/Wed 09:00 local -> 14:00 UTC, same weekdays.
    const utc = localScheduleToUtc([1, 3], 9 * 60);
    expect(utc).toEqual({ daysOfWeek: [1, 3], timeUtcMinutes: 14 * 60 });

    const local = utcScheduleToLocal(utc.daysOfWeek, utc.timeUtcMinutes);
    expect(local).toEqual({ days: [1, 3], minutes: 9 * 60 });
  });

  it("shifts the weekday forward when local time crosses midnight into UTC", () => {
    mockOffset(300); // UTC-5
    // Fri 23:00 local is Saturday 04:00 UTC - the weekday itself shifts.
    const utc = localScheduleToUtc([5], 23 * 60);
    expect(utc).toEqual({ daysOfWeek: [6], timeUtcMinutes: 4 * 60 });

    const local = utcScheduleToLocal(utc.daysOfWeek, utc.timeUtcMinutes);
    expect(local).toEqual({ days: [5], minutes: 23 * 60 });
  });

  it("shifts the weekday backward for a positive (east of UTC) offset near midnight", () => {
    mockOffset(-120); // UTC+2
    // Mon 00:30 local is Sunday 22:30 UTC.
    const utc = localScheduleToUtc([1], 30);
    expect(utc).toEqual({ daysOfWeek: [0], timeUtcMinutes: 22 * 60 + 30 });

    const local = utcScheduleToLocal(utc.daysOfWeek, utc.timeUtcMinutes);
    expect(local).toEqual({ days: [1], minutes: 30 });
  });

  it("dedupes days that collapse onto the same UTC weekday", () => {
    mockOffset(300);
    // Two local weekdays 30 minutes apart can still land on the same UTC day/time bucket.
    const utc = localScheduleToUtc([1, 1], 9 * 60);
    expect(utc.daysOfWeek).toEqual([1]);
  });

  it("documents the accepted DST drift: the same local schedule converts differently across a DST-crossing week", () => {
    // Only today's offset is ever read - see the "accepted for v1" note atop recurrence.ts.
    mockOffset(300); // EST, before the spring-forward
    const beforeDst = localScheduleToUtc([1], 9 * 60);

    mockOffset(240); // EDT, after the spring-forward
    const afterDst = localScheduleToUtc([1], 9 * 60);

    expect(afterDst.timeUtcMinutes - beforeDst.timeUtcMinutes).toBe(-60);
    expect(beforeDst.daysOfWeek).toEqual(afterDst.daysOfWeek);
  });
});

describe("minutesToHHMM / hhmmToMinutes", () => {
  it("round-trips a time of day", () => {
    expect(minutesToHHMM(9 * 60 + 5)).toBe("09:05");
    expect(hhmmToMinutes("09:05")).toBe(9 * 60 + 5);
  });

  it("pads midnight and formats the last minute of the day", () => {
    expect(minutesToHHMM(0)).toBe("00:00");
    expect(minutesToHHMM(23 * 60 + 59)).toBe("23:59");
  });

  it("treats a malformed HH:MM as zero", () => {
    expect(hhmmToMinutes("")).toBe(0);
  });
});

describe("dayLabel", () => {
  it("normalizes an out-of-range day via modulo", () => {
    expect(dayLabel(7)).toBe(dayLabel(0));
    expect(dayLabel(-1)).toBe(dayLabel(6));
  });

  it("returns the short and full form", () => {
    expect(dayLabel(1)).toBe("Mon");
    expect(dayLabel(1, true)).toBe("Monday");
  });
});

describe("formatDays", () => {
  it("collapses every day to 'Every day'", () => {
    expect(formatDays([0, 1, 2, 3, 4, 5, 6])).toBe("Every day");
  });

  it("collapses Mon-Fri to 'Weekdays'", () => {
    expect(formatDays([1, 2, 3, 4, 5])).toBe("Weekdays");
  });

  it("does not collapse Mon-Fri plus a weekend day", () => {
    expect(formatDays([1, 2, 3, 4, 5, 6])).not.toBe("Weekdays");
  });

  it("lists an arbitrary set of days sorted and abbreviated", () => {
    expect(formatDays([5, 1, 3])).toBe("Mon, Wed, Fri");
  });

  it("returns an empty string for no days", () => {
    expect(formatDays([])).toBe("");
  });
});
