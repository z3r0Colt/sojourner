import { useCallback, useEffect, useId, useMemo, useRef, useState, type ButtonHTMLAttributes, type MouseEvent as ReactMouseEvent } from "react";
import { Check, Languages, X } from "lucide-react";
import { useChapter, useInterlinearForChapter, useMorphologyForChapter, useTranslations } from "../../api/queries";
import { useUiStore, type InterlinearLayout } from "../../state/uiStore";
import { StrongsPopup } from "../lexicon/StrongsPopup";
import { ParsingHoverCard } from "../lexicon/ParsingHoverCard";
import { parsedWordOrNull, type ParsedWord } from "../lexicon/ParsingSection";
import type { Book, InterlinearWord, MorphologyWord } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { EmptyState, LoadingState } from "../../components/ui/EmptyState";
import { cx } from "../../components/ui/classes";
import { readerIsScrolling } from "../../lib/useViewportClampedPosition";
import { taggedWordForStrongs } from "./wordLookup";
import { alignVerse, phraseWord, type VerseAlignment } from "./interlinearAlign";
import { englishOrderRows, originalOrderRows, rowNumber, type InterlinearRow } from "./interlinearRows";
import { InterlinearTable } from "./InterlinearTable";

/** How long the pointer rests on a row before its parsing card shows, so
 * that running the pointer down the table does not flash a card for every
 * row it crosses. Reaching a row with the keyboard shows it at once. */
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
  const { showMorphology, toggleShowMorphology, interlinearLayout, setInterlinearLayout, showCantillation, toggleShowCantillation } =
    useUiStore();
  /** Which of the three ways the pane shows the verse: the table in the
   * English's order, the table in the original's order, or the English
   * alone. "English only" is the Settings switch for the original words,
   * which the pane's old checkbox was too. */
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
  const [hoverCard, setHoverCard] = useState<{
    word: ParsedWord;
    /** The row it is for: a word can have two, where the KJV gives it two phrases. */
    rowKey: string;
    /** Which of the row's words it is over. */
    wordId: number;
    x: number;
    y: number;
    flipY: number;
    fromKeyboard: boolean;
  } | null>(null);
  /** The row the parsing card is over, to find it again when the chapter moves. */
  const hoverAnchor = useRef<HTMLElement | null>(null);
  /** The row and word the pointer last called a parsing card up for, shown
   * or waiting: the pointer moving about inside one word does not start it
   * over. */
  const hoverFor = useRef<string | null>(null);
  /** The word of a row the keyboard has moved to with the arrow keys, which
   * Enter opens rather than the head. */
  const keyboardWord = useRef<{ rowKey: string; wordId: number } | null>(null);
  /** The same, for the table to mark the word in its row: the parsing card
   * showed which word the arrows were on, but a word with no parsing has no
   * card, and Enter opened a word nothing showed. */
  const [keyboardMark, setKeyboardMark] = useState<{ rowKey: string; wordId: number } | null>(null);
  const hoverTimer = useRef<number | null>(null);
  const hoverCardId = useId();

  const verseNumbers = Object.keys(data ?? {})
    .map(Number)
    .sort((a, b) => a - b);

  // The verse in the KJV, for the line over its rows. The phrases are the
  // KJV too, but without its punctuation, and a psalm's title comes after
  // its first verse in them ("The LORD is my shepherd ... of David A
  // Psalm"); the chapter itself is one query, and usually cached from the
  // Bible pane beside this one.
  const { data: translations } = useTranslations();
  const kjvId = translations?.find((t) => t.code === "KJV")?.id ?? null;
  const { data: kjvChapter } = useChapter(kjvId, book.id, chapter);
  const kjvText = useMemo(() => new Map((kjvChapter ?? []).map((v) => [v.verse, v.text])), [kjvChapter]);

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
    // Under the word or number pressed; the focus goes back to its row, the
    // button, a word inside it having none of its own.
    const anchor = e.currentTarget as HTMLElement;
    popupOpener.current = anchor.closest<HTMLElement>("button") ?? anchor;
    const rect = anchor.getBoundingClientRect();
    // A click with no pointer behind it (`detail` 0) is Enter or Space on
    // the word.
    setPopup({ id, x: rect.left, y: rect.bottom + 4, anchorTop: rect.top, word, fromKeyboard: e.detail === 0 });
  }

  /** Closes the Strong's card. A focus that was in it goes back to the word
   * it was opened from, rather than to the top of the window when the
   * button it was on goes. So does a focus the card had lost to the page: a
   * click on the card's text (not a button) leaves the focus on nothing, and
   * Escape then left the keyboard at the top of the window, not at the row. */
  const closePopup = useCallback(() => {
    const active = document.activeElement;
    const focusWasInCard = !!cardRef.current?.contains(active) || !active || active === document.body;
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
    hoverFor.current = null;
    setHoverCard(null);
  }
  /** Shows the parsing card for one of a row's words, over that word
   * (`[data-original]`) rather than the middle of a row the width of the
   * pane. */
  function showHoverCard(word: ParsedWord, rowKey: string, wordId: number, el: HTMLElement, fromKeyboard = false) {
    cancelHoverCard();
    hoverAnchor.current = el;
    const over = el.querySelector<HTMLElement>(`[data-original][data-word-id="${wordId}"]`) ?? el.querySelector<HTMLElement>("[data-original]") ?? el;
    const rect = over.getBoundingClientRect();
    setHoverCard({ word, rowKey, wordId, x: rect.left + rect.width / 2, y: rect.top, flipY: rect.bottom, fromKeyboard });
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
      showHoverCard(hoverCard.word, hoverCard.rowKey, hoverCard.wordId, anchor, true);
    } else {
      hideHoverCard();
    }
  }
  function scheduleHoverCard(word: ParsedWord, rowKey: string, wordId: number, el: HTMLElement) {
    cancelHoverCard();
    hoverTimer.current = window.setTimeout(() => {
      hoverTimer.current = null;
      if (el.isConnected) showHoverCard(word, rowKey, wordId, el);
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
    // Clear of the table's heading, which stays at the top as it scrolls.
    const head = scroller.querySelector<HTMLElement>("[data-table-head]")?.offsetHeight ?? 0;
    scroller.scrollTo({ top: Math.max(0, top - 8 - head) });
  }, [book.id, chapter, verse, hasVerses]);

  /**
   * What a row of the table does, as a button: a press opens the Strong's
   * card on the row's number, with its head word's parsing (or, for a
   * phrase with no word, the word the phrase's number stands on); the
   * pointer resting on one of its words shows the parsing card over that
   * word, and anywhere else on the row over the head. The keyboard reaching
   * the row shows the head's card, and the arrow keys move it along the
   * row's words -- the way the eye reads them, right to left in the Hebrew
   * -- Enter then opening the Strong's card of the word the card is over. A
   * word with no parsing has no parsing card.
   */
  function rowProps(row: InterlinearRow, vn: number): ButtonHTMLAttributes<HTMLButtonElement> {
    const headWord = row.word ?? (row.phrase && row.phraseIndex != null ? wordForPhrase(vn, row.phraseIndex, row.phrase) : null);
    const key = `${vn}:${row.key}`;
    const hoverOver = (word: MorphologyWord | null, el: HTMLElement) => {
      const at = word ? `${key}:${word.id}` : key;
      if (hoverFor.current === at) return;
      hoverFor.current = at;
      const parsed = word ? parsedWordOrNull(word) : null;
      if (parsed && word) scheduleHoverCard(parsed, key, word.id, el);
      else {
        cancelHoverCard();
        if (hoverCard?.rowKey === key) setHoverCard(null);
      }
    };
    const wordUnder = (target: EventTarget) => {
      const id = target instanceof Element ? target.closest("[data-word-id]")?.getAttribute("data-word-id") : null;
      return row.words.find((w) => String(w.word.id) === id)?.word ?? row.word;
    };
    const showFromKeyboard = (word: MorphologyWord | null, el: HTMLElement) => {
      const parsed = word ? parsedWordOrNull(word) : null;
      keyboardWord.current = word ? { rowKey: key, wordId: word.id } : null;
      setKeyboardMark(keyboardWord.current);
      if (parsed && word) showHoverCard(parsed, key, word.id, el, true);
      else hideHoverCard();
    };
    const hebrew = (row.word?.strongs_id ?? "").startsWith("H");
    return {
      onClick: (e) => {
        const chosen = e.detail === 0 && keyboardWord.current?.rowKey === key ? row.words.find((w) => w.word.id === keyboardWord.current!.wordId)?.word : null;
        if (chosen && chosen !== row.word) showStrongsPopup(rowNumber(chosen), e, chosen);
        else showStrongsPopup(row.strongs, e, headWord);
      },
      onMouseOver: (e) => hoverOver(wordUnder(e.target), e.currentTarget),
      onMouseLeave: hideHoverCard,
      onFocus: (e) => focusedFromKeyboard(e.currentTarget) && showFromKeyboard(row.word, e.currentTarget),
      onBlur: () => {
        keyboardWord.current = null;
        setKeyboardMark(null);
        hideHoverCard();
      },
      onKeyDown: (e) => {
        if (e.key === "Escape") return hideHoverCard();
        if ((e.key !== "ArrowRight" && e.key !== "ArrowLeft") || row.words.length < 2) return;
        e.preventDefault();
        const at = row.words.findIndex((w) => w.word.id === (keyboardWord.current?.rowKey === key ? keyboardWord.current.wordId : row.word?.id));
        const step = (e.key === "ArrowRight" ? 1 : -1) * (hebrew ? -1 : 1);
        const next = row.words[Math.min(row.words.length - 1, Math.max(0, at + step))];
        showFromKeyboard(next.word, e.currentTarget);
      },
      "aria-describedby": hoverCard?.rowKey === key ? hoverCardId : undefined,
    };
  }

  /** A press on one of a row's other words, or on its number: that word's
   * Strong's card, with its parsing, not the head's. */
  function wordClick(e: ReactMouseEvent<HTMLElement>, word: MorphologyWord) {
    showStrongsPopup(rowNumber(word), e, word);
  }

  /** Each verse's rows, in the order the layout reads them. Until the
   * chapter's Greek or Hebrew has come, the English's order, with the
   * phrases and their numbers alone. Kept from one drawing to the next, as
   * the table works out its columns' widths from them: the parsing card
   * coming and going draws the pane again, and the chapter is the same. */
  const tableVerses = useMemo(
    () =>
      Object.keys(data ?? {})
        .map(Number)
        .sort((a, b) => a - b)
        .map((vn) => {
          const aligned = alignment.get(vn);
          const words = morphology?.[vn] ?? [];
          const rows: InterlinearRow[] = !aligned
            ? []
            : layout === "original" && words.length > 0
              ? originalOrderRows(aligned, words)
              : englishOrderRows(aligned, words);
          return { verse: vn, text: kjvText.get(vn) ?? data![vn].map((p) => p.text).join(" "), rows };
        }),
    [data, alignment, morphology, layout, kjvText],
  );

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

  const originalName = book.testament === "OT" ? "Hebrew" : "Greek";

  return (
    // One gutter, the scroller's, and none inside it: the table has four
    // columns to find room for, and the second gutter a wide pane added
    // took 32px of it at the width a pane has beside the Bible.
    <div
      ref={scrollerRef}
      className="@container min-h-0 flex-1 overflow-y-auto px-4 pb-6"
      onClick={closeCardOnClickOutside}
      onScroll={followOrHideHoverCard}
    >
      <div className="@container mx-auto w-full max-w-4xl">
        {/* The explanation asks for a line of its own before it will share
            one: with no width of its own it shrank to one or two words a
            line beside the layout switch rather than letting the switch and
            Exit wrap under it. */}
        <div className="mt-6 mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-ink-2">
          <Languages className="h-4 w-4 shrink-0 text-ink-3" aria-hidden="true" />
          <span className="min-w-0 flex-[1_1_18rem]">
            {layout === "table"
              ? `Interlinear: a row for each KJV phrase, with the ${originalName} words it translates, the Strong's number, root and parsing of its chief word, and the little words with it muted. Click a row or a word for its lexicon entry; rest on a word for its full parsing.`
              : layout === "original"
                ? `Interlinear: the ${originalName} words in their own order, each with the KJV phrase that translates it. Click a row for its lexicon entry; rest on it for the full parsing.`
                : `Interlinear: KJV phrases tagged with Strong's numbers. Click any word for the original ${originalName}.`}
          </span>
          <LayoutSwitch value={layout} originalName={originalName} onChange={chooseLayout} />
          {originalName === "Hebrew" && layout !== "english" && (
            <CantillationSwitch on={showCantillation} onToggle={toggleShowCantillation} />
          )}
          <Button size="sm" variant="secondary" icon={X} onClick={onExit}>
            Exit interlinear
          </Button>
        </div>
        <h1 className="reading-font mb-4 text-2xl font-semibold text-ink">
          {book.name} {chapter}
        </h1>
        {isLoading && <LoadingState />}
        {!isLoading && verseNumbers.length === 0 && <EmptyState title="No Hebrew or Greek for this chapter" description="Pick another chapter, or exit the interlinear to read it in English." />}
        {layout === "english"
          ? verseNumbers.map((vn) => (
              <div key={vn} data-verse-row={vn} className="mb-5 flex flex-wrap items-end gap-x-3 gap-y-2">
                <span className="mb-1 self-start font-sans text-xs font-semibold text-ink-4">{vn}</span>
                {data![vn].map((w, i) => englishPhrase(vn, i, w))}
              </div>
            ))
          : verseNumbers.length > 0 && (
              <InterlinearTable
                verses={tableVerses}
                originalName={originalName}
                rowProps={rowProps}
                onWordClick={wordClick}
                keyboardWord={keyboardMark ? keyboardRowWord(keyboardMark.rowKey, keyboardMark.wordId) : null}
              />
            )}

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
 * How the verse is laid out, as three buttons side by side: the table in
 * the English's order, the table in the original's order, or the English
 * alone. A radio group, one of the three always chosen. In a thin pane the
 * labels shorten ("Table", "Greek order", "English") and the switch takes
 * its row's width, so the three still sit on one row and read as one
 * control; the buttons wrap under one another only in a pane thinner still,
 * rather than running out of it.
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
    { key: "table", label: "Table", short: "Table" },
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

/**
 * Whether the Hebrew shows its cantillation marks, as the Blue Letter
 * Bible's "Show Cantillation Marks" does: the accents that chant the verse
 * and mark its pauses, which crowd the vowel points for a reader learning
 * to read them. The points always stay. On by default, the text as it is;
 * the choice holds wherever the app shows a Hebrew word from the text.
 */
function CantillationSwitch({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      title="Show the Hebrew cantillation marks (the accents). The vowel points always show."
      onClick={onToggle}
      className="flex items-center gap-1.5 whitespace-nowrap rounded-md border border-line-2 bg-surface px-2 py-0.5 text-sm text-ink-2 hover:bg-hover hover:text-ink @max-[26rem]:text-[12px]"
    >
      <span
        aria-hidden="true"
        className={cx(
          "flex h-3.5 w-3.5 items-center justify-center rounded-sm border",
          on ? "border-accent bg-accent text-on-accent" : "border-line-2 bg-surface",
        )}
      >
        {on && <Check className="h-3 w-3" strokeWidth={3} />}
      </span>
      Cantillation
    </button>
  );
}

/** The word the keyboard is on, by its verse and its row's own key, from the
 * "verse:row" key `rowProps` keeps it by. */
function keyboardRowWord(rowKey: string, wordId: number): { verse: number; rowKey: string; wordId: number } {
  const at = rowKey.indexOf(":");
  return { verse: Number(rowKey.slice(0, at)), rowKey: rowKey.slice(at + 1), wordId };
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
