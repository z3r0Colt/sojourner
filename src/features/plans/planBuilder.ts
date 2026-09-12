import type { Book, PlanReadingInput, ReadingPlanReading } from "../../api/types";
import { parseReference } from "../../hooks/useReferenceParser";

/**
 * The two custom-plan builders (F4.2), as pure functions the modal calls.
 *
 *   divideChapters(books, days)   "A book in N days": the chosen books'
 *                                 chapters split evenly, in canon order.
 *   parsePlanLine(line, lookup)   "From a list": one line of references
 *                                 (semicolon-separated) into readings.
 *
 * A reading's label is what the plan page shows and what the list builder
 * reads back when a plan is edited, so the two agree: "Psalms 1-5",
 * "John 3", "John 3:16-21", "Exodus 11:1-12:20".
 */

export const WEEKDAYS: { value: number; label: string; short: string }[] = [
  { value: 1, label: "Monday", short: "Mon" },
  { value: 2, label: "Tuesday", short: "Tue" },
  { value: 3, label: "Wednesday", short: "Wed" },
  { value: 4, label: "Thursday", short: "Thu" },
  { value: 5, label: "Friday", short: "Fri" },
  { value: 6, label: "Saturday", short: "Sat" },
  { value: 7, label: "Sunday", short: "Sun" },
];

/** "Mon–Fri", "Mon, Wed, Fri", or "every day". */
export function formatWeekdays(weekdays: number[] | null): string {
  if (!weekdays || weekdays.length === 0 || weekdays.length >= 7) return "every day";
  const sorted = [...weekdays].sort((a, b) => a - b);
  const short = (d: number) => WEEKDAYS.find((w) => w.value === d)?.short ?? String(d);
  const contiguous = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
  if (contiguous && sorted.length >= 3) return `${short(sorted[0])}–${short(sorted[sorted.length - 1])}`;
  return sorted.map(short).join(", ");
}

export function readingLabel(book: Book, r: Omit<PlanReadingInput, "label" | "book_id">): string {
  const { chapter_start: c1, chapter_end: c2, verse_start: v1, verse_end: v2 } = r;
  if (v1 == null && v2 == null) return c1 === c2 ? `${book.name} ${c1}` : `${book.name} ${c1}-${c2}`;
  if (c1 === c2) {
    if (v2 == null || v2 === v1) return `${book.name} ${c1}:${v1 ?? 1}`;
    return `${book.name} ${c1}:${v1 ?? 1}-${v2}`;
  }
  return `${book.name} ${c1}:${v1 ?? 1}-${c2}:${v2 ?? ""}`.replace(/:$/, "");
}

function reading(book: Book, c1: number, c2: number, v1: number | null = null, v2: number | null = null): PlanReadingInput {
  const r = { chapter_start: c1, chapter_end: c2, verse_start: v1, verse_end: v2 };
  return { book_id: book.id, ...r, label: readingLabel(book, r) };
}

/** The chosen books' chapters divided evenly over `days`, each day's run
 * grouped into one reading per book. Books are taken in canon order. */
export function divideChapters(books: Book[], selectedIds: number[], days: number): PlanReadingInput[][] {
  const chosen = books.filter((b) => selectedIds.includes(b.id)).sort((a, b) => a.id - b.id);
  const chapters: { book: Book; chapter: number }[] = [];
  for (const b of chosen) for (let c = 1; c <= b.chapter_count; c++) chapters.push({ book: b, chapter: c });
  const total = chapters.length;
  const n = Math.max(1, Math.min(days, total));
  const out: PlanReadingInput[][] = [];
  for (let i = 0; i < n; i++) {
    const from = Math.floor((i * total) / n);
    const to = Math.floor(((i + 1) * total) / n);
    const readings: PlanReadingInput[] = [];
    let run: { book: Book; start: number; end: number } | null = null;
    for (let k = from; k < to; k++) {
      const ch = chapters[k];
      if (run && run.book.id === ch.book.id && ch.chapter === run.end + 1) run.end = ch.chapter;
      else {
        if (run) readings.push(reading(run.book, run.start, run.end));
        run = { book: ch.book, start: ch.chapter, end: ch.chapter };
      }
    }
    if (run) readings.push(reading(run.book, run.start, run.end));
    out.push(readings);
  }
  return out;
}

export function totalChapters(books: Book[], selectedIds: number[]): number {
  return books.filter((b) => selectedIds.includes(b.id)).reduce((n, b) => n + b.chapter_count, 0);
}

export type LineParse = { ok: true; readings: PlanReadingInput[] } | { ok: false; error: string };

// "Book", "Book 3", "Book 1-5", "Book 3:16", "Book 3:16-21", "Book 11:1-12:20".
const RANGE_RE = /^(.+?)\s+(\d+)(?::(\d+))?\s*[-–]\s*(\d+)(?::(\d+))?$/;
const WHOLE_BOOK_RE = /^[^\d]+$/;

/** One reference, as one item of a line. */
export function parsePlanReading(text: string, lookup: Map<string, Book>): PlanReadingInput | null {
  const t = text.trim();
  if (!t) return null;
  if (WHOLE_BOOK_RE.test(t)) {
    const parsed = parseReference(t, lookup);
    return parsed ? reading(parsed.book, 1, parsed.book.chapter_count) : null;
  }
  const m = RANGE_RE.exec(t);
  if (m) {
    const [, bookPart, aStr, aVerseStr, bStr, bVerseStr] = m;
    const head = parseReference(`${bookPart} ${aStr}`, lookup);
    if (!head) return null;
    const book = head.book;
    const a = Number(aStr);
    const b = Number(bStr);
    const inRange = (c: number) => c >= 1 && c <= book.chapter_count;
    if (aVerseStr && bVerseStr) {
      // Chapter:verse to chapter:verse.
      if (!inRange(a) || !inRange(b) || b < a) return null;
      return reading(book, a, b, Number(aVerseStr), Number(bVerseStr));
    }
    if (aVerseStr && !bVerseStr) {
      // Chapter:verse to verse in the same chapter.
      if (!inRange(a) || Number(bStr) < Number(aVerseStr)) return null;
      return reading(book, a, a, Number(aVerseStr), Number(bStr));
    }
    // Chapter to chapter.
    if (!inRange(a) || !inRange(b) || b < a) return null;
    return reading(book, a, b);
  }
  const parsed = parseReference(t, lookup);
  if (!parsed) return null;
  if (parsed.verse != null) return reading(parsed.book, parsed.chapter, parsed.chapter, parsed.verse, parsed.verseEnd ?? parsed.verse);
  return reading(parsed.book, parsed.chapter, parsed.chapter);
}

/** One line of the list builder: references separated by semicolons. */
export function parsePlanLine(line: string, lookup: Map<string, Book>): LineParse {
  const parts = line.split(";").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return { ok: false, error: "Empty line" };
  const readings: PlanReadingInput[] = [];
  for (const p of parts) {
    const r = parsePlanReading(p, lookup);
    if (!r) return { ok: false, error: `Could not read “${p}”` };
    readings.push(r);
  }
  return { ok: true, readings };
}

/** A day's readings back into a list-builder line (editing a plan). */
export function readingsToLine(readings: ReadingPlanReading[]): string {
  return readings.map((r) => r.label).join("; ");
}
