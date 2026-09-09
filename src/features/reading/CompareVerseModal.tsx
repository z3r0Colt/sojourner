import { useCompareVerse, useTranslations } from "../../api/queries";
import type { Book } from "../../api/types";

/** Lighter-weight single-verse comparison across every installed translation
 * that covers it, opened from a verse's context menu -- distinct from full
 * chapter Parallel mode, which shows a whole chapter in a handful of
 * translations picked ahead of time. */
export function CompareVerseModal({
  book,
  chapter,
  verse,
  onClose,
}: {
  book: Book;
  chapter: number;
  verse: number;
  onClose: () => void;
}) {
  const { data: translations } = useTranslations();
  const { data: results } = useCompareVerse(book.id, chapter, verse);

  function translationName(id: number) {
    const t = translations?.find((t) => t.id === id);
    return t?.name ?? t?.code ?? `#${id}`;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6" onClick={onClose}>
      <div
        className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-lg bg-white shadow-xl dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 p-3 dark:border-gray-800">
          <h3 className="text-sm font-semibold">
            {book.name} {chapter}:{verse}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" title="Close">
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {!results && <p className="text-sm text-gray-400">Loading…</p>}
          {results?.length === 0 && <p className="text-sm text-gray-400">No translation has this verse.</p>}
          <div className="space-y-3">
            {results?.map((v) => (
              <div key={v.translation_id}>
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  {translationName(v.translation_id)}
                </div>
                <p className="reading-font text-[15px] leading-relaxed">{v.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
