import { readingLabel } from "../plans/planBuilder";
import { localToday } from "./sermonFormat";
import type { Book, PlanReadingInput, Sermon } from "../../api/types";

/**
 * A series as a reading plan for the congregation (SB5.2).
 *
 * The point of the sermon builder's last step: a family that reads next
 * Sunday's text during the week hears the sermon differently. The series
 * already holds the texts and the dates, so the plan writes itself -- as a
 * custom plan (F4.2), which means it appears on Today, on the Reading plans
 * page, can be started, caught up, and exported like any other.
 *
 * Two shapes (Q8):
 *   "before"  one reading on the Saturday before each Sunday
 *   "spread"  the same text split over the six days before it
 */

export type SeriesPlanShape = "before" | "spread";

/** A day's readings, in the order the plan will hold them. */
export type PlanDay = PlanReadingInput[];

export interface SeriesPlanDraft {
  title: string;
  description: string;
  /** Day 1's date: the first reading day before the first sermon. */
  startDate: string;
  days: PlanDay[];
}

/** A sermon's text passages as plan readings. A sermon with no text of its
 * own contributes nothing, which is what should happen. */
export function readingsForSermon(sermon: Sermon, books: Book[] | undefined): PlanReadingInput[] {
  return sermon.passages
    .filter((p) => p.role === "text")
    .map((p) => {
      const book = books?.find((b) => b.id === p.book_id);
      const r = {
        chapter_start: p.chapter,
        chapter_end: p.chapter,
        verse_start: p.verse_start,
        verse_end: p.verse_end,
      };
      return {
        book_id: p.book_id,
        ...r,
        label: book ? readingLabel(book, r) : `#${p.book_id} ${p.chapter}`,
      };
    });
}

/** Days between two YYYY-MM-DD dates. */
function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00`).getTime();
  const b = new Date(`${to}T00:00:00`).getTime();
  return Math.round((b - a) / 86_400_000);
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return localToday(d);
}

/**
 * Builds the plan. Day 1 is the first reading day of the first sermon's
 * week -- the Saturday before it for "before", six days before it for
 * "spread" -- and every sermon's text lands on the days before it is
 * preached, so the calendar of the plan and the calendar of the series
 * agree. A dated gap between sermons becomes empty days, which a custom
 * plan holds happily: nothing is read on them.
 */
export function buildSeriesPlan(
  seriesTitle: string,
  sermons: Sermon[],
  books: Book[] | undefined,
  shape: SeriesPlanShape,
): SeriesPlanDraft | null {
  const dated = sermons
    .filter((s) => s.preach_date && s.passages.some((p) => p.role === "text"))
    .sort((a, b) => (a.preach_date ?? "").localeCompare(b.preach_date ?? ""));
  if (dated.length === 0) return null;

  const lead = shape === "spread" ? 6 : 1;
  const startDate = addDays(dated[0].preach_date as string, -lead);
  const lastDate = dated[dated.length - 1].preach_date as string;
  const length = Math.max(1, daysBetween(startDate, lastDate));

  const days: PlanDay[] = Array.from({ length }, () => []);
  for (const sermon of dated) {
    const readings = readingsForSermon(sermon, books);
    if (readings.length === 0) continue;
    const preachDay = daysBetween(startDate, sermon.preach_date as string);
    if (shape === "before") {
      // One reading on the day before the sermon.
      const dayIndex = preachDay - 1;
      if (dayIndex >= 0 && dayIndex < days.length) days[dayIndex].push(...readings);
      continue;
    }
    // "Read ahead": the sermon's readings spread over the six days before
    // it, one reading a day, repeating the last if there are fewer.
    for (let offset = 0; offset < 6; offset++) {
      const dayIndex = preachDay - 6 + offset;
      if (dayIndex < 0 || dayIndex >= days.length) continue;
      const reading = readings[Math.min(offset, readings.length - 1)];
      if (offset < readings.length || readings.length === 1) days[dayIndex].push(reading);
    }
  }

  return {
    title: `${seriesTitle}: read along`,
    description: `The texts of the ${seriesTitle} series, to read before each Sunday.`,
    startDate,
    days,
  };
}

/** What the plan will look like, for the dialog that offers to build it. */
export function describeSeriesPlan(draft: SeriesPlanDraft): string {
  const readingDays = draft.days.filter((d) => d.length > 0).length;
  return `${draft.days.length} days from ${draft.startDate}, with readings on ${readingDays} of them.`;
}
