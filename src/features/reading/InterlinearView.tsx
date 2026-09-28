import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Languages, X } from "lucide-react";
import { useInterlinearForChapter, useMorphologyForChapter } from "../../api/queries";
import { useUiStore, type InterlinearLayout } from "../../state/uiStore";
import { StrongsPopup } from "../lexicon/StrongsPopup";
import { ParsingHoverCard } from "../lexicon/ParsingHoverCard";
import { parsedWordOrNull, type ParsedWord } from "../lexicon/ParsingSection";
import { compactParsingPieces } from "../lexicon/parsingDisplay";
import type { Book, InterlinearWord, MorphologyWord, MorphParsing } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { EmptyState, LoadingState } from "../../components/ui/EmptyState";
import { cx } from "../../components/ui/classes";
import { readerIsScrolling } from "../../lib/useViewportClampedPosition";
import { taggedWordForStrongs } from "./wordLookup";
import { alignVerse, phraseWord, type VerseAlignment } from "./interlinearAlign";

/** How long the pointer rests on a word before its parsing card shows, so
 * that running the pointer along a line does not flash a card for every
 * word it crosses. Reaching a word with the keyboard shows it at once. */
const HOVER_CARD_DELAY_MS = 250;

export function InterlinearView({
  book,
  chapter,
  verse,
  onExit,
}: {
  book: Book;
  chapter: number;
  /** The verse the pane is at: one a linked Bible pane was clicked in, or
   * one it was opened at. The chapter is scrolled to it once it has drawn. */
  verse?: number | null;
  onExit: () => void;
}) {
  const { data, isLoading } = useInterlinearForChapter(book.id, chapter);
  const { data: morphology } = useMorphologyForChapter(book.id, chapter);
  const { showMorphology, toggleShowMorphology, interlinearLayout, setInterlinearLayout } = useUiStore();
  /** Which of the three ways the pane shows the verse: the English alone,
   * or with the original under each phrase or in its own order. "English
   * only" is the Settings switch for the original words, which the pane's
   * old checkbox was too. */
  const layout: LayoutChoice = showMorphology ? interlinearLayout : "english";
  function chooseLayout(choice: LayoutChoice) {
    if (choice === "english") {
      if (showMorphology) toggleShowMorphology();
      return;
    }
    setInterlinearLayout(choice);
    if (!showMorphology) toggleShowMorphology();
  }
  const [popup, setPopup] = useState<{
    id: string;
    x: number;
    y: number;
    anchorTop: number;
    word: MorphologyWord | null;
    fromKeyboard: boolean;
  } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  /** The word the Strong's card was opened from, for the focus to go back to. */
  const popupOpener = useRef<HTMLElement | null>(null);
  const [hoverCard, setHoverCard] = useState<{ word: ParsedWord; x: number; y: number; flipY: number; fromKeyboard: boolean } | null>(null);
  /** The word the parsing card is over, to find it again when the chapter moves. */
  const hoverAnchor = useRef<HTMLElement | null>(null);
  const hoverTimer = useRef<number | null>(null);
  const hoverCardId = useId();

  const verseNumbers = Object.keys(data ?? {})
    .map(Number)
    .sort((a, b) => a - b);

  /** Each verse's phrases with the words they translate. Worked out for
   * every layout: the Strong's card of an English phrase shows the parsing
   * of the one word the phrase translates, whichever way the verse is laid
   * out -- John 1:1's second "God" is θεός, where its number alone could not
   * say which of the verse's two it was. */
  const alignment = useMemo(() => {
    const byVerse = new Map<number, VerseAlignment>();
    for (const [vn, phrases] of Object.entries(data ?? {})) {
      byVerse.set(Number(vn), alignVerse(phrases, morphology?.[Number(vn)] ?? []));
    }
    return byVerse;
  }, [data, morphology]);

  /** The word the Strong's card parses for an English phrase: the one it
   * translates, or, where it translates several that all parse alike, the
   * first of them. */
  function wordForPhrase(vn: number, index: number, phrase: InterlinearWord): MorphologyWord | null {
    return phraseWord(alignment.get(vn)?.phrases[index]) ?? taggedWordForStrongs(phrase.strongs_id, morphology?.[vn] ?? []);
  }

  /** Opens the Strong's card under a word. From a Greek or Hebrew word the
   * card also parses that word; from an English phrase, the original word
   * its Strong's number stands on, when the verse has only the one. */
  function showStrongsPopup(id: string | null, e: React.MouseEvent, word: MorphologyWord | null) {
    e.stopPropagation();
    hideHoverCard();
    if (!id) return;
    const opener = e.currentTarget as HTMLElement;
    popupOpener.current = opener;
    const rect = opener.getBoundingClientRect();
    // A click with no pointer behind it (`detail` 0) is Enter or Space on
    // the word.
    setPopup({ id, x: rect.left, y: rect.bottom + 4, anchorTop: rect.top, word, fromKeyboard: e.detail === 0 });
  }

  /** Closes the Strong's card. A focus that was in it goes back to the word
   * it was opened from, rather than to the top of the window when the
   * button it was on goes. */
  const closePopup = useCallback(() => {
    const focusWasInCard = !!cardRef.current?.contains(document.activeElement);
    const opener = popupOpener.current;
    popupOpener.current = null;
    setPopup(null);
    if (focusWasInCard && opener?.isConnected) opener.focus({ preventScroll: true });
  }, []);

  /** A click in the chapter closes the card; a click in the card does not.
   * The card is drawn inside this scroller, so every click on it -- a
   * Parsing row opening, a lexicon chip, the definition's text -- bubbles up
   * here too, and closed the card the reader was using. */
  function closeCardOnClickOutside(e: React.MouseEvent) {
    if (e.target instanceof Node && cardRef.current?.contains(e.target)) return;
    popupOpener.current = null;
    setPopup(null);
  }

  // Escape closes the card, from the word or from inside the card, as the
  // reading pane's does. It is heard before anything else hears it, so that
  // it closes only the card -- unless a dialog is open over the card (the
  // Go to palette, opened with Ctrl K while the card was up), which is the
  // top layer and has the key to itself. Both listen on the window as it
  // captures, and the card, opened first, heard it first: one Escape closed
  // the palette and the card under it.
  const popupOpen = popup != null;
  useEffect(() => {
    if (!popupOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape" || modalAboveCard(cardRef.current)) return;
      e.stopPropagation();
      closePopup();
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [popupOpen, closePopup]);

  // Opened from the keyboard, the card takes the focus: it is drawn after
  // the whole chapter, and a reader left on the word would Tab through every
  // word after it to reach the card's Close. The card is a dialog; focused
  // itself rather than its first button, it is read out by its name.
  useEffect(() => {
    if (!popup?.fromKeyboard) return;
    const dialog = cardRef.current?.querySelector<HTMLElement>('[role="dialog"]');
    if (!dialog) return;
    if (!dialog.hasAttribute("tabindex")) dialog.tabIndex = -1;
    dialog.focus({ preventScroll: true });
  }, [popup]);

  function cancelHoverCard() {
    if (hoverTimer.current != null) window.clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
  }
  function hideHoverCard() {
    cancelHoverCard();
    hoverAnchor.current = null;
    setHoverCard(null);
  }
  function showHoverCard(word: ParsedWord, el: HTMLElement, fromKeyboard = false) {
    cancelHoverCard();
    hoverAnchor.current = el;
    const rect = el.getBoundingClientRect();
    setHoverCard({ word, x: rect.left + rect.width / 2, y: rect.top, flipY: rect.bottom, fromKeyboard });
  }
  /** The chapter moved under the parsing card. A card the pointer called up
   * goes: the word has moved out from under the pointer. A card the keyboard
   * called up follows its word, unless the reader is the one scrolling. Tab
   * to a word below the fold and the browser brings it into view only after
   * the focus that shows its card, and that scroll -- nobody's but the
   * browser's -- took the card away again at once, leaving the keyboard
   * reader no parsing for any word they had to scroll to, and a card measured
   * where the word was before it moved. */
  function followOrHideHoverCard(e: React.UIEvent<HTMLElement>) {
    const anchor = hoverAnchor.current;
    if (hoverCard?.fromKeyboard && anchor?.isConnected && anchor === document.activeElement && !readerIsScrolling(e.currentTarget)) {
      showHoverCard(hoverCard.word, anchor, true);
    } else {
      hideHoverCard();
    }
  }
  function scheduleHoverCard(word: ParsedWord, el: HTMLElement) {
    cancelHoverCard();
    hoverTimer.current = window.setTimeout(() => {
      hoverTimer.current = null;
      if (el.isConnected) showHoverCard(word, el);
    }, HOVER_CARD_DELAY_MS);
  }
  useEffect(() => cancelHoverCard, []);

  // Another chapter or book: the cards were about words no longer shown.
  // Left open, a Greek word's card stayed over the Genesis the reader had
  // gone on to.
  useEffect(() => {
    popupOpener.current = null;
    setPopup(null);
    hideHoverCard();
  }, [book.id, chapter]);

  // Go to the verse, as the other study panes linked to a Bible pane do. A
  // click in verse 31 of the linked Genesis 1 set this pane at verse 31, and
  // it only ever showed the top of the chapter. Once for each place, when
  // the chapter has drawn: the chapter's data coming again, or the grammar
  // lines shown, does not take the reader back from where they have
  // scrolled to since.
  const scrolledTo = useRef<string | null>(null);
  const hasVerses = verseNumbers.length > 0;
  useEffect(() => {
    const place = verse ? `${book.id}:${chapter}:${verse}` : null;
    if (!place) {
      scrolledTo.current = null;
      return;
    }
    if (place === scrolledTo.current || !hasVerses) return;
    const scroller = scrollerRef.current;
    const row = scroller?.querySelector<HTMLElement>(`[data-verse-row="${verse}"]`);
    if (!scroller || !row) return;
    scrolledTo.current = place;
    const top = row.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
    scroller.scrollTo({ top: Math.max(0, top - 16) });
  }, [book.id, chapter, verse, hasVerses]);

  /**
   * A Greek or Hebrew word, as a button: the word, its parsing under it (or
   * its code, where it has no parsing), the parsing card when the pointer
   * rests on it or the keyboard reaches it, and the Strong's card, with its
   * parsing, when it is pressed. `muted` sets a word the English leaves
   * untranslated in a lighter ink; `echo` is a word shown in full under
   * another phrase, which stands here as the word alone.
   */
  function originalWord(w: MorphologyWord, { muted = false, echo = false }: { muted?: boolean; echo?: boolean } = {}) {
    const parsed = parsedWordOrNull(w);
    // Only a word with a Strong's number can be clicked, and a disabled
    // button hears no pointer, so only such a word has the hover card; the
    // few without one keep their label.
    const withCard = parsed && w.strongs_id ? parsed : null;
    return (
      <button
        key={w.id}
        type="button"
        disabled={!w.strongs_id}
        onClick={(e) => showStrongsPopup(w.strongs_id, e, w)}
        onMouseEnter={withCard ? (e) => scheduleHoverCard(withCard, e.currentTarget) : undefined}
        onMouseLeave={withCard ? hideHoverCard : undefined}
        onFocus={withCard ? (e) => focusedFromKeyboard(e.currentTarget) && showHoverCard(withCard, e.currentTarget, true) : undefined}
        onBlur={withCard ? hideHoverCard : undefined}
        onKeyDown={withCard ? (e) => e.key === "Escape" && hideHoverCard() : undefined}
        aria-describedby={hoverCard?.word.id === w.id ? hoverCardId : undefined}
        className={cx(
          "flex flex-col items-center rounded-md px-1 py-0.5 text-center",
          w.strongs_id ? "hover:bg-amber-50 dark:hover:bg-amber-950/30" : "cursor-default",
        )}
        title={echo ? "The same word, parsed under the phrase beside this one" : parsed ? undefined : (w.lemma ?? undefined)}
      >
        <span className={cx("leading-tight", echo ? "text-base text-ink-4" : muted ? "text-lg text-ink-3" : "text-lg text-ink")} dir="auto">
          {w.original_word}
        </span>
        {!echo &&
          (parsed ? (
            <CompactParsing parsing={parsed.parsing} />
          ) : (
            w.morph_code && <span className="mt-0.5 font-mono text-[10px] text-ink-3">{w.morph_code}</span>
          ))}
      </button>
    );
  }

  /** An English phrase, as a button: the phrase and its Strong's number,
   * for the Strong's card. A word the KJV supplied, in italics, has no
   * number and cannot be pressed. */
  function englishPhrase(vn: number, index: number, w: InterlinearWord) {
    return (
      <button
        key={w.id}
        type="button"
        disabled={!w.strongs_id}
        onClick={(e) => showStrongsPopup(w.strongs_id, e, wordForPhrase(vn, index, w))}
        className={cx(
          "reading-font flex flex-col items-center rounded-md px-1.5 py-1 text-left",
          w.strongs_id ? "hover:bg-accent-soft" : "cursor-default",
        )}
      >
        <span className="text-base leading-tight text-ink">{w.text}</span>
        {w.strongs_id && <span className="mt-0.5 font-mono text-[11px] text-accent">{w.strongs_id}</span>}
      </button>
    );
  }

  const originalDir = book.testament === "OT" ? "rtl" : "ltr";
  const originalName = book.testament === "OT" ? "Hebrew" : "Greek";

  return (
    // The gutter widens with the pane rather than the window: a thin pane
    // beside a wide one keeps its width for the verses and the switch.
    <div
      ref={scrollerRef}
      className="@container min-h-0 flex-1 overflow-y-auto px-4 py-6"
      onClick={closeCardOnClickOutside}
      onScroll={followOrHideHoverCard}
    >
      <div className="@container mx-auto w-full max-w-4xl @md:px-4">
        {/* The explanation asks for a line of its own before it will share
            one: with no width of its own it shrank to one or two words a
            line beside the layout switch rather than letting the switch and
            Exit wrap under it. */}
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-ink-2">
          <Languages className="h-4 w-4 shrink-0 text-ink-3" aria-hidden="true" />
          <span className="min-w-0 flex-[1_1_18rem]">
            {layout === "aligned"
              ? `Interlinear: each KJV phrase with its Strong's number and, under it, the ${originalName} it translates. Click any word for its lexicon entry; rest on a ${originalName} word for its parsing.`
              : layout === "original"
                ? `Interlinear: KJV phrases tagged with Strong's numbers, and the ${originalName} in its own order. Click any word for its lexicon entry; rest on a ${originalName} word for its parsing.`
                : `Interlinear: KJV phrases tagged with Strong's numbers. Click any word for the original ${originalName}.`}
          </span>
          <LayoutSwitch value={layout} originalName={originalName} onChange={chooseLayout} />
          <Button size="sm" variant="secondary" icon={X} onClick={onExit}>
            Exit interlinear
          </Button>
        </div>
        <h1 className="reading-font mb-4 text-2xl font-semibold text-ink">
          {book.name} {chapter}
        </h1>
        {isLoading && <LoadingState />}
        {!isLoading && verseNumbers.length === 0 && <EmptyState title="No interlinear data for this chapter" />}
        {verseNumbers.map((vn) => {
          const aligned = layout === "aligned" && morphology?.[vn] ? alignment.get(vn) : undefined;
          return (
            <div key={vn} data-verse-row={vn} className="mb-5">
              {aligned ? (
                // Each phrase and the words under it make one card, and the
                // cards wrap as the pane narrows. They hang from a common top
                // line, so a card whose parsing runs to three lines leaves its
                // neighbours where they were.
                <div className="flex flex-wrap items-start gap-x-2 gap-y-3">
                  <span className="mt-1.5 font-sans text-xs font-semibold text-ink-4">{vn}</span>
                  {aligned.phrases.map(({ phrase, words }, i) => (
                    <div key={phrase.id} data-phrase-card="" className="flex flex-col items-center">
                      {englishPhrase(vn, i, phrase)}
                      {words.length > 0 && (
                        <div dir={originalDir} className="flex flex-wrap items-start justify-center gap-x-1 border-t border-line pt-0.5">
                          {words.map(({ word, echo }) => originalWord(word, { echo }))}
                        </div>
                      )}
                    </div>
                  ))}
                  {aligned.untranslated.length > 0 && (
                    // What the English does not translate, set apart: the
                    // article, the object marker, a conjunction the KJV let
                    // go. Still words of the verse, so still to be looked up
                    // and parsed.
                    //
                    // "Not matched" rather than "Not translated": the words
                    // are matched to the English only by Strong's number and
                    // the little words beside them (`alignVerse`), and a
                    // word the KJV does render, folded into a phrase numbered
                    // for another, can still land here.
                    <div
                      data-untranslated=""
                      title="Words not matched to an English phrase: mostly ones the KJV leaves untranslated, such as an article or the object marker, and now and then one it folds into a phrase numbered for another word"
                      className="flex flex-col items-center rounded-md border border-dashed border-line-2 px-1 pt-1"
                    >
                      <span className="px-1 font-sans text-[11px] text-ink-4">Not matched</span>
                      <div dir={originalDir} className="flex flex-wrap items-start justify-center gap-x-1">
                        {aligned.untranslated.map((w) => originalWord(w, { muted: true }))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
                  <span className="mb-1 self-start font-sans text-xs font-semibold text-ink-4">{vn}</span>
                  {data![vn].map((w, i) => englishPhrase(vn, i, w))}
                </div>
              )}
              {layout === "original" && morphology?.[vn] && (
                // The original words hang from a common top line, so a word
                // whose parsing runs to two or three lines leaves its
                // neighbours' words where they were rather than lowering them.
                <div dir={originalDir} className="mt-1 flex flex-wrap items-start gap-x-3 gap-y-2 border-l-2 border-line-2 pl-3">
                  {morphology[vn].map((w) => originalWord(w))}
                </div>
              )}
            </div>
          );
        })}

        <div ref={cardRef} className="contents">
          {popup && (
            <StrongsPopup
              id={popup.id}
              x={popup.x}
              y={popup.y}
              anchorTop={popup.anchorTop}
              parsedWord={popup.word}
              onClose={closePopup}
            />
          )}
        </div>
        {hoverCard && (
          <ParsingHoverCard id={hoverCardId} word={hoverCard.word} x={hoverCard.x} y={hoverCard.y} flipY={hoverCard.flipY} />
        )}
      </div>
    </div>
  );
}

type LayoutChoice = InterlinearLayout | "english";

/**
 * How the verse is laid out, as three buttons side by side: the original
 * under each English phrase, the original on a line of its own in its own
 * order, or the English alone. A radio group, one of the three always
 * chosen. In a thin pane the labels shorten ("Under English", "Greek
 * order", "English") and the switch takes its row's width, so the three
 * still sit on one row and read as one control; the buttons wrap under one
 * another only in a pane thinner still, rather than running out of it.
 */
function LayoutSwitch({
  value,
  originalName,
  onChange,
}: {
  value: LayoutChoice;
  originalName: string;
  onChange: (choice: LayoutChoice) => void;
}) {
  const choices: { key: LayoutChoice; label: string; short: string }[] = [
    { key: "aligned", label: "Under each English word", short: "Under English" },
    { key: "original", label: `In ${originalName} order`, short: `${originalName} order` },
    { key: "english", label: "English only", short: "English" },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="Original words"
      className="flex flex-wrap rounded-md border border-line-2 bg-surface p-0.5 @max-[26rem]:w-full @max-[26rem]:flex-nowrap @max-[15.75rem]:flex-wrap"
    >
      {choices.map((c) => (
        <button
          key={c.key}
          type="button"
          role="radio"
          aria-checked={value === c.key}
          aria-label={c.label}
          title={c.label}
          onClick={() => onChange(c.key)}
          className={cx(
            "whitespace-nowrap rounded px-2 py-0.5 text-sm @max-[26rem]:flex-1 @max-[26rem]:px-1 @max-[26rem]:text-[12px]",
            value === c.key ? "bg-accent-soft font-medium text-accent" : "text-ink-3 hover:bg-hover hover:text-ink",
          )}
        >
          <span className="@max-[26rem]:hidden">{c.label}</span>
          <span aria-hidden="true" className="hidden @max-[26rem]:inline">
            {c.short}
          </span>
        </button>
      ))}
    </div>
  );
}

/** Whether a modal dialog is open that the Strong's card is not inside: the
 * dialog is then the layer the reader is in, and a key is its own. The same
 * test the other popups' Escape makes (`useViewportClampedPosition`). */
function modalAboveCard(card: Element | null): boolean {
  const modal = document.querySelector('[aria-modal="true"]');
  return !!modal && !(card && modal.contains(card));
}

/** Whether the word was reached with the keyboard rather than pressed: a
 * press focuses the button too, a moment before its click opens the Strong's
 * card, and would flash the parsing card in between. */
function focusedFromKeyboard(el: HTMLElement): boolean {
  try {
    return el.matches(":focus-visible");
  } catch {
    return true;
  }
}

/**
 * The parsing under an interlinear word, short: "Verb · aorist active
 * imperative · 2nd sg", "and + Noun · fem sg abs". English, so it runs left
 * to right under a Hebrew word too. Each piece is kept whole where the line
 * breaks, so a long label wraps between "aorist active imperative" and
 * "2nd sg" rather than inside either, and the mark joining two pieces ends
 * the first one's line instead of opening the next; the part of speech
 * leads in a stronger ink, as the word's name.
 *
 * The label, not the word's button, is what is held to a width, so that it
 * wraps rather than spreading its word's neighbours apart. Held on the
 * button, the cap held the word too, and a Greek word can be longer than a
 * label -- Acts 10:41's προκεχειροτονημένοις is some 185 pixels at this size
 * -- and cannot wrap: it ran out of its button both sides, over the gap and
 * into the next word. The button is as wide as the wider of the two.
 */
function CompactParsing({ parsing }: { parsing: MorphParsing }) {
  const pieces = compactParsingPieces(parsing);
  if (pieces.length === 0) return null;
  return (
    <span dir="ltr" className="mt-0.5 max-w-[10rem] font-sans text-[11px] leading-snug text-ink-3">
      {pieces.map((p, i) => {
        const joiner = pieces[i + 1]?.joiner;
        return (
          <Fragment key={i}>
            {i > 0 && " "}
            <span className={cx("inline-block", p.part === "head" && "text-ink-2")}>
              {p.text}
              {joiner && <span className="text-ink-4">{`\u00a0${joiner}`}</span>}
            </span>
          </Fragment>
        );
      })}
    </span>
  );
}
