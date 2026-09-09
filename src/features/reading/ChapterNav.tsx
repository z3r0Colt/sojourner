import type { Book } from "../../api/types";
import type { Position } from "../../state/navigationStore";

export function ChapterNav({
  books,
  position,
  onNavigate,
}: {
  books: Book[];
  position: Position;
  onNavigate: (p: Position) => void;
}) {
  const book = books.find((b) => b.id === position.bookId) ?? books[0];
  const chapters = Array.from({ length: book.chapter_count }, (_, i) => i + 1);

  function prevChapter() {
    if (position.chapter > 1) {
      onNavigate({ bookId: book.id, chapter: position.chapter - 1 });
      return;
    }
    const idx = books.findIndex((b) => b.id === book.id);
    const prevBook = books[idx - 1];
    if (prevBook) onNavigate({ bookId: prevBook.id, chapter: prevBook.chapter_count });
  }

  function nextChapter() {
    if (position.chapter < book.chapter_count) {
      onNavigate({ bookId: book.id, chapter: position.chapter + 1 });
      return;
    }
    const idx = books.findIndex((b) => b.id === book.id);
    const nextBook = books[idx + 1];
    if (nextBook) onNavigate({ bookId: nextBook.id, chapter: 1 });
  }

  return (
    <div className="flex items-center gap-1 text-sm">
      <select
        className="rounded border border-gray-300 bg-white px-2 py-1 dark:border-gray-700 dark:bg-gray-900"
        value={book.id}
        onChange={(e) => onNavigate({ bookId: Number(e.target.value), chapter: 1 })}
      >
        {books.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
      <select
        className="rounded border border-gray-300 bg-white px-2 py-1 dark:border-gray-700 dark:bg-gray-900"
        value={position.chapter}
        onChange={(e) => onNavigate({ bookId: book.id, chapter: Number(e.target.value) })}
      >
        {chapters.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <button onClick={prevChapter} className="rounded px-1.5 py-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">
        ‹
      </button>
      <button onClick={nextChapter} className="rounded px-1.5 py-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">
        ›
      </button>
    </div>
  );
}
