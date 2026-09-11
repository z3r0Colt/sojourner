import { useCallback, useState } from "react";
import { BookOpen } from "lucide-react";
import { useBooks, useChapter, useReviewMemoryVerse } from "../../api/queries";
import { useReaderTranslationId } from "../../state/workspaceStore";
import { useReadingTypography } from "../../state/uiStore";
import { applyMemoryMode, diffTyped, diffAccuracy } from "./memoryText";
import { GradeButtons } from "./GradeButtons";
import { usePracticeKeys } from "./practiceKeys";
import type { MemoryVerse } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { LoadingState } from "../../components/ui/EmptyState";
import { Kbd } from "../../components/ui/Page";
import { cx, textareaClass } from "../../components/ui/classes";
import { joinVerses } from "../../lib/passage";
import { openPassage, targetFor } from "../../workspace/openContent";

/** One spaced-repetition flashcard: shows the verse in first-letter or
 * blank-word hint form, lets the reader reveal the full text once they've
 * tried recalling it, then grades their own recall. Space reveals, Enter
 * checks a typed answer, 1 to 4 grade, Backspace goes back (F2.6). */
export function MemoryPracticeCard({ card, onDone, onBack }: { card: MemoryVerse; onDone: () => void; onBack?: () => void }) {
  const { data: books } = useBooks();
  const primaryTranslationId = useReaderTranslationId();
  const translationId = card.translation_id ?? primaryTranslationId;
  const { data: verses } = useChapter(translationId, card.book_id, card.chapter);
  const review = useReviewMemoryVerse();
  const typography = useReadingTypography(1.05);
  const [revealed, setRevealed] = useState(false);
  const [typed, setTyped] = useState("");
  const [checked, setChecked] = useState(false);

  const book = books?.find((b) => b.id === card.book_id);
  const text = verses ? joinVerses(verses, card.verse_start, card.verse_end) : undefined;
  const typeIt = card.mode === "type-it";
  const answerShowing = !!text && (typeIt ? checked : revealed);

  const grade = useCallback(
    (quality: number) => {
      review.mutate({ id: card.id, quality });
      setRevealed(false);
      setChecked(false);
      setTyped("");
      onDone();
    },
    [review, card.id, onDone],
  );
  const reveal = useCallback(() => setRevealed(true), []);
  const check = useCallback(() => setChecked(true), []);

  usePracticeKeys({
    onReveal: text && !typeIt && !revealed ? reveal : undefined,
    onCheck: text && typeIt && !checked ? check : undefined,
    onGrade: answerShowing ? grade : undefined,
    onBack,
  });

  const diff = text && checked ? diffTyped(text, typed) : null;
  const accuracy = diff ? diffAccuracy(diff) : null;
  const suggestedQuality = accuracy == null ? null : accuracy >= 0.95 ? 5 : accuracy >= 0.8 ? 4 : accuracy >= 0.5 ? 3 : 1;
  const reference = `${book?.name ?? `#${card.book_id}`} ${card.chapter}:${card.verse_start}${card.verse_end !== card.verse_start ? `-${card.verse_end}` : ""}`;

  return (
    <div className="mx-auto max-w-xl rounded-xl border border-line bg-surface p-6 shadow-sm">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div className="text-sm font-semibold text-ink-3">{reference}</div>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
          title={`Open ${reference} in the Bible with the verse selected (Ctrl+click for a new pane)`}
          onClick={(e) => openPassage({ bookId: card.book_id, chapter: card.chapter, verse: card.verse_start }, { target: targetFor(e) })}
          onAuxClick={(e) => e.button === 1 && openPassage({ bookId: card.book_id, chapter: card.chapter, verse: card.verse_start }, { target: "new" })}
        >
          <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
          Read in context
        </button>
      </div>
      {card.doctrinal_note && (
        <p className="mb-4 rounded-md border-l-2 border-accent/50 bg-accent-soft px-3 py-2 text-sm italic text-ink-2">{card.doctrinal_note}</p>
      )}
      {!text && <LoadingState />}

      {text && !typeIt && (
        <>
          <p className="reading-font mb-5 text-ink" style={typography}>
            {revealed || card.mode === "type-it" ? text : applyMemoryMode(text, card.mode)}
          </p>
          {!revealed ? (
            <Button onClick={reveal} aria-keyshortcuts="Space">
              Reveal
              <Kbd>Space</Kbd>
            </Button>
          ) : (
            <GradeButtons onGrade={grade} />
          )}
        </>
      )}

      {text && typeIt && (
        <>
          {!checked ? (
            <>
              <textarea
                autoFocus
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                rows={4}
                placeholder="Type the verse from memory… (Enter checks, Shift+Enter for a new line)"
                className={cx(textareaClass, "reading-font mb-3 w-full")}
                style={typography}
              />
              <Button variant="primary" onClick={check} aria-keyshortcuts="Enter">
                Check
                <Kbd>Enter</Kbd>
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
