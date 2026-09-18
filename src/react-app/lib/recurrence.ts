import { localScheduleToUtcAt, utcScheduleToLocalAt } from "@shared/recurring-schedule";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_LABELS_FULL = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

const mod = (n: number, m: number) => ((n % m) + m) % m;

// The browser's current offset; DST drift between save and materialization is accepted for v1 (bounded by one hour).
export function localScheduleToUtc(
  localDays: number[],
  localMinutes: number
): { daysOfWeek: number[]; timeUtcMinutes: number } {
  return localScheduleToUtcAt(localDays, localMinutes, new Date().getTimezoneOffset());
}

export function utcScheduleToLocal(
  utcDays: number[],
  timeUtcMinutes: number
): { days: number[]; minutes: number } {
  return utcScheduleToLocalAt(utcDays, timeUtcMinutes, new Date().getTimezoneOffset());
}

export function minutesToHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function hhmmToMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function dayLabel(day: number, full = false): string {
  return (full ? DAY_LABELS_FULL : DAY_LABELS)[mod(day, 7)] ?? "";
}

// "Mon, Wed, Fri" — compact summary of a local weekday set.
export function formatDays(days: number[]): string {
  if (days.length === 7) return "Every day";
  const weekdays = [1, 2, 3, 4, 5];
  if (days.length === 5 && weekdays.every((d) => days.includes(d))) return "Weekdays";
  return [...days].sort((a, b) => a - b).map((d) => dayLabel(d)).join(", ");
}
