import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslationCoverage } from "../../api/queries";
import type { Book } from "../../api/types";
import type { Position } from "../../state/workspaceStore";
import { IconButton } from "../../components/ui/Button";
import { selectSmClass } from "../../components/ui/classes";
import { stepChapter } from "./chapterStep";

export function ChapterNav({
  books,
  position,
  translationId,
  onNavigate,
}: {
  books: Book[];
  position: Position;
  translationId: number | null;
  onNavigate: (p: Position) => void;
}) {
  const book = books.find((b) => b.id === position.bookId) ?? books[0];
  const chapters = Array.from({ length: book.chapter_count }, (_, i) => i + 1);

  // Which books/chapters the selected translation actually has verses for --
  // e.g. Tyndale is NT + Pentateuch only. Undefined while loading, in which
  // case nothing is grayed out yet rather than flashing every book disabled.
  const { data: coverage } = useTranslationCoverage(translationId);
  const coverageByBook = coverage ? new Map(coverage.map((c) => [c.book_id, new Set(c.chapters)])) : null;
  const isBookCovered = (bookId: number) => !coverageByBook || (coverageByBook.get(bookId)?.size ?? 0) > 0;
  const isChapterCovered = (bookId: number, chapter: number) =>
    !coverageByBook || (coverageByBook.get(bookId)?.has(chapter) ?? false);

  const prev = stepChapter(books, position, -1);
  const next = stepChapter(books, position, 1);

  return (
    <div className="flex items-center gap-1">
      <IconButton icon={ChevronLeft} label="Previous chapter (Ctrl+[)" size="sm" disabled={!prev} onClick={() => prev && onNavigate(prev)} />
      <select
        aria-label="Book"
        className={selectSmClass}
        value={book.id}
        onChange={(e) => onNavigate({ bookId: Number(e.target.value), chapter: 1 })}
      >
        {books.map((b) => (
          <option key={b.id} value={b.id} disabled={!isBookCovered(b.id)}>
            {b.name}
            {!isBookCovered(b.id) ? " (not in this translation)" : ""}
          </option>
        ))}
      </select>
      <select
        aria-label="Chapter"
        className={selectSmClass}
        value={position.chapter}
        onChange={(e) => onNavigate({ bookId: book.id, chapter: Number(e.target.value) })}
      >
        {chapters.map((c) => (
          <option key={c} value={c} disabled={!isChapterCovered(book.id, c)}>
            {c}
          </option>
        ))}
      </select>
      <IconButton icon={ChevronRight} label="Next chapter (Ctrl+])" size="sm" disabled={!next} onClick={() => next && onNavigate(next)} />
    </div>
  );
}
