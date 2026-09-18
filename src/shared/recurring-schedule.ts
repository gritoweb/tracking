// Recurring-entry schedules are stored in UTC so the cron compares plainly; people think in local weekday + time.
// `offsetMinutes` uses the JS getTimezoneOffset sign: UTC = local + offset.

const mod = (n: number, m: number) => ((n % m) + m) % m;

/** Local weekday set + local minutes-of-day → UTC weekday set + UTC minutes. */
export function localScheduleToUtcAt(
  localDays: number[],
  localMinutes: number,
  offsetMinutes: number
): { daysOfWeek: number[]; timeUtcMinutes: number } {
  const rawUtc = localMinutes + offsetMinutes;
  const dayShift = Math.floor(rawUtc / 1440);
  const timeUtcMinutes = mod(rawUtc, 1440);
  const daysOfWeek = [...new Set(localDays.map((d) => mod(d + dayShift, 7)))].sort((a, b) => a - b);
  return { daysOfWeek, timeUtcMinutes };
}

/** UTC weekday set + UTC minutes → local weekday set + local minutes-of-day. */
export function utcScheduleToLocalAt(
  utcDays: number[],
  timeUtcMinutes: number,
  offsetMinutes: number
): { days: number[]; minutes: number } {
  const rawLocal = timeUtcMinutes - offsetMinutes;
  const dayShift = Math.floor(rawLocal / 1440);
  const minutes = mod(rawLocal, 1440);
  const days = [...new Set(utcDays.map((d) => mod(d + dayShift, 7)))].sort((a, b) => a - b);
  return { days, minutes };
}
