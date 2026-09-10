import { useState } from "react";
import { useBooks, useChapter, useReviewMemoryVerse } from "../../api/queries";
import { useNavigationStore } from "../../state/navigationStore";
import { applyMemoryMode, diffTyped, diffAccuracy } from "./memoryText";
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
  const [typed, setTyped] = useState("");
  const [checked, setChecked] = useState(false);

  const book = books?.find((b) => b.id === card.book_id);
  const text = verses
    ?.filter((v) => v.verse >= card.verse_start && v.verse <= card.verse_end)
    .map((v) => v.text)
    .join(" ");

  function grade(quality: number) {
    review.mutate({ id: card.id, quality });
    setRevealed(false);
    setChecked(false);
    setTyped("");
    onDone();
  }

  const diff = text && checked ? diffTyped(text, typed) : null;
  const accuracy = diff ? diffAccuracy(diff) : null;
  // A reasonable default grade from typed accuracy -- still just a starting
  // point, the reader clicks whichever button actually matches how it felt.
  const suggestedQuality = accuracy == null ? null : accuracy >= 0.95 ? 5 : accuracy >= 0.8 ? 4 : accuracy >= 0.5 ? 3 : 1;

  return (
    <div className="mx-auto max-w-xl rounded-lg border border-gray-200 p-6 dark:border-gray-800">
      <div className="mb-3 text-sm font-semibold text-gray-500">
        {book?.name ?? `#${card.book_id}`} {card.chapter}:{card.verse_start}
        {card.verse_end !== card.verse_start ? `-${card.verse_end}` : ""}
      </div>
      {!text && <p className="text-gray-400">Loading…</p>}

      {text && card.mode !== "type-it" && (
        <>
          <p className="reading-font mb-4 text-lg leading-relaxed">{revealed ? text : applyMemoryMode(text, card.mode)}</p>
          {!revealed ? (
            <button
              onClick={() => setRevealed(true)}
              className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Reveal
            </button>
          ) : (
            <GradeButtons onGrade={grade} />
          )}
        </>
      )}

      {text && card.mode === "type-it" && (
        <>
          {!checked ? (
            <>
              <textarea
                autoFocus
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                rows={4}
                placeholder="Type the verse from memory…"
                className="reading-font mb-3 w-full rounded border border-gray-300 px-3 py-2 text-lg leading-relaxed dark:border-gray-700 dark:bg-gray-950"
              />
              <button
                onClick={() => setChecked(true)}
                className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
              >
                Check
              </button>
            </>
          ) : (
            <>
              <p className="reading-font mb-1 text-lg leading-relaxed">
                {diff!.map((t, i) => (
                  <span
                    key={i}
                    className={
                      t.status === "correct"
                        ? undefined
                        : t.status === "wrong"
                          ? "rounded bg-red-100 text-red-700 line-through dark:bg-red-950/50 dark:text-red-400"
                          : "rounded bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400"
                    }
                  >
                    {t.word}{" "}
                  </span>
                ))}
              </p>
              <p className="mb-4 text-xs text-gray-400">{Math.round((accuracy ?? 0) * 100)}% of words recalled correctly.</p>
              <GradeButtons onGrade={grade} suggested={suggestedQuality} />
            </>
          )}
        </>
      )}
    </div>
  );
}

function GradeButtons({ onGrade, suggested }: { onGrade: (q: number) => void; suggested?: number | null }) {
  const options = [
    { q: 1, label: "Again", cls: "bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-950 dark:text-red-300" },
    { q: 3, label: "Hard", cls: "bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-950 dark:text-amber-300" },
    { q: 4, label: "Good", cls: "bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-950 dark:text-green-300" },
    { q: 5, label: "Easy", cls: "bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-950 dark:text-blue-300" },
  ];
  return (
    <div>
      <p className="mb-2 text-xs text-gray-400">How well did you recall it?</p>
      <div className="flex gap-2">
        {options.map((o) => (
          <button
            key={o.q}
            onClick={() => onGrade(o.q)}
            className={`rounded px-3 py-1.5 text-sm ${o.cls} ${suggested === o.q ? "ring-2 ring-offset-1 ring-current" : ""}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
