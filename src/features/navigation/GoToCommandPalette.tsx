import { useMemo, useState } from "react";
import type { Book } from "../../api/types";
import type { Position } from "../../state/navigationStore";
import { buildBookLookup, parseReference } from "../../hooks/useReferenceParser";

export function GoToCommandPalette({
  books,
  onClose,
  onNavigate,
}: {
  books: Book[];
  onClose: () => void;
  onNavigate: (p: Position) => void;
}) {
  const [query, setQuery] = useState("");
  const lookup = useMemo(() => buildBookLookup(books), [books]);
  const parsed = useMemo(() => (query.trim() ? parseReference(query, lookup) : null), [query, lookup]);

  function submit() {
    if (parsed) {
      onNavigate({ bookId: parsed.book.id, chapter: parsed.chapter, verse: parsed.verse });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-24" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-lg bg-white p-3 shadow-xl dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") onClose();
          }}
          placeholder="Go to... e.g. John 3:16, Genesis 1, 1 cor 13"
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-950"
        />
        <div className="mt-2 text-sm text-gray-500">
          {query.trim() === "" ? (
            "Type a book, chapter, or verse reference."
          ) : parsed ? (
            <button
              className="rounded bg-blue-50 px-2 py-1 text-blue-700 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300"
              onClick={submit}
            >
              Go to {parsed.book.name} {parsed.chapter}
              {parsed.verse ? `:${parsed.verse}` : ""}
            </button>
          ) : (
            <span className="text-red-500">No match</span>
          )}
        </div>
      </div>
    </div>
  );
}
