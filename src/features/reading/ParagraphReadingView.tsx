import { StickyNote } from "lucide-react";
import type { Highlight, Note, Verse, Footnote } from "../../api/types";
import { buildTokens } from "./verseTokens";
import type { RedLetterSpan } from "./redLetterSpans";
import type { FindRange } from "./findMatches";
import { SegmentText } from "./VerseRow";
import { cx } from "../../components/ui/classes";

/** Paragraph mode's per-verse renderer: the same highlight/footnote token
 * splitting VerseRow uses, but flowed inline (a small superscript verse
 * number, then text) instead of laid out as its own block row -- so a
 * chapter reads as continuous prose instead of a numbered list. Selection,
 * highlighting, and note/footnote clicks all key off the same
 * `data-verse-text` attribute VerseRow uses, so ReadingView's existing
 * mouseup-to-highlight handling works unchanged here. */
function ParagraphVerse({
  verse,
  highlights,
  notes,
  footnotes,
  isActive,
  showVerseNumbers,
  showNoteSymbols,
  onSelectVerse,
  onHighlightClick,
  onNoteSymbolClick,
  onFootnoteClick,
  onContextMenu,
  redLetterSpans,
  findRanges,
}: {
  verse: Verse;
  highlights: Highlight[];
  notes: Note[];
  footnotes?: Footnote[];
  isActive: boolean;
  showVerseNumbers: boolean;
  showNoteSymbols: boolean;
  onSelectVerse: (verseNum: number) => void;
  onHighlightClick: (highlightId: number, x: number, y: number) => void;
  onNoteSymbolClick: (note: Note) => void;
  onFootnoteClick?: (footnote: Footnote, x: number, y: number) => void;
  onContextMenu?: (verseNum: number, x: number, y: number) => void;
  redLetterSpans?: RedLetterSpan[];
  findRanges?: FindRange[];
}) {
  const tokens = buildTokens(verse.text, highlights, verse.verse, footnotes ?? [], redLetterSpans, findRanges);
  const notesByHighlight = new Map(notes.filter((n) => n.highlight_id != null).map((n) => [n.highlight_id as number, n]));
  const verseLevelNote = notes.find(
    (n) => n.highlight_id == null && verse.verse >= n.verse_start && verse.verse <= n.verse_end,
  );

  return (
    <span
      data-verse-row={verse.verse}
      onClick={() => onSelectVerse(verse.verse)}
      onContextMenu={(e) => {
        if (!onContextMenu) return;
        e.preventDefault();
        onContextMenu(verse.verse, e.clientX, e.clientY);
      }}
      className={cx("rounded transition-colors", isActive ? "bg-accent-soft" : "hover:bg-hover/60")}
    >
      {showVerseNumbers && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelectVerse(verse.verse);
            if (onContextMenu) {
              const rect = e.currentTarget.getBoundingClientRect();
              onContextMenu(verse.verse, rect.left, rect.bottom + 2);
            }
          }}
          title={`Verse ${verse.verse}: highlight, note, copy, compare…`}
          aria-label={`Verse ${verse.verse} actions`}
          className={cx("mr-0.5 select-none align-super font-sans text-[0.6em] font-semibold leading-none", isActive ? "text-accent" : "text-ink-4")}
        >
          {verse.verse}
        </button>
      )}
      {showNoteSymbols && verseLevelNote && (
        <button
          type="button"
          className="mr-0.5 inline-flex align-middle text-amber-600 dark:text-amber-400"
          title="Open note"
          aria-label="Open note"
          onClick={(e) => {
            e.stopPropagation();
            onNoteSymbolClick(verseLevelNote);
          }}
        >
          <StickyNote className="h-[0.8em] w-[0.8em]" aria-hidden="true" />
        </button>
      )}
      <span data-verse-text={verse.verse}>
        {tokens.map((tok, i) => {
          if (tok.kind === "footnote") {
            const f = tok.footnote;
            return (
              <sup
                key={`fn-${f.id}`}
                className="ml-0.5 cursor-pointer select-none text-accent hover:underline"
                title="Footnote"
                onClick={(e) => {
                  e.stopPropagation();
                  const rect = (e.target as HTMLElement).getBoundingClientRect();
                  onFootnoteClick?.(f, rect.left, rect.bottom + 4);
                }}
              >
                [{f.marker}]
              </sup>
            );
          }
          const seg = tok.segment;
          if (!seg.color) {
            return (
              <span key={i} className={seg.isRedLetter ? "text-red-700 dark:text-red-400" : undefined}>
                <SegmentText segment={seg} />
              </span>
            );
          }
          const linkedNote = seg.highlightId != null ? notesByHighlight.get(seg.highlightId) : undefined;
          return (
            <mark
              key={i}
              className={seg.style === "underline" ? "underline-only" : "highlight"}
              style={{ ["--hl-color" as string]: seg.color }}
              onClick={(e) => {
                if (seg.highlightId != null) {
                  e.stopPropagation();
                  const rect = (e.target as HTMLElement).getBoundingClientRect();
                  onHighlightClick(seg.highlightId, rect.left + rect.width / 2, rect.top);
                }
              }}
            >
              <SegmentText segment={seg} />
              {showNoteSymbols && linkedNote && (
                <button
                  type="button"
                  className="ml-0.5 inline-flex align-middle text-amber-700"
                  title="Open note"
                  aria-label="Open note"
                  onClick={(e) => {
                    e.stopPropagation();
                    onNoteSymbolClick(linkedNote);
                  }}
                >
                  <StickyNote className="h-[0.8em] w-[0.8em]" aria-hidden="true" />
                </button>
              )}
            </mark>
          );
        })}
      </span>{" "}
    </span>
  );
}

