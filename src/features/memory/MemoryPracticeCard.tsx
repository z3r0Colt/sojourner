import { useState } from "react";
import { useBooks, useChapter, useReviewMemoryVerse } from "../../api/queries";
import { useNavigationStore } from "../../state/navigationStore";
import { useReadingTypography } from "../../state/uiStore";
import { applyMemoryMode, diffTyped, diffAccuracy } from "./memoryText";
import { GradeButtons } from "./GradeButtons";
import type { MemoryVerse } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { LoadingState } from "../../components/ui/EmptyState";
import { cx, textareaClass } from "../../components/ui/classes";
import { joinVerses } from "../../lib/passage";

/** One spaced-repetition flashcard: shows the verse in first-letter or
 * blank-word hint form, lets the reader reveal the full text once they've
 * tried recalling it, then grades their own recall. */
export function MemoryPracticeCard({ card, onDone }: { card: MemoryVerse; onDone: () => void }) {
  const { data: books } = useBooks();
  const primaryTranslationId = useNavigationStore((s) => s.primaryTranslationId);
  const translationId = card.translation_id ?? primaryTranslationId;
  const { data: verses } = useChapter(translationId, card.book_id, card.chapter);
  const review = useReviewMemoryVerse();
  const typography = useReadingTypography(1.05);
  const [revealed, setRevealed] = useState(false);
  const [typed, setTyped] = useState("");
  const [checked, setChecked] = useState(false);

  const book = books?.find((b) => b.id === card.book_id);
  const text = verses ? joinVerses(verses, card.verse_start, card.verse_end) : undefined;

  function grade(quality: number) {
    review.mutate({ id: card.id, quality });
    setRevealed(false);
    setChecked(false);
    setTyped("");
    onDone();
  }

  const diff = text && checked ? diffTyped(text, typed) : null;
  const accuracy = diff ? diffAccuracy(diff) : null;
  const suggestedQuality = accuracy == null ? null : accuracy >= 0.95 ? 5 : accuracy >= 0.8 ? 4 : accuracy >= 0.5 ? 3 : 1;

  return (
    <div className="mx-auto max-w-xl rounded-xl border border-line bg-surface p-6 shadow-sm">
      <div className="mb-3 text-sm font-semibold text-ink-3">
        {book?.name ?? `#${card.book_id}`} {card.chapter}:{card.verse_start}
        {card.verse_end !== card.verse_start ? `-${card.verse_end}` : ""}
      </div>
      {card.doctrinal_note && (
        <p className="mb-4 rounded-md border-l-2 border-accent/50 bg-accent-soft px-3 py-2 text-sm italic text-ink-2">{card.doctrinal_note}</p>
      )}
      {!text && <LoadingState />}

      {text && card.mode !== "type-it" && (
        <>
          <p className="reading-font mb-5 text-ink" style={typography}>
            {revealed ? text : applyMemoryMode(text, card.mode)}
          </p>
          {!revealed ? <Button onClick={() => setRevealed(true)}>Reveal</Button> : <GradeButtons onGrade={grade} />}
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
                className={cx(textareaClass, "reading-font mb-3 w-full")}
                style={typography}
              />
              <Button variant="primary" onClick={() => setChecked(true)}>
                Check
              </Button>
            </>
          ) : (
            <>
              <p className="reading-font mb-1 text-ink" style={typography}>
                {diff!.map((t, i) => (
                  <span
                    key={i}
                    className={
                      t.status === "correct"
                        ? undefined
                        : t.status === "wrong"
                          ? "rounded bg-red-100 text-red-800 line-through dark:bg-red-950/50 dark:text-red-400"
                          : "rounded bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-400"
                    }
                  >
                    {t.word}{" "}
                  </span>
                ))}
              </p>
              <p className="mb-4 text-xs text-ink-3">{Math.round((accuracy ?? 0) * 100)}% of words recalled correctly.</p>
              <GradeButtons onGrade={grade} suggested={suggestedQuality} />
            </>
          )}
        </>
      )}
    </div>
  );
}
