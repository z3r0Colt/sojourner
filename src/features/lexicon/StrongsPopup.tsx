import { BookA, Search, Users, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { useBooks, useStrongsEntry } from "../../api/queries";
import type { FactbookSummary, MorphologyWord } from "../../api/types";
import { CAPPED_POPUP_CLASS, useViewportClampedPosition } from "../../lib/useViewportClampedPosition";
import { CommentaryHtml } from "../commentary/CommentaryPanel";
import { useHebrewDisplay } from "./originalText";
import { PaneLink as Link } from "../../workspace/PaneLink";
import { openContent, openPassage, targetFor } from "../../workspace/openContent";
import { Button, IconButton } from "../../components/ui/Button";
import { cx } from "../../components/ui/classes";
import { LoadingState } from "../../components/ui/EmptyState";
import { StudyActions } from "../sermons/StudyActions";
import { strongsRef } from "../sermons/sourceIdentity";
import { ParsingSection, parsedWordOrNull } from "./ParsingSection";
import { strongsText } from "./strongsText";
import { WebsterJump, WebsterWordSection } from "../dictionary/WebsterWordSection";
import type { ReadingPlace } from "../dictionary/websterDisplay";

/** The Strong's entry card, opened from an interlinear word or from a
 * double-clicked word in the text. With no `id` (the word could not be
 * matched to the interlinear data) it offers a lexicon search for the word
 * instead, plus an optional one-time hint. Opened for one particular Greek
 * or Hebrew word of a verse, it also shows that word's parsing under the
 * headword (see ParsingSection). Opened on a word of an English Bible, it
 * ends with the word in Webster's 1828 dictionary (see WebsterWordSection). */
export function StrongsPopup({
  id,
  word,
  loading,
  x,
  y,
  anchorTop,
  onClose,
  onSearchLexicon,
  hint,
  factbook,
  parsedWord,
  englishWord,
}: {
  id: string | null;
  /** The word that was looked up, shown when there is no entry to name. */
  word?: string;
  /** True while the match is still being worked out. */
  loading?: boolean;
  x: number;
  y: number;
  /** The top of the word the card hangs under. A card with no room below
   * the word opens above it instead, and sits clear of this line rather
   * than covering the word it is about. */
  anchorTop?: number;
  onClose: () => void;
  onSearchLexicon?: (word: string) => void;
  hint?: { text: string; onDismiss: () => void } | null;
  /** Who the double-clicked proper name means in its verse (the Factbook). */
  factbook?: FactbookSummary | null;
  /** The Greek or Hebrew word of the verse the card was opened for, when
   * it is one particular word: an interlinear word, or the tagged word a
   * double-click in the text was matched to. Its parsing is shown under the
   * headword. None when the lookup only reached the lexicon entry. */
  parsedWord?: MorphologyWord | null;
  /** The word double-clicked in an English Bible, cleaned for lookup, and
   * the chapter it was read in: Webster 1828's entry for it follows the
   * Strong's entry. None for a Greek or Hebrew word. */
  englishWord?: { word: string; place: ReadingPlace | null } | null;
}) {
  const { data: entry, isLoading } = useStrongsEntry(id);
  const hebrew = useHebrewDisplay();
  const { ref, style, capped, scrolled } = useViewportClampedPosition<HTMLDivElement>(x, y, { flipY: anchorTop, onDismiss: onClose });
  const { data: books } = useBooks();
  const { data: shelf } = useQuery({
    queryKey: ["lexiconsForStrongs", entry?.id],
    queryFn: () => api.lexiconsForStrongs(entry!.id),
    enabled: !!entry,
    staleTime: Infinity,
  });

  function jumpToRef(bookOsisCode: string, chapter: number, verse: number, e?: React.MouseEvent) {
    const target = books?.find((b) => b.osis_code === bookOsisCode);
    if (target) {
      openPassage({ bookId: target.id, chapter, verse }, { target: e ? targetFor(e) : "focused" });
      onClose();
    }
  }

  const heading = id ?? (word ? `‘${word}’` : "Word lookup");
  // The definition as Strong's wrote it (see strongsText).
  const text = entry ? strongsText(entry) : null;
  const parsed = parsedWordOrNull(parsedWord);
  // Keyed by the word, so its rows start closed again for another word.
  const parsingSection = parsed && <ParsingSection key={parsed.id} word={parsed} />;

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={id ? `Strong's ${id}` : `Lookup for ${word ?? "word"}`}
      // scroll-pt: what is scrolled into view inside the card -- its Webster
      // section, a link tabbed to -- stops below the pinned header, not under it.
      className={cx("z-40 w-80 scroll-pt-12 rounded-lg border border-line bg-surface px-3 pb-3 shadow-xl", capped && CAPPED_POPUP_CLASS)}
      style={style}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Stays put when a card too tall for the window scrolls inside itself,
          so its name and Close are never scrolled away. It carries the card's
          top padding, so there is no strip above it for the text to show
          through, and a rule under it once the card scrolls beneath it, so a
          line cut off there reads as passing under a header. */}
      <div
        className={cx(
          "sticky top-0 z-10 -mx-3 flex items-start justify-between rounded-t-lg border-b bg-surface px-3 pb-1 pt-3",
          scrolled ? "border-line" : "border-transparent",
        )}
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-3">{heading}</span>
        <span className="flex items-center">
          {/* After a Strong's entry the Webster section is often below the
              fold; say it is there. */}
          {entry && englishWord && <WebsterJump key={englishWord.word} word={englishWord.word} cardRef={ref} />}
          {entry && (
            <StudyActions
              what={entry.id}
              item={() => ({
                kind: "strongs",
                refId: strongsRef(entry.id),
                label: `${entry.original_word}${entry.transliteration ? ` (${entry.transliteration})` : ""}, ${entry.id}`,
                excerpt: text?.definition || null,
              })}
            />
          )}
          <IconButton icon={X} label="Close" size="sm" onClick={onClose} />
        </span>
      </div>
      {factbook && (
        <button
          type="button"
          onClick={(e) => {
            openContent("factbook", { id: factbook.id }, { target: targetFor(e, "new") });
            onClose();
          }}
          className="mb-2 flex w-full items-center gap-2 rounded-md border border-accent/30 bg-accent-soft px-2 py-1.5 text-left text-sm hover:bg-accent-soft-2"
        >
          <Users className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block font-medium text-accent">{factbook.name}</span>
            <span className="block truncate text-xs text-ink-3">{factbook.description !== "Place" ? factbook.description : factbook.entity_type} · Factbook</span>
          </span>
        </button>
      )}
      {(loading || (id != null && isLoading)) && <LoadingState className="py-2" />}
      {!loading && id != null && !isLoading && !entry && (
        <>
          <p className="text-sm text-ink-3">No lexicon entry found.</p>
          {parsingSection && <div className="mt-2">{parsingSection}</div>}
        </>
      )}
      {!loading && id == null && !factbook && (
        <div className="text-sm">
          <p className="mb-2 text-ink-2">No Strong's number matched this word here.</p>
          {word && onSearchLexicon && (
            <Button size="sm" variant="secondary" icon={Search} onClick={() => onSearchLexicon(word)}>
              Search the lexicon for ‘{word}’
            </Button>
          )}
        </div>
      )}
      {entry && (
        <div className="text-sm">
          <div className="mb-1 flex items-baseline gap-2">
            <span className="text-2xl text-ink" lang={entry.language === "hebrew" ? "he" : "el"} dir="auto">
              {hebrew(entry.original_word)}
            </span>
            {entry.transliteration && <span className="italic text-ink-3">{entry.transliteration}</span>}
          </div>
          {entry.pronunciation && <div className="mb-2 text-xs text-ink-3">pronounced: {entry.pronunciation}</div>}
          {parsingSection}
          {text?.definition && <p className="mb-2 text-ink-2">{text.definition}</p>}
          {entry.thayers_definition && (
            <div data-popup-inner-scroll="" className="mb-2 max-h-48 overflow-y-auto border-l-2 border-line-2 pl-2 text-xs text-ink-2">
              <span className="font-semibold text-ink-3">Thayer's: </span>
              <CommentaryHtml html={entry.thayers_definition} onJumpToRef={jumpToRef} />
            </div>
          )}
          {text?.derivation && (
            <p className="mb-1 text-xs text-ink-3">
              <span className="font-semibold">Derivation:</span> {text.derivation}
            </p>
          )}
          {entry.kjv_usage && (
            <p className="mb-2 text-xs text-ink-3">
              <span className="font-semibold">KJV usage:</span> {entry.kjv_usage}
            </p>
          )}
          {shelf && shelf.length > 0 && (
            <div className="mb-2 flex flex-wrap items-center gap-1 text-xs">
              <span className="text-ink-3">In</span>
              {shelf.map(([code, name]) => (
                <button
                  key={code}
                  type="button"
                  className="rounded-full border border-line-2 px-2 py-0.5 text-ink-2 hover:bg-hover"
                  onClick={(e) => {
                    openContent("lexicon", { id: entry.id, source: code }, { target: targetFor(e, "new") });
                    onClose();
                  }}
                >
                  {name}
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Button
              size="sm"
              variant="secondary"
              icon={BookA}
              onClick={(e) => {
                openContent("wordstudy", { id: entry.id }, { target: targetFor(e, "new") });
                onClose();
              }}
            >
              Word study
            </Button>
            <Link to={`/lexicon/${entry.id}`} className="text-sm text-accent hover:underline" onClick={onClose}>
              Full lexicon entry
            </Link>
          </div>
        </div>
      )}
      {englishWord && (
        <WebsterWordSection key={englishWord.word} word={englishWord.word} place={englishWord.place} onJumpToRef={jumpToRef} onClose={onClose} />
      )}
      {hint && (
        <div className="mt-3 flex items-start gap-2 border-t border-line pt-2 text-xs text-ink-3">
          <span className="min-w-0 flex-1">{hint.text}</span>
          <IconButton icon={X} label="Dismiss this hint" size="sm" onClick={hint.onDismiss} />
        </div>
      )}
    </div>
  );
}
