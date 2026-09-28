import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, MapPin } from "lucide-react";
import { useBooks, useChapter, useMemoryVerses, useReviewMemoryVerse, useSetMemoryVerseTranslation } from "../../api/queries";
import { useReaderTranslationId } from "../../state/workspaceStore";
import { TranslationPick } from "./TranslationPick";
import { toast } from "../../components/ui/toast";
import { useReadingTypography } from "../../state/uiStore";
import { applyMemoryMode, askWhere, diffTyped, diffAccuracy, memoryWords, referenceMatches } from "./memoryText";
import { GradeButtons } from "./GradeButtons";
import { usePracticeKeys } from "./practiceKeys";
import type { MemoryVerse } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { LoadingState } from "../../components/ui/EmptyState";
import { Kbd } from "../../components/ui/Page";
import { cx, inputClass, textareaClass } from "../../components/ui/classes";
import { joinVerses } from "../../lib/passage";
import { parseReference, useBookLookup } from "../../hooks/useReferenceParser";
import { openPassage, targetFor } from "../../workspace/openContent";
import { ReadAloudButton } from "../tts/ReadAloudButton";
import { useTtsStore } from "../../state/ttsStore";
import { cardVerses, listenOffered, memoryCardKey, memorySegments, readingGivesAway, verseBeingRead, type CardVerse } from "./memorySpeech";
import { passageMarkStyle } from "../tts/ReadAloudWords";

/** One spaced-repetition flashcard. Asked the usual way it shows the verse
 * in first-letter or blank-word form (or an empty box, to type it) and the
 * reader recalls the words. A card that also practises its reference is,
 * every other time, asked the other way round: shown the words, say where
 * they are. Space reveals, Enter checks a typed answer, 1 to 4 grade,
 * Backspace goes back (F2.6). */
