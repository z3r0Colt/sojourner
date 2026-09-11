import type { PassageRef } from "../api/types";

/** Stable string identity for a verse range -- used as a React Query key
 * part, a Map key, and the `data-ref` attribute value. */
export function refKey(ref: PassageRef): string {
  return `${ref.book_id}:${ref.chapter}:${ref.verse_start}:${ref.verse_end}`;
}

/** Builds a `PassageRef` from the loose `{bookId, chapter, verseStart?, verseEnd?}`
 * shapes most views already hold. A missing end means a single verse. */
export function toPassageRef(bookId: number, chapter: number, verseStart: number, verseEnd?: number | null): PassageRef {
  return { book_id: bookId, chapter, verse_start: verseStart, verse_end: verseEnd ?? verseStart };
}
