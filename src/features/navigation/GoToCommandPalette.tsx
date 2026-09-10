import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Book } from "../../api/types";
import type { Position } from "../../state/navigationStore";
import { buildBookLookup, parseReference } from "../../hooks/useReferenceParser";
import { useBookAliases, useTranslationCoverage, useDictionaryIndex, useWestminsterDocuments } from "../../api/queries";

const STRONGS_RE = /^[GgHh]\d{1,5}$/;

/** Beyond a Bible reference, "Go to" also resolves a Strong's number
 * (G26, h430) straight to the Lexicon, and otherwise offers dictionary
 * terms and Westminster Standards documents whose title contains the typed
 * text -- so one shortcut reaches anywhere a study session tends to jump. */
export function GoToCommandPalette({
  books,
  translationId,
  translationLabel,
  onClose,
  onNavigate,
}: {
  books: Book[];
  translationId?: number | null;
  translationLabel?: string;
  onClose: () => void;
  onNavigate: (p: Position) => void;
}) {
  const [query, setQuery] = useState("");
  const { data: aliases } = useBookAliases();
  const { data: coverage } = useTranslationCoverage(translationId ?? null);
  const { data: dictionaryIndex } = useDictionaryIndex();
  const { data: westminsterDocs } = useWestminsterDocuments();
  const navigate = useNavigate();
  const lookup = useMemo(() => buildBookLookup(books, aliases ?? []), [books, aliases]);
  const trimmed = query.trim();
  const parsed = useMemo(() => (trimmed ? parseReference(query, lookup) : null), [query, lookup, trimmed]);
  const isStrongs = !parsed && STRONGS_RE.test(trimmed);

  const coveredChapters = parsed && coverage ? coverage.find((c) => c.book_id === parsed.book.id)?.chapters : undefined;
  // Only warn once coverage data has actually loaded for this translation --
  // otherwise every reference would flash "not covered" for a frame.
  const notCovered = parsed && coverage && (!coveredChapters || !coveredChapters.includes(parsed.chapter));

  const dictionaryMatches = useMemo(() => {
    if (parsed || isStrongs || trimmed.length < 2) return [];
    const q = trimmed.toLowerCase();
    return (dictionaryIndex ?? []).filter((d) => d.term.toLowerCase().includes(q)).slice(0, 5);
  }, [dictionaryIndex, trimmed, parsed, isStrongs]);

  const westminsterMatches = useMemo(() => {
    if (parsed || isStrongs || trimmed.length < 2) return [];
    const q = trimmed.toLowerCase();
    return (westminsterDocs ?? []).filter((d) => d.title.toLowerCase().includes(q) || d.code.toLowerCase() === q).slice(0, 5);
  }, [westminsterDocs, trimmed, parsed, isStrongs]);

  function submit() {
    if (parsed && !notCovered) {
      onNavigate({ bookId: parsed.book.id, chapter: parsed.chapter, verse: parsed.verse });
    } else if (isStrongs) {
      navigate(`/lexicon/${trimmed.toUpperCase()}`);
      onClose();
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
          placeholder="Go to... e.g. John 3:16, G26, mercy, WCF"
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-950"
        />
        <div className="mt-2 text-sm text-gray-500">
          {trimmed === "" ? (
            "Type a Bible reference, a Strong's number, a dictionary term, or a Westminster document."
          ) : parsed ? (
            notCovered ? (
              <span className="text-amber-600 dark:text-amber-400">
                {parsed.book.name} {parsed.chapter} isn't in{" "}
                {translationLabel ?? "the selected translation"}.
              </span>
            ) : (
              <button
                className="rounded bg-blue-50 px-2 py-1 text-blue-700 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300"
                onClick={submit}
              >
                Go to {parsed.book.name} {parsed.chapter}
                {parsed.verse ? `:${parsed.verse}` : ""}
              </button>
            )
          ) : isStrongs ? (
            <button
              className="rounded bg-blue-50 px-2 py-1 text-blue-700 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300"
              onClick={submit}
            >
              Go to Strong's {trimmed.toUpperCase()}
            </button>
          ) : dictionaryMatches.length > 0 || westminsterMatches.length > 0 ? (
            <div className="space-y-1">
              {dictionaryMatches.map((d) => (
                <button
                  key={d.slug}
                  onClick={() => {
                    navigate(`/dictionary/${d.slug}`);
                    onClose();
                  }}
                  className="block w-full rounded px-2 py-1 text-left hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  📖 {d.term}
                </button>
              ))}
              {westminsterMatches.map((d) => (
                <button
                  key={d.code}
                  onClick={() => {
                    navigate(`/westminster/${d.code}`);
                    onClose();
                  }}
                  className="block w-full rounded px-2 py-1 text-left hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  📜 {d.title}
                </button>
              ))}
            </div>
          ) : (
            <span className="text-red-500">No match</span>
          )}
        </div>
      </div>
    </div>
  );
}