export function MemoryPracticeCard({ card, onDone, onBack }: { card: MemoryVerse; onDone: () => void; onBack?: () => void }) {
  const { data: books } = useBooks();
  const lookup = useBookLookup();
  const primaryTranslationId = useReaderTranslationId();
  // The session queue holds the card as it was when practice began; the
  // translation is read live so changing it here takes effect at once.
  const { data: deck } = useMemoryVerses();
  const live = deck?.find((v) => v.id === card.id);
  const pinnedTranslationId = live?.translation_id ?? card.translation_id;
  // So is the practice mode: changed in the list while a session was under
  // way (or before one began from a queue not yet refreshed), the card kept
  // showing first letters after it had been set to blank words.
  const mode = live?.mode ?? card.mode;
  const translationId = pinnedTranslationId ?? primaryTranslationId;
  const { data: verses } = useChapter(translationId, card.book_id, card.chapter);
  const review = useReviewMemoryVerse();
  const setTranslation = useSetMemoryVerseTranslation();
  const typography = useReadingTypography(1.05);
  const [revealed, setRevealed] = useState(false);
  const [typed, setTyped] = useState("");
  const [checked, setChecked] = useState(false);

  const book = books?.find((b) => b.id === card.book_id);
  const text = verses ? joinVerses(verses.map((v) => ({ ...v, text: memoryWords(v.text) })), card.verse_start, card.verse_end) : undefined;
  const typeIt = mode === "type-it";
  const where = askWhere(card);
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

  const reference = `${book?.name ?? `#${card.book_id}`} ${card.chapter}:${card.verse_start}${card.verse_end !== card.verse_start ? `-${card.verse_end}` : ""}`;

  // Typing the words: compared word by word. Typing the reference: right
  // or not.
  const diff = !where && text && checked ? diffTyped(text, typed) : null;
  const accuracy = diff ? diffAccuracy(diff) : null;
  const typedRef = where && checked ? parseReference(typed, lookup) : null;
  const refRight = where && checked ? referenceMatches(typedRef ? { bookId: typedRef.book.id, chapter: typedRef.chapter, verse: typedRef.verse } : null, card) : null;
  const suggestedQuality = where
    ? refRight == null
      ? null
      : refRight
        ? 5
        : 1
    : accuracy == null
      ? null
      : accuracy >= 0.95
        ? 5
        : accuracy >= 0.8
          ? 4
          : accuracy >= 0.5
            ? 3
            : 1;

  // What Listen says: the reference and then the words a verse at a time,
  // or -- asked where -- only the words, so hearing it does not give the
  // answer away (memorySegments). Nothing until the words are loaded.
  const cardKey = memoryCardKey(card.id);
  const listen = useMemo(
    () => memorySegments({ key: cardKey, reference, verses: cardVerses(verses, card.verse_start, card.verse_end), askWhere: where }),
    [cardKey, card.verse_start, card.verse_end, reference, verses, where],
  );
  const referenceShown = !where || answerShowing;

  // A reading that outlived its card must not answer it when it comes back.
  // Graded and then brought back with Backspace, or met again on "Practice
  // again", a card shows its answer hidden -- and Listen hidden with it -- while
  // the reading it started last time is still saying its verses (or "Listen to
  // what's due", left playing, is about to say them). That reading is stopped
  // here; the reader can press Listen again once the answer is showing.
  const givesAway = useTtsStore((s) => readingGivesAway(s.segments, { key: cardKey, askWhere: where, answerShowing }));
  useEffect(() => {
    if (!givesAway) return;
    // Asked again of the store rather than trusted from the render: an effect
    // run twice (StrictMode) should neither stop nor say so twice.
    const tts = useTtsStore.getState();
    if (!readingGivesAway(tts.segments, { key: cardKey, askWhere: where, answerShowing })) return;
    const audible = tts.isPlaying;
    tts.stop();
    if (audible) toast.info("Stopped reading aloud, so it won't give the answer away.");
  }, [givesAway, cardKey, where, answerShowing]);

  return (
    <div className="mx-auto max-w-xl rounded-xl border border-line bg-surface p-6 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {referenceShown ? (
            <span className="text-sm font-semibold text-ink-3">{reference}</span>
          ) : (
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-accent">
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
              Where is this?
            </span>
          )}
          {/* Which words are being learned: the card's translation, or the
              reader's when none is pinned. Changing it here re-fetches the
              text, so a card added in the wrong translation is put right
              without leaving the practice. */}
          <TranslationPick
            value={pinnedTranslationId}
            onChange={(translationId) =>
              setTranslation.mutate({ id: card.id, translationId }, { onError: (e) => toast.error(e instanceof Error ? e.message : String(e)) })
            }
          />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* Asked for the words, hearing them is the answer: Listen waits
              until it is showing. Asked where, it is there from the start. */}
          {listenOffered({ askWhere: where, answerShowing }) && (
            // Space and Enter on Listen press Listen. The practice keys are
            // heard on the window -- Space reveals, Enter checks -- and they
            // used to take those keys from under the focused button: a reader
            // who tabbed to Listen on a "Where is this?" card and pressed
            // Space was shown the reference and heard nothing.
            <span
              className="contents"
              onKeyDown={(e) => {
                if (e.key === " " || e.key === "Enter") e.stopPropagation();
              }}
            >
              <ReadAloudButton
                // Asked where, the title cannot be the reference -- that is
                // the answer -- and a card's number means nothing to the
                // reader, so it says what the card is asking.
                title={`Memory: ${where ? "Where is this?" : reference}`}
                sameTitleForMany={where}
                sourceKind="scripture"
                segments={listen}
                iconOnly
              />
            </span>
          )}
          {referenceShown && (
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
          )}
        </div>
      </div>
      {card.doctrinal_note && (
        <p className="mb-4 rounded-md border-l-2 border-accent/50 bg-accent-soft px-3 py-2 text-sm italic text-ink-2">{card.doctrinal_note}</p>
      )}
      {!verses && <LoadingState />}
      {/* The chapter came back without these verses: the card is pinned to a
          translation that lacks the book (a translation of the New Testament
          alone, say), or its range runs
          past the chapter's end. Say so, rather than load forever. */}
      {verses && !text && (
        <div>
          <p className="mb-4 text-sm text-ink-2">
            {reference} is not in this translation. Choose another in the box above, or skip the card for now.
          </p>
          <Button onClick={onDone}>Skip it</Button>
        </div>
      )}

      {text && where && (
        <>
          <p className="reading-font mb-5 text-ink" style={typography}>
            <CardWords verses={cardVerses(verses, card.verse_start, card.verse_end)} cardKey={cardKey} />
          </p>
          {!typeIt && !revealed && (
            <Button onClick={reveal} aria-keyshortcuts="Space">
              Show where
              <Kbd>Space</Kbd>
            </Button>
          )}
          {!typeIt && revealed && (
            <>
              <p className="mb-4 text-lg font-semibold text-ink">{reference}</p>
              <GradeButtons onGrade={grade} />
            </>
          )}
          {typeIt && !checked && (
            <div className="flex flex-wrap items-center gap-2">
              <input
                autoFocus
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder="Book chapter:verse (Enter checks)"
                aria-label="Where this is"
                className={cx(inputClass, "min-w-48 flex-1")}
              />
              <Button variant="primary" onClick={check} aria-keyshortcuts="Enter">
                Check
                <Kbd>Enter</Kbd>
              </Button>
            </div>
          )}
          {typeIt && checked && (
            <>
              <p className={cx("mb-1 text-sm font-medium", refRight ? "text-green-700 dark:text-green-400" : "text-danger")}>
                {refRight ? "Right." : typed.trim() ? `Not quite: you wrote ${typed.trim()}.` : "Nothing typed."}
              </p>
              <p className="mb-4 text-lg font-semibold text-ink">{reference}</p>
              <GradeButtons onGrade={grade} suggested={suggestedQuality} />
            </>
          )}
        </>
      )}

      {text && !where && !typeIt && (
        <>
          <p className="reading-font mb-5 text-ink" style={typography}>
            {revealed ? (
              <CardWords verses={cardVerses(verses, card.verse_start, card.verse_end)} cardKey={cardKey} />
            ) : (
              applyMemoryMode(text, mode as "first-letter" | "blank-word")
            )}
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

      {text && !where && typeIt && (
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

/**
 * A card's words, the verse being read aloud marked. The player said "v. 1"
 * and the card showed nothing -- a verse being read looked just like one that
 * was not -- where a Bible chapter or a commentary entry being read is
 * marked. Verses are joined as the card joins them, so the words are the same.
 */
function CardWords({ verses, cardKey }: { verses: CardVerse[]; cardKey: string }) {
  const speaking = useTtsStore((s) => (s.isPlaying ? verseBeingRead(s.segments[s.currentSegmentIndex]?.id, cardKey) : null));
  const highlightColor = useTtsStore((s) => s.highlightColor);
  const highlightStyle = useTtsStore((s) => s.highlightStyle);
  return (
    <>
      {verses.map((v, i) => (
        <Fragment key={v.verse}>
          {i > 0 && " "}
          <span style={v.verse === speaking ? passageMarkStyle(highlightColor, highlightStyle) : undefined}>{v.text.trim()}</span>
        </Fragment>
      ))}
    </>
  );
}
