import { Columns2, X } from "lucide-react";
import { useTranslations, useParallelChapter } from "../../api/queries";
import { useReadingTypography, useUiStore } from "../../state/uiStore";
import type { Book } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { LoadingState } from "../../components/ui/EmptyState";

export function ParallelReadingView({
  book,
  chapter,
  primaryTranslationId,
  parallelTranslationIds,
  onExit,
}: {
  book: Book;
  chapter: number;
  primaryTranslationId: number | null;
  parallelTranslationIds: number[];
  onExit: () => void;
}) {
  const { data: translations } = useTranslations();
  const showVerseNumbers = useUiStore((s) => s.showVerseNumbers);
  const typography = useReadingTypography(0.95);
  const allIds = Array.from(new Set([...(primaryTranslationId ? [primaryTranslationId] : []), ...parallelTranslationIds]));
  const { data: byTranslation } = useParallelChapter(allIds, book.id, chapter);

  const verseNumbers = Array.from(
    new Set(Object.values(byTranslation ?? {}).flatMap((vs) => vs.map((v) => v.verse))),
  ).sort((a, b) => a - b);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-ink-2">
          <Columns2 className="h-4 w-4 shrink-0 text-ink-3" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            Parallel view shows the chapter in {allIds.length} translations. Highlights, notes, and the study panel come back when you exit.
          </span>
          <Button size="sm" variant="secondary" icon={X} onClick={onExit}>
            Exit parallel view
          </Button>
        </div>
        <h1 className="reading-font mb-4 text-2xl font-semibold text-ink">
          {book.name} {chapter}
        </h1>
        {!byTranslation && <LoadingState />}
        <div className="grid gap-x-8" style={{ gridTemplateColumns: `repeat(${allIds.length}, minmax(0,1fr))` }}>
          {allIds.map((tid) => (
            <div key={tid} className="sticky top-0 mb-2 bg-bg py-1 text-xs font-semibold uppercase tracking-wide text-ink-3">
              {translations?.find((t) => t.id === tid)?.name ?? translations?.find((t) => t.id === tid)?.code}
            </div>
          ))}
          {verseNumbers.map((vn) =>
            allIds.map((tid) => {
              const verse = byTranslation?.[tid]?.find((v) => v.verse === vn);
              return (
                <div key={`${tid}-${vn}`} className="reading-font mb-2 text-ink" style={typography}>
                  {showVerseNumbers && <sup className="mr-1 select-none font-sans text-xs font-semibold text-ink-4">{vn}</sup>}
                  {verse?.text ?? <span className="text-ink-4">—</span>}
                </div>
              );
            }),
          )}
        </div>
      </div>
    </div>
  );
}
