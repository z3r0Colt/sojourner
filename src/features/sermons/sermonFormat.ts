import { bookName } from "../../lib/passage";
import type { Book, Sermon, SermonPassage, SermonStage, SermonStatus } from "../../api/types";

/** The prep track, in order (SB2.1). */
export const SERMON_STAGES: readonly SermonStage[] = ["text", "study", "outline", "manuscript", "rehearsed", "preached"];

export const STAGE_LABEL: Record<SermonStage, string> = {
  text: "Text",
  study: "Study",
  outline: "Outline",
  manuscript: "Manuscript",
  rehearsed: "Rehearsed",
  preached: "Preached",
};

export const STATUS_LABEL: Record<SermonStatus, string> = {
  draft: "Draft",
  ready: "Ready",
  preached: "Preached",
  archived: "Archived",
};

/** "Romans 8:28-30", or "Romans 8" when the whole chapter is the text. */
export function passageLabel(books: Book[] | undefined, p: Pick<SermonPassage, "book_id" | "chapter" | "verse_start" | "verse_end">): string {
  const base = `${bookName(books, p.book_id)} ${p.chapter}`;
  if (p.verse_start == null) return base;
  const end = p.verse_end != null && p.verse_end !== p.verse_start ? `-${p.verse_end}` : "";
  return `${base}:${p.verse_start}${end}`;
}

/** The sermon's own text (role `text`), several allowed, joined with "; ". */
export function sermonTextLabel(books: Book[] | undefined, sermon: Pick<Sermon, "passages">): string {
  const texts = sermon.passages.filter((p) => p.role === "text");
  return texts.map((p) => passageLabel(books, p)).join("; ");
}

/** "13 September 2026", or "" for an undated sermon. */
export function formatPreachDate(date: string | null, opts: Intl.DateTimeFormatOptions = { year: "numeric", month: "long", day: "numeric" }): string {
  if (!date) return "";
  const d = new Date(`${date}T00:00:00`);
  return isNaN(d.getTime()) ? date : d.toLocaleDateString(undefined, opts);
}

/** Whole days from today to `date`; negative once the date has passed. */
export function daysUntil(date: string, today = new Date()): number {
  const target = new Date(`${date}T00:00:00`);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target.getTime() - start.getTime()) / 86_400_000);
}

/** "in 3 days", "today", "tomorrow", "5 days ago". */
export function relativeDay(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

/** Today as YYYY-MM-DD in the reader's own time zone, which is what every
 * date column in the sermon tables holds. */
export function localToday(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** The Sunday on or after `from` -- what a new sermon's date defaults to. */
export function nextSunday(from = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
  return localToday(d);
}
