import { useCallback, useMemo } from "react";
import { useBooks } from "../api/queries";
import type { Book, PassageRef, Verse } from "../api/types";

/**
 * Passage helpers: one place for turning references into text and verses
 * into text. Views that used to define their own `bookName()` or inline
 * `${book} ${chapter}:${verse}` strings adopt these as they are touched.
 */

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

/** A book's display name, or "#id" while the book list is still loading. */
export function bookName(books: Book[] | undefined, bookId: number): string {
  return books?.find((b) => b.id === bookId)?.name ?? `#${bookId}`;
}

/** "John 3:16" or "John 3:16-18". Falls back to "#43" while books load. */
export function formatRef(books: Book[] | undefined, ref: PassageRef): string {
  const range = ref.verse_end !== ref.verse_start ? `-${ref.verse_end}` : "";
  return `${bookName(books, ref.book_id)} ${ref.chapter}:${ref.verse_start}${range}`;
}

/** "John 3" or "John 3:16" -- a chapter with an optional single verse, the
 * shape bookmarks, chapter notes, and reading positions carry. */
export function formatChapterRef(books: Book[] | undefined, bookId: number, chapter: number, verse?: number | null): string {
  return `${bookName(books, bookId)} ${chapter}${verse ? `:${verse}` : ""}`;
}

/** The text of verses `start`..`end` (inclusive) from a loaded chapter,
 * joined with single spaces. An open `end` means "to the end of the
 * chapter". Missing verses are skipped rather than leaving gaps. */
export function joinVerses(verses: Verse[] | undefined, start: number, end?: number | null): string {
  if (!verses) return "";
  return verses
    .filter((v) => v.verse >= start && (end == null || v.verse <= end))
    .map((v) => v.text.trim())
    .join(" ");
}

/** Book-name lookup bound to the loaded book list, with a Map behind it so
 * long lists don't scan on every row. Returns "#id" while books load. */
export function useBookName(): (bookId: number) => string {
  const { data: books } = useBooks();
  const byId = useMemo(() => new Map((books ?? []).map((b) => [b.id, b.name])), [books]);
  return useCallback((bookId: number) => byId.get(bookId) ?? `#${bookId}`, [byId]);
}
