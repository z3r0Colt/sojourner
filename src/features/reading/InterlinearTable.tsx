import { Fragment, useMemo, type ButtonHTMLAttributes, type CSSProperties, type MouseEvent } from "react";
import type { MorphologyWord, MorphParsing } from "../../api/types";
import { cx } from "../../components/ui/classes";
import { displayForm, langFor, shortParsingPieces } from "../lexicon/parsingDisplay";
import { useHebrewDisplay } from "../lexicon/originalText";
import {
  otherNumbers,
  rowNumber,
  rowRoot,
  tableColumnWidths,
  tableGridTemplate,
  type InterlinearRow,
  type RowWord,
} from "./interlinearRows";

export interface InterlinearTableVerse {
  verse: number;
  /** The verse in the KJV, for the line over its rows. */
  text: string;
  rows: InterlinearRow[];
}

/**
 * The interlinear as the Blue Letter Bible sets it out, a row to each
 * English phrase: the English, the Strong's number, the Greek or Hebrew
 * words as the text has them with the head word's root and the root's
 * transliteration after them, and the head word's parsing, each on one
 * line. The head is the word the phrase's number stands on; the little words
 * with it -- the article of "the Word", the object marker before "the heaven"
 * -- are in the row in their places, muted, their numbers after the head's,
 * smaller. (In the original's order a row is a word.) Each verse has a line of its own over its rows,
 * with the verse in the KJV, so that the sense of it is not lost in the rows.
 *
 * The whole chapter is one grid, each row a subgrid of it, so the columns
 * line up from verse to verse under the one heading. The number takes what
 * it needs; the English, the original and the parsing share the rest in
 * proportion to what the chapter's rows want of each (`tableColumnWidths`),
 * and a row longer than that takes a second line rather than hiding any of
 * itself: a transliteration cut to "rê's..." or a parsing that lost its
 * person and number was a word the reader could no longer read. In a thin pane each row folds to two lines -- the English
 * and its number, then the word, its root and its parsing -- rather than
 * squeezing four columns into it. The fold is at 33rem of table, which a
 * pane beside the Bible at the default split clears.
 *
 * The table runs left to right in the English's order however the original
 * runs; a row's Hebrew words run right to left within their cell, and the
 * root after them right to left within itself.
 *
 * The rows the reader can do something with -- those with a Strong's number
 * -- are buttons, `rowProps` giving them their handlers: a press opens the
 * head word's Strong's card, and the pointer resting on a word, or the
 * keyboard reaching the row, shows the parsing card over that word
 * (`[data-original]`, by its `data-word-id`). A press on one of the row's
 * other words, or on its number, opens that word's card instead
 * (`onWordClick`).
 */
export function InterlinearTable({
  verses,
  originalName,
  rowProps,
  onWordClick,
  keyboardWord,
}: {
  verses: InterlinearTableVerse[];
  /** "Greek" or "Hebrew", for the column's heading. */
  originalName: string;
  rowProps: (row: InterlinearRow, verse: number) => ButtonHTMLAttributes<HTMLButtonElement>;
  /** A press on one of a row's other words, or on its number: that word's
   * card, and not the row's. */
  onWordClick: WordClick;
  /** The word the keyboard is on, moved to along its row with the arrow
   * keys, by its verse, its row's key and its id: marked in the row, which
   * the parsing card over it alone had shown. */
  keyboardWord?: { verse: number; rowKey: string; wordId: number } | null;
}) {
  // The template goes in a variable rather than the style itself, which
  // would outrank the thin pane's single column. The columns stand 6px
  // apart, not 8: at the width a pane has beside the Bible the 6px given
  // back put a third of Genesis 1's two-line rows on one line -- every
  // "said", "and + Verb · qal seq impf · 3rd masc sg", had been a few pixels
  // short of its "sg".
  const columns = useMemo(() => tableGridTemplate(tableColumnWidths(verses.flatMap((v) => v.rows))), [verses]);
  return (
    <div
      data-interlinear-table=""
      style={{ "--interlinear-columns": columns } as CSSProperties}
      className="grid grid-cols-(--interlinear-columns) gap-x-1.5 @max-[33rem]:grid-cols-1"
    >
      <div
        aria-hidden="true"
        data-table-head=""
        className="sticky top-0 z-10 col-span-full grid grid-cols-subgrid border-b border-line-2 bg-bg px-2 pt-1 pb-0.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3 @max-[33rem]:hidden"
      >
        <span>English (KJV)</span>
        <span>Strong's</span>
        <span>{originalName} · root</span>
        <span>Parsing</span>
      </div>
      {verses.map(({ verse, text, rows }) => (
        <Fragment key={verse}>
          <p
            data-verse-row={verse}
            title={text}
            className="col-span-full mt-3 line-clamp-2 px-2 pb-1 text-[13px] leading-snug text-ink-3"
          >
            <span className="mr-1.5 font-sans text-xs font-semibold text-accent">{verse}</span>
            <span className="reading-font">{text}</span>
          </p>
          {rows.map((row) => (
            <TableRow
              key={row.key}
              row={row}
              props={row.strongs ? rowProps(row, verse) : null}
              onWordClick={onWordClick}
              keyboardWordId={keyboardWord?.verse === verse && keyboardWord.rowKey === row.key ? keyboardWord.wordId : null}
            />
          ))}
        </Fragment>
      ))}
    </div>
  );
}

