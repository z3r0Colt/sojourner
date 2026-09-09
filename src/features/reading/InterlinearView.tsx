import { useState } from "react";
import { useInterlinearForChapter, useMorphologyForChapter } from "../../api/queries";
import { useUiStore } from "../../state/uiStore";
import { StrongsPopup } from "../lexicon/StrongsPopup";
import type { Book } from "../../api/types";

export function InterlinearView({ book, chapter }: { book: Book; chapter: number }) {
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
    <div className="h-full overflow-y-auto px-6 py-4" onClick={() => setPopup(null)}>
      <div className="mb-1 flex items-center gap-3">
        <h1 className="text-xl font-semibold">
          {book.name} {chapter} <span className="text-sm font-normal text-gray-400">(interlinear)</span>
        </h1>
        <label className="flex items-center gap-1 text-xs text-gray-500">
          <input type="checkbox" checked={showMorphology} onChange={toggleShowMorphology} />
          Morphology
        </label>
      </div>
      <p className="mb-4 text-xs text-gray-400">
        KJV phrases tagged with Strong's numbers — click any word to see the original Hebrew/Greek.
        {showMorphology && " Original-language word order with grammatical codes shown below each verse."}
      </p>
      {isLoading && <p className="text-gray-400">Loading…</p>}
      {!isLoading && verseNumbers.length === 0 && (
        <p className="text-gray-400">No interlinear data available for this chapter.</p>
      )}
      {verseNumbers.map((vn) => (
        <div key={vn} className="mb-5">
          <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
            <span className="mb-1 self-start text-xs font-semibold text-gray-400">{vn}</span>
            {data![vn].map((w) => (
              <button
                key={w.id}
                disabled={!w.strongs_id}
                onClick={(e) => showStrongsPopup(w.strongs_id, e)}
                className={`reading-font flex flex-col items-center rounded px-1.5 py-1 text-left ${
                  w.strongs_id ? "hover:bg-blue-50 dark:hover:bg-blue-950/40" : "cursor-default"
                }`}
              >
                <span className="text-[15px] leading-tight">{w.text}</span>
                {w.strongs_id && (
                  <span className="mt-0.5 text-[10px] font-mono text-blue-500 dark:text-blue-400">
                    {w.strongs_id}
                  </span>
                )}
              </button>
            ))}
          </div>
          {showMorphology && morphology?.[vn] && (
            <div className="mt-1 flex flex-wrap items-end gap-x-3 gap-y-2 border-l-2 border-gray-200 pl-3 dark:border-gray-700">
              {morphology[vn].map((w) => (
                <button
                  key={w.id}
                  disabled={!w.strongs_id}
                  onClick={(e) => showStrongsPopup(w.strongs_id, e)}
                  className={`flex flex-col items-center rounded px-1 py-0.5 text-right ${
                    w.strongs_id ? "hover:bg-amber-50 dark:hover:bg-amber-950/30" : "cursor-default"
                  }`}
                  title={w.lemma ?? undefined}
                >
                  <span className="text-base leading-tight" dir="auto">
                    {w.original_word}
                  </span>
                  {w.morph_code && <span className="mt-0.5 text-[9px] font-mono text-gray-400">{w.morph_code}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}

      {popup && <StrongsPopup id={popup.id} x={popup.x} y={popup.y} onClose={() => setPopup(null)} />}
    </div>
  );
}
