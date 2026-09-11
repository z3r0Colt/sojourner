import type { Book } from "../../api/types";
import type { Position } from "../../state/workspaceStore";

/** The chapter before or after `position`, crossing book boundaries.
 * Returns null at the very start or end of the Bible. */
export function stepChapter(books: Book[], position: Position, direction: 1 | -1): Position | null {
  const idx = books.findIndex((b) => b.id === position.bookId);
  const book = books[idx];
  if (!book) return null;
  if (direction === 1) {
    if (position.chapter < book.chapter_count) return { bookId: book.id, chapter: position.chapter + 1 };
    const next = books[idx + 1];
    return next ? { bookId: next.id, chapter: 1 } : null;
  }
  if (position.chapter > 1) return { bookId: book.id, chapter: position.chapter - 1 };
  const prev = books[idx - 1];
  return prev ? { bookId: prev.id, chapter: prev.chapter_count } : null;
}