/**
 * One row. A row with a Strong's number is a button, the rest (a word the
 * KJV supplied, a word with no number) a plain row. In the original's order,
 * on a phrase's later rows the English is an arrow up to the phrase, and a
 * screen reader hears the phrase instead.
 */
function TableRow({
  row,
  props,
  onWordClick,
  keyboardWordId,
}: {
  row: InterlinearRow;
  props: ButtonHTMLAttributes<HTMLButtonElement> | null;
  onWordClick: WordClick;
  keyboardWordId: number | null;
}) {
  const { phrase, word } = row;
  const supplied = !!phrase && !phrase.strongs_id && !word;
  const english = !phrase ? (
    <span className="text-ink-4" title="Not matched to an English phrase: a word the KJV leaves untranslated">
      —
    </span>
  ) : row.lead ? (
    <span className={cx(supplied ? "italic text-ink-2" : "text-ink")}>{phrase.text}</span>
  ) : (
    <>
      <span aria-hidden="true" className="pl-1 font-sans text-[13px] text-ink-4" title={`Also translated by “${phrase.text}”`}>
        ↑
      </span>
      <span className="sr-only">{phrase.text}</span>
    </>
  );
  const others = otherNumbers(row);
  const cells = (
    <>
      <span className="reading-font min-w-0 text-[15px] leading-6 @max-[33rem]:col-start-1">{english}</span>
      {/* The head's number, then the other words' after it, smaller and
          muted, each opening its own word's card. Past two they wrap under
          the first rather than widening the column for the whole chapter
          (see `tableGridTemplate`). The head's is underlined while the
          pointer is on the row, as a press there opens its card -- but not
          while it is on a word or number that opens its own
          (`[data-own-card]`), which is underlined instead. */}
      <span className="min-w-0 font-mono text-[12px] leading-6 @max-[33rem]:col-start-2 @max-[33rem]:text-right">
        <span className="whitespace-nowrap text-accent [.group:hover:not(:has([data-own-card]:hover))_&]:underline">{row.strongs}</span>
        {others.map(({ strongs, word: other }) => (
          <Fragment key={strongs}>
            {" "}
            <span
              data-other-number=""
              data-own-card=""
              title={`${strongs}, ${displayForm(other)}`}
              onClick={(e) => onWordClick(e, other)}
              className="whitespace-nowrap text-[10.5px] text-ink-4 hover:text-accent hover:underline"
            >
              {strongs}
            </span>
          </Fragment>
        ))}
      </span>
      {/* The words and the head's parsing: two cells of the row, or in a
          thin pane its second line together, where the parsing keeps its
          whole width (up to most of the line) and the root gives way to it:
          the root and its letters are one click away in the Strong's card,
          and the parsing's person and number would otherwise be the part
          cut. */}
      <span className="contents @max-[33rem]:col-span-2 @max-[33rem]:flex @max-[33rem]:min-w-0 @max-[33rem]:items-baseline @max-[33rem]:gap-2">
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 @max-[33rem]:flex-1">
          {row.words.length > 0 && <OriginalWords row={row} onWordClick={onWordClick} keyboardWordId={keyboardWordId} />}
        </span>
        <span className="min-w-0 text-[12px] leading-6 text-ink-3 @max-[33rem]:ml-auto @max-[33rem]:max-w-[75%] @max-[33rem]:shrink-0">
          {word && <ParsingLabel word={word} />}
        </span>
      </span>
    </>
  );
  const rowClass = cx(
    "col-span-full grid grid-cols-subgrid items-baseline border-b border-line px-2 py-px text-left",
    "@max-[33rem]:grid-cols-[minmax(0,1fr)_auto] @max-[33rem]:gap-x-3 @max-[33rem]:py-0.5",
  );
  if (!props) {
    return (
      <div data-table-row="" className={rowClass}>
        {cells}
      </div>
    );
  }
  return (
    <button
      type="button"
      data-table-row=""
      title={row.echo ? "The KJV translates this word twice" : undefined}
      {...props}
      className={cx(rowClass, "group cursor-pointer hover:bg-hover")}
    >
      {cells}
    </button>
  );
}

