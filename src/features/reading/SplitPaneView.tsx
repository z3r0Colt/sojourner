import { useState } from "react";
import { useBooks, useChapter, useTranslations } from "../../api/queries";
import { ChapterNav } from "./ChapterNav";
import type { Position } from "../../state/navigationStore";

/** A second, independently-navigable read-only chapter view -- lets the
 * reader keep a cross-reference, a parallel passage, or tomorrow's reading
 * plan chapter open beside whatever they're studying in the main pane,
 * without losing their place there. No highlighting/notes here; it's a
 * secondary reading surface, not a second copy of the full editing UI. */
export function SplitPaneView({ initialPosition }: { initialPosition: Position }) {
  const { data: books } = useBooks();
  const { data: translations } = useTranslations();
  const [position, setPosition] = useState<Position>(initialPosition);
  const [translationId, setTranslationId] = useState<number | null>(null);

  const effectiveTranslationId = translationId ?? translations?.[0]?.id ?? null;
  const { data: verses } = useChapter(effectiveTranslationId, position.bookId, position.chapter);
  const book = books?.find((b) => b.id === position.bookId);

  if (!books || !translations) return <div className="p-3 text-sm text-gray-400">Loading…</div>;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-gray-200 p-2 dark:border-gray-800">
        <ChapterNav books={books} position={position} translationId={effectiveTranslationId} onNavigate={setPosition} />
        <select
          value={effectiveTranslationId ?? ""}
          onChange={(e) => setTranslationId(Number(e.target.value))}
          className="rounded border border-gray-300 bg-white px-1.5 py-1 text-xs dark:border-gray-700 dark:bg-gray-900"
        >
          {translations.map((t) => (
            <option key={t.id} value={t.id}>
              {t.code}
            </option>
          ))}
        </select>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <h2 className="mb-2 text-sm font-semibold">
          {book?.name} {position.chapter}
        </h2>
        <p className="reading-font text-sm leading-relaxed">
          {verses?.map((v) => (
            <span key={v.id}>
              <sup className="mr-0.5 select-none text-xs font-semibold text-gray-400">{v.verse}</sup>
              {v.text}{" "}
            </span>
          ))}
        </p>
      </div>
    </div>
  );
}
