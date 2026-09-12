import type { ReadingPlanProgress } from "../../api/types";

/**
 * Where a reading plan stands against the calendar.
 *
 * Progress itself is checklist-based (`current_day` is the first day not
 * yet ticked; see reading_plans.rs). Each day of a plan falls on a date:
 * the row in `progress.schedule` when there is one (a weekday plan's
 * calendar, or days a "spread over seven days" catch-up re-dated; F4.2),
 * else `start_date + (day - 1)`. The calendar day is the last day whose
 * date has arrived; the gap between it and the checklist is what "You're
 * N days behind" means (F3.3), and the days dated today are what the
 * Today page shows.
 */

/** Parses "YYYY-MM-DD" as a local date at midnight. */
export function parseLocalDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}

/** Today as "YYYY-MM-DD" in local time. */
export function localToday(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Whole days from `start` to `now`, by local calendar date (DST-safe). */
function daysBetween(start: Date, now: Date): number {
  const a = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((b - a) / 86_400_000);
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** The date `day` of the plan falls on, as "YYYY-MM-DD", or null when the
 * start date does not parse. */
export function effectiveDate(progress: ReadingPlanProgress, day: number): string | null {
  const pinned = progress.schedule?.find((e) => e.day_number === day);
  if (pinned) return pinned.date;
  const start = parseLocalDate(progress.start_date);
  if (!start) return null;
  return localToday(addDays(start, day - 1));
}

/** The day number the calendar says the reader should be on: the last day
 * whose date is today or earlier, clamped to 1 and the plan's length. A
 * start date in the future counts as day 1. */
export function calendarDay(progress: ReadingPlanProgress, lengthDays: number, now = new Date()): number {
  const today = localToday(now);
  if (!progress.schedule || progress.schedule.length === 0) {
    const start = parseLocalDate(progress.start_date);
    if (!start) return Math.max(1, Math.min(progress.current_day, lengthDays));
    const day = daysBetween(start, now) + 1;
    return Math.max(1, Math.min(lengthDays, day));
  }
  let last = 1;
  for (let day = 1; day <= lengthDays; day++) {
    const date = effectiveDate(progress, day);
    if (date != null && date <= today) last = day;
  }
  return Math.max(1, Math.min(lengthDays, last));
}

/** The unread days whose date has passed, from the next unread day on.
 * Zero-length when caught up, ahead, or finished. */
export function overdueDays(progress: ReadingPlanProgress, lengthDays: number, now = new Date()): number[] {
  if (progress.current_day > lengthDays) return [];
  const today = localToday(now);
  const out: number[] = [];
  for (let day = progress.current_day; day <= lengthDays; day++) {
    const date = effectiveDate(progress, day);
    if (date != null && date < today) out.push(day);
  }
  return out;
}

/** How many days the checklist trails the calendar: zero when caught up or
 * ahead, and zero once every day is ticked. */
export function daysBehind(progress: ReadingPlanProgress, lengthDays: number, now = new Date()): number {
  return overdueDays(progress, lengthDays, now).length;
}

/** The days dated today (several after a spread), or the calendar day when
 * nothing is dated today (a start in the future, a day off). */
export function todaysDays(progress: ReadingPlanProgress, lengthDays: number, now = new Date()): number[] {
  const today = localToday(now);
  const out: number[] = [];
  for (let day = 1; day <= lengthDays; day++) {
    if (effectiveDate(progress, day) === today) out.push(day);
  }
  return out.length > 0 ? out : [calendarDay(progress, lengthDays, now)];
}

/** True once every day of the plan is ticked. */
export function isFinished(progress: ReadingPlanProgress, lengthDays: number): boolean {
  return progress.current_day > lengthDays;
}
