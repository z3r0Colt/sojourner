import { useState } from "react";
import { Languages, X } from "lucide-react";
import { useInterlinearForChapter, useMorphologyForChapter } from "../../api/queries";
import { useUiStore } from "../../state/uiStore";
import { StrongsPopup } from "../lexicon/StrongsPopup";
import type { Book } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { EmptyState, LoadingState } from "../../components/ui/EmptyState";
import { checkboxClass, cx } from "../../components/ui/classes";

export function InterlinearView({ book, chapter, onExit }: { book: Book; chapter: number; onExit: () => void }) {
  const { data, isLoading } = useInterlinearForChapter(book.id, chapter);
  const { data: morphology } = useMorphologyForChapter(book.id, chapter);
  const { showMorphology, toggleShowMorphology } = useUiStore();
  const [popup, setPopup] = useState<{ id: string; x: number; y: number } | null>(null);

  const verseNumbers = Object.keys(data ?? {})
    .map(Number)
    .sort((a, b) => a - b);

  function showStrongsPopup(id: string | null, e: React.MouseEvent) {
    e.stopPropagation();
    if (!id) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPopup({ id, x: rect.left, y: rect.bottom + 4 });
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6" onClick={() => setPopup(null)}>
      <div className="mx-auto w-full max-w-4xl">
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-ink-2">
          <Languages className="h-4 w-4 shrink-0 text-ink-3" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            Interlinear: KJV phrases tagged with Strong's numbers. Click any word for the original Hebrew or Greek.
          </span>
          <label className="flex items-center gap-1.5 text-sm text-ink-2">
            <input type="checkbox" className={checkboxClass} checked={showMorphology} onChange={toggleShowMorphology} />
            Original word order and grammar
          </label>
          <Button size="sm" variant="secondary" icon={X} onClick={onExit}>
            Exit interlinear
          </Button>
        </div>
        <h1 className="reading-font mb-4 text-2xl font-semibold text-ink">
          {book.name} {chapter}
        </h1>
        {isLoading && <LoadingState />}
        {!isLoading && verseNumbers.length === 0 && <EmptyState title="No interlinear data for this chapter" />}
        {verseNumbers.map((vn) => (
          <div key={vn} className="mb-5">
            <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
              <span className="mb-1 self-start font-sans text-xs font-semibold text-ink-4">{vn}</span>
              {data![vn].map((w) => (
                <button
                  key={w.id}
                  type="button"
                  disabled={!w.strongs_id}
                  onClick={(e) => showStrongsPopup(w.strongs_id, e)}
                  className={cx(
                    "reading-font flex flex-col items-center rounded-md px-1.5 py-1 text-left",
                    w.strongs_id ? "hover:bg-accent-soft" : "cursor-default",
                  )}
                >
                  <span className="text-base leading-tight text-ink">{w.text}</span>
                  {w.strongs_id && <span className="mt-0.5 font-mono text-[11px] text-accent">{w.strongs_id}</span>}
                </button>
              ))}
            </div>
            {showMorphology && morphology?.[vn] && (
              <div
                dir={book.testament === "OT" ? "rtl" : "ltr"}
                className="mt-1 flex flex-wrap items-end gap-x-3 gap-y-2 border-l-2 border-line-2 pl-3"
              >
                {morphology[vn].map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    disabled={!w.strongs_id}
                    onClick={(e) => showStrongsPopup(w.strongs_id, e)}
                    className={cx("flex flex-col items-center rounded-md px-1 py-0.5 text-right", w.strongs_id ? "hover:bg-amber-50 dark:hover:bg-amber-950/30" : "cursor-default")}
                    title={w.lemma ?? undefined}
                  >
                    <span className="text-lg leading-tight text-ink" dir="auto">
                      {w.original_word}
                    </span>
                    {w.morph_code && <span className="mt-0.5 font-mono text-[10px] text-ink-3">{w.morph_code}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        {popup && <StrongsPopup id={popup.id} x={popup.x} y={popup.y} onClose={() => setPopup(null)} />}
      </div>
    </div>
  );
}
