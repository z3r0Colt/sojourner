import { localDate } from "../family/familyWorship";

/**
 * Ready-made sets to memorize, each added in one step. A reference longer
 * than PASSAGE_MIN_VERSES is learned as a passage, a part at a time; the
 * rest are single cards. Every card keeps the set's name, so the deck can be
 * filtered and practised by set.
 */
export interface MemorySet {
  name: string;
  /** Who it is for and why, in a line. */
  note: string;
  refs: string[];
}

export const MEMORY_SETS: MemorySet[] = [
  {
    name: "The Romans Road",
    note: "The gospel from one letter, verse by verse: sin, death, grace, faith, peace.",
    refs: ["Romans 3:23", "Romans 6:23", "Romans 5:8", "Romans 10:9-10", "Romans 10:13", "Romans 5:1"],
  },
  {
    name: "For little ones",
    note: "Short verses for children, and a good start for anyone.",
    refs: ["Genesis 1:1", "Psalm 56:3", "Psalm 119:105", "Proverbs 3:5-6", "John 3:16", "Ephesians 4:32", "1 John 4:19"],
  },
  {
    name: "Psalms by heart",
    note: "Four psalms the church has always known by heart, learned a part at a time.",
    refs: ["Psalm 1", "Psalm 23", "Psalm 100", "Psalm 121"],
  },
  {
    name: "The Ten Commandments",
    note: "Exodus 20:1-17, a commandment or two at a time.",
    refs: ["Exodus 20:1-17"],
  },
  {
    name: "The Lord's Prayer",
    note: "Matthew 6:9-13.",
    refs: ["Matthew 6:9-13"],
  },
  {
    name: "The Beatitudes",
    note: "Matthew 5:3-12.",
    refs: ["Matthew 5:3-12"],
  },
  {
    name: "The Great Commission",
    note: "Matthew 28:18-20.",
    refs: ["Matthew 28:18-20"],
  },
  {
    name: "Assurance",
    note: "For the believer who doubts: the promises that hold.",
    refs: ["John 10:27-29", "Romans 8:1", "Romans 8:38-39", "Philippians 1:6", "1 John 5:13"],
  },
];

/** More verses than this, and a reference is learned a part at a time. */
export const PASSAGE_MIN_VERSES = 4;

/** Verses to a part, by default. */
export const DEFAULT_CHUNK = 2;

/** What adding a reference means: one card, or a passage in parts. */
export type MemoryItemPlan =
  | { kind: "card"; bookId: number; chapter: number; verseStart: number; verseEnd: number }
  | { kind: "passage"; bookId: number; chapter: number; verseStart: number; verseEnd: number };

/** A passage needs more verses than one part holds: two verses learned
 * "two at a time" would be a passage of one part, never finished. */
export function planItem(
  bookId: number,
  chapter: number,
  verseStart: number,
  verseEnd: number,
  asPassage?: boolean,
  chunkSize = DEFAULT_CHUNK,
): MemoryItemPlan {
  const count = verseEnd - verseStart + 1;
  const passage = asPassage ?? count >= PASSAGE_MIN_VERSES;
  return { kind: passage && count > Math.max(1, chunkSize) ? "passage" : "card", bookId, chapter, verseStart, verseEnd };
}

/**
 * The reader's calendar days on which they reviewed anything, one entry per
 * review (the shape family worship's log grid reads), from the review log's
 * UTC timestamps.
 */
export function reviewDays(times: string[]): string[] {
  return times.map((t) => localDate(new Date(t)));
}

/** How many distinct days in the last `days` (today included) have reviews. */
export function daysPractised(log: string[], days = 30, today = localDate()): number {
  const from = new Date(`${today}T12:00`);
  from.setDate(from.getDate() - (days - 1));
  const first = localDate(from);
  return new Set(log.filter((d) => d >= first && d <= today)).size;
}
