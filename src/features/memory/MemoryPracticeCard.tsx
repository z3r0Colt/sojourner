import { useState } from "react";
import { useBooks, useChapter, useReviewMemoryVerse } from "../../api/queries";
import { useNavigationStore } from "../../state/navigationStore";
import { applyMemoryMode } from "./memoryText";
import type { MemoryVerse } from "../../api/types";

/** One spaced-repetition flashcard: shows the verse in first-letter or
 * blank-word hint form, lets the reader reveal the full text once they've
 * tried recalling it, then grades their own recall (SM-2's "quality"
 * ratings, collapsed to four buttons a person can actually judge
 * themselves by rather than an opaque 0-5 scale). */
export function MemoryPracticeCard({ card, onDone }: { card: MemoryVerse; onDone: () => void }) {
  const { data: books } = useBooks();
  const primaryTranslationId = useNavigationStore((s) => s.primaryTranslationId);
  const translationId = card.translation_id ?? primaryTranslationId;
  const { data: verses } = useChapter(translationId, card.book_id, card.chapter);
  const review = useReviewMemoryVerse();
  const [revealed, setRevealed] = useState(false);

  const book = books?.find((b) => b.id === card.book_id);
  const text = verses
    ?.filter((v) => v.verse >= card.verse_start && v.verse <= card.verse_end)
    .map((v) => v.text)
    .join(" ");

  function grade(quality: number) {
    review.mutate({ id: card.id, quality });
    setRevealed(false);
    onDone();
  }

  return (
    <div className="mx-auto max-w-xl rounded-lg border border-gray-200 p-6 dark:border-gray-800">
      <div className="mb-3 text-sm font-semibold text-gray-500">
        {book?.name ?? `#${card.book_id}`} {card.chapter}:{card.verse_start}
        {card.verse_end !== card.verse_start ? `-${card.verse_end}` : ""}
      </div>
      {!text && <p className="text-gray-400">Loading…</p>}
      {text && (
        <p className="reading-font mb-4 text-lg leading-relaxed">
          {revealed ? text : applyMemoryMode(text, card.mode)}
        </p>
      )}
      {!revealed ? (
        <button
          onClick={() => setRevealed(true)}
          className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          Reveal
        </button>
      ) : (
        <div>
          <p className="mb-2 text-xs text-gray-400">How well did you recall it?</p>
          <div className="flex gap-2">
            <button onClick={() => grade(1)} className="rounded bg-red-100 px-3 py-1.5 text-sm text-red-700 hover:bg-red-200 dark:bg-red-950 dark:text-red-300">
              Again
            </button>
            <button onClick={() => grade(3)} className="rounded bg-amber-100 px-3 py-1.5 text-sm text-amber-700 hover:bg-amber-200 dark:bg-amber-950 dark:text-amber-300">
              Hard
            </button>
            <button onClick={() => grade(4)} className="rounded bg-green-100 px-3 py-1.5 text-sm text-green-700 hover:bg-green-200 dark:bg-green-950 dark:text-green-300">
              Good
            </button>
            <button onClick={() => grade(5)} className="rounded bg-blue-100 px-3 py-1.5 text-sm text-blue-700 hover:bg-blue-200 dark:bg-blue-950 dark:text-blue-300">
              Easy
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