export function ParagraphVerses({
  verses,
  highlights,
  notes,
  footnotesByVerse,
  activeVerse,
  showVerseNumbers,
  showHighlights,
  showNoteSymbols,
  redLetterSpansByVerse,
  findRangesByVerse,
  onSelectVerse,
  onHighlightClick,
  onNoteSymbolClick,
  onFootnoteClick,
  onContextMenu,
}: {
  verses: Verse[];
  highlights: Highlight[];
  notes: Note[];
  footnotesByVerse?: Record<number, Footnote[]>;
  activeVerse: number | null;
  showVerseNumbers: boolean;
  showHighlights: boolean;
  showNoteSymbols: boolean;
  redLetterSpansByVerse?: Map<number, RedLetterSpan[]> | null;
  findRangesByVerse?: Map<number, FindRange[]> | null;
  onSelectVerse: (verseNum: number) => void;
  onHighlightClick: (highlightId: number, x: number, y: number) => void;
  onNoteSymbolClick: (note: Note) => void;
  onFootnoteClick?: (footnote: Footnote, x: number, y: number) => void;
  onContextMenu?: (verseNum: number, x: number, y: number) => void;
}) {
  return (
    <p className="reading-font cursor-text">
      {verses.map((v) => (
        <ParagraphVerse
          key={v.id}
          verse={v}
          highlights={showHighlights ? highlights : []}
          notes={notes}
          footnotes={footnotesByVerse?.[v.verse]}
          isActive={activeVerse === v.verse}
          showVerseNumbers={showVerseNumbers}
          showNoteSymbols={showNoteSymbols}
          redLetterSpans={redLetterSpansByVerse?.get(v.verse)}
          findRanges={findRangesByVerse?.get(v.verse)}
          onSelectVerse={onSelectVerse}
          onHighlightClick={onHighlightClick}
          onNoteSymbolClick={onNoteSymbolClick}
          onFootnoteClick={onFootnoteClick}
          onContextMenu={onContextMenu}
        />
      ))}
    </p>
  );
}
