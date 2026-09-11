import type { Book, PassageRef } from "../api/types";

/** "John 3:16" or "John 3:16-18". Falls back to "#43" while books load. */
export function formatRef(books: Book[] | undefined, ref: PassageRef): string {
  const name = books?.find((b) => b.id === ref.book_id)?.name ?? `#${ref.book_id}`;
  const range = ref.verse_end !== ref.verse_start ? `-${ref.verse_end}` : "";
  return `${name} ${ref.chapter}:${ref.verse_start}${range}`;
}

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