type WordClick = (e: MouseEvent<HTMLElement>, word: MorphologyWord) => void;

/** The row's words as the text has them, in its order -- right to left for
 * the Hebrew -- then the head word's root, the headword of its Strong's
 * entry, and the root in letters ("ὁ λόγος  lógos", "ἀρχῇ  ἀρχή archḗ").
 * The root is left out where it is the word as written; the transliteration
 * stays, as the one reading of it a reader without the alphabet has. Both
 * are exactly as their sources have them, but for the Hebrew cantillation
 * where the reader has asked for it to be taken off. The other words' roots
 * are on their parsing cards and in their Strong's cards.
 *
 * The head is in the text's ink, as is a second word the phrase's number
 * stands on (the μή of ἐὰν μή, "except"); the little words with it are
 * muted, as is every word of a row no phrase translates, and a word the
 * phrase only echoes. The word the keyboard has moved to along a row of
 * several is underlined in the accent. */
function OriginalWords({
  row,
  onWordClick,
  keyboardWordId,
}: {
  row: InterlinearRow;
  onWordClick: WordClick;
  keyboardWordId: number | null;
}) {
  const hebrew = useHebrewDisplay();
  const head = row.word ?? row.words[0].word;
  const lang = langOf(head);
  const root = rowRoot(head, hebrew);
  const translit = head.headword_transliteration;
  return (
    <>
      <span dir={lang === "he" ? "rtl" : "ltr"} className="inline-flex min-w-0 flex-wrap items-baseline gap-x-1.5">
        {row.words.map((w) => (
          <OriginalWord
            key={w.word.id}
            w={w}
            muted={!row.phrase || w.folded || w.echo}
            marked={row.words.length > 1 && w.word.id === keyboardWordId}
            display={hebrew}
            onWordClick={onWordClick}
          />
        ))}
      </span>
      {(root || translit) && (
        <span className="min-w-0 text-[13px] leading-6 text-ink-3">
          {root && (
            <span data-root="" lang={lang} dir="auto" className="font-original">
              {hebrew(root)}
            </span>
          )}
          {root && translit && " "}
          {translit && <span className="italic">{translit}</span>}
        </span>
      )}
    </>
  );
}

/** One of the row's words. A word other than the head, with a number of its
 * own, opens its own card when pressed, and not the row's. */
function OriginalWord({
  w,
  muted,
  marked,
  display,
  onWordClick,
}: {
  w: RowWord;
  muted: boolean;
  marked: boolean;
  display: (text: string) => string;
  onWordClick: WordClick;
}) {
  const own = !w.head && rowNumber(w.word) ? (e: MouseEvent<HTMLElement>) => onWordClick(e, w.word) : undefined;
  return (
    <span
      data-original=""
      data-word-id={w.word.id}
      data-head={w.head ? "" : undefined}
      data-own-card={own ? "" : undefined}
      data-keyboard={marked ? "" : undefined}
      lang={langOf(w.word)}
      dir="auto"
      onClick={own}
      className={cx(
        "font-original text-[17px] leading-6",
        muted ? "text-ink-3" : "text-ink",
        own && "hover:underline",
        marked && "underline decoration-accent decoration-2 underline-offset-4",
      )}
    >
      {display(displayForm(w.word))}
    </span>
  );
}

function langOf(word: MorphologyWord): string {
  return langFor(word.parsing) ?? (word.strongs_id?.startsWith("H") ? "he" : "el");
}

/** The parsing in short, on one line, in the grammars' abbreviations: "Noun ·
 * dat fem sg", "Verb · aor act ind · 3rd sg", "prep + Noun · fem sg abs", the
 * part of speech in a stronger ink as the word's name. A word with no
 * parsing shows its code. */
function ParsingLabel({ word }: { word: MorphologyWord }) {
  if (!word.parsing) return word.morph_code ? <span className="font-mono text-[11px]">{word.morph_code}</span> : null;
  return <CompactParsing parsing={word.parsing} />;
}

function CompactParsing({ parsing }: { parsing: MorphParsing }) {
  const pieces = shortParsingPieces(parsing);
  return (
    <>
      {pieces.map((p, i) => (
        <Fragment key={i}>
          {p.joiner && <span className="text-ink-4">{` ${p.joiner} `}</span>}
          <span className={cx(p.part === "head" && "text-ink-2")}>{p.text}</span>
        </Fragment>
      ))}
    </>
  );
}
