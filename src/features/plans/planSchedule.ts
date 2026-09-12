import type { ReadingPlanProgress } from "../../api/types";

/**
 * Where a reading plan stands against the calendar.
 *
 * Progress itself is checklist-based (`current_day` is the first day not
 * yet ticked; see reading_plans.rs). The calendar day is how far along the
 * plan *should* be: day 1 on `start_date`, day 2 the next day, and so on.
 * The gap between the two is what "You're N days behind" means (F3.3), and
 * the calendar day is what the Today page shows as today's reading.
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

/** The day number the calendar says the reader should be on: day 1 on the
 * start date, clamped to the plan's length. A start date in the future
 * counts as day 1. */
export function calendarDay(progress: ReadingPlanProgress, lengthDays: number, now = new Date()): number {
  const start = parseLocalDate(progress.start_date);
  if (!start) return Math.min(progress.current_day, lengthDays);
  const day = daysBetween(start, now) + 1;
  return Math.max(1, Math.min(lengthDays, day));
}

/** How many days the checklist trails the calendar: zero when caught up or
 * ahead, and zero once every day is ticked. */
export function daysBehind(progress: ReadingPlanProgress, lengthDays: number, now = new Date()): number {
  if (progress.current_day > lengthDays) return 0;
  return Math.max(0, calendarDay(progress, lengthDays, now) - progress.current_day);
}

/** True once every day of the plan is ticked. */
export function isFinished(progress: ReadingPlanProgress, lengthDays: number): boolean {
  return progress.current_day > lengthDays;
}
