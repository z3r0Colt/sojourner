import { useBooks, useCrossReferences } from "../../api/queries";
import { useNavigationStore } from "../../state/navigationStore";
import type { Book } from "../../api/types";

export function CrossReferencesPanel({
  book,
  chapter,
  activeVerse,
  onClose,
}: {
  book: Book;
  chapter: number;
  activeVerse: number | null;
  onClose: () => void;
}) {
  const { data: books } = useBooks();
  const { data: refs } = useCrossReferences(book.id, chapter, activeVerse);
  const goTo = useNavigationStore((s) => s.goTo);

  function bookName(id: number) {
    return books?.find((b) => b.id === id)?.name ?? `#${id}`;
  }

  return (
    <aside className="flex h-full w-full flex-col bg-gray-50 dark:bg-gray-900/40">
      <div className="flex items-center justify-between border-b border-gray-200 p-2 text-xs text-gray-500 dark:border-gray-800">
        <span>
          {activeVerse ? `Cross references for ${book.name} ${chapter}:${activeVerse}` : "Select a verse to see cross references"}
        </span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600" title="Close panel" aria-label="Close panel">
          ✕
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2 text-sm">
        {activeVerse == null && <p className="p-2 text-gray-400">Click a verse in the reading pane.</p>}
        {activeVerse != null && (!refs || refs.length === 0) && <p className="p-2 text-gray-400">No cross references found.</p>}
        <ul className="space-y-1">
          {refs?.map((r, i) => (
            <li key={i}>
              <button
                className="w-full rounded px-2 py-1 text-left hover:bg-gray-100 dark:hover:bg-gray-800"
                onClick={() => goTo({ bookId: r.to_book_id, chapter: r.to_chapter, verse: r.to_verse_start })}
              >
                {bookName(r.to_book_id)} {r.to_chapter}:{r.to_verse_start}
                {r.to_verse_end !== r.to_verse_start ? `-${r.to_verse_end}` : ""}
                <span className="ml-2 text-xs text-gray-400">({r.votes} votes)</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
