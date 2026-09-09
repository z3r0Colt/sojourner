import { useTranslations, useParallelChapter } from "../../api/queries";
import { useUiStore } from "../../state/uiStore";
import type { Book } from "../../api/types";

export function ParallelReadingView({
  book,
  chapter,
  primaryTranslationId,
  parallelTranslationIds,
}: {
  book: Book;
  chapter: number;
  primaryTranslationId: number | null;
  parallelTranslationIds: number[];
}) {
  const { data: translations } = useTranslations();
  const { fontSize, showVerseNumbers } = useUiStore();
  const allIds = Array.from(new Set([...(primaryTranslationId ? [primaryTranslationId] : []), ...parallelTranslationIds]));
  const { data: byTranslation } = useParallelChapter(allIds, book.id, chapter);

  const verseNumbers = Array.from(
    new Set(Object.values(byTranslation ?? {}).flatMap((vs) => vs.map((v) => v.verse))),
  ).sort((a, b) => a - b);

  return (
    <div className="h-full overflow-y-auto px-6 py-4">
      <h1 className="mb-3 text-xl font-semibold">
        {book.name} {chapter}
      </h1>
      <div className="grid gap-x-6" style={{ gridTemplateColumns: `repeat(${allIds.length}, minmax(0,1fr))` }}>
        {allIds.map((tid) => (
          <div key={tid} className="mb-2 text-xs font-semibold text-gray-500">
            {translations?.find((t) => t.id === tid)?.code}
          </div>
        ))}
        {verseNumbers.map((vn) =>
          allIds.map((tid) => {
            const verse = byTranslation?.[tid]?.find((v) => v.verse === vn);
            return (
              <div key={`${tid}-${vn}`} className="reading-font mb-2 leading-relaxed" style={{ fontSize }}>
                {showVerseNumbers && <sup className="mr-1 text-xs font-semibold text-gray-400">{vn}</sup>}
                {verse?.text ?? <span className="text-gray-300">—</span>}
              </div>
            );
          }),
        )}
      </div>
    </div>
  );
}
