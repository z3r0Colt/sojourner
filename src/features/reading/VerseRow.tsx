import { StickyNote } from "lucide-react";
import type { Highlight, Note, Verse, Footnote } from "../../api/types";
import { ReadAloudWords } from "../tts/ReadAloudWords";
import { buildTokens } from "./verseTokens";
import type { RedLetterSpan } from "./redLetterSpans";
import { cx } from "../../components/ui/classes";

export function VerseRow({
  verse,
  highlights,
  notes,
  footnotes,
  isActive,
  showVerseNumbers,
  showHighlights,
  showNoteSymbols,
  onSelectVerse,
  onHighlightClick,
  onNoteSymbolClick,
  onFootnoteClick,
  onContextMenu,
  ttsActive,
  redLetterSpans,
}: {
  verse: Verse;
  highlights: Highlight[];
  notes: Note[];
  footnotes?: Footnote[];
  isActive: boolean;
  showVerseNumbers: boolean;
  showHighlights: boolean;
  showNoteSymbols: boolean;
  onSelectVerse: (verseNum: number) => void;
  onHighlightClick: (highlightId: number, x: number, y: number) => void;
  onNoteSymbolClick: (note: Note) => void;
  onFootnoteClick?: (footnote: Footnote, x: number, y: number) => void;
  onContextMenu?: (verseNum: number, x: number, y: number) => void;
  /** True while this verse is the one currently being read aloud -- swaps to word-by-word highlighting. */
  ttsActive?: boolean;
  /** Character ranges within this verse that are Christ's actual quoted
   * words (red-letter mode) -- only those ranges render in red, not the
   * whole verse. */
  redLetterSpans?: RedLetterSpan[];
}) {
  const tokens = buildTokens(verse.text, showHighlights ? highlights : [], verse.verse, footnotes ?? [], redLetterSpans);
  const notesByHighlight = new Map(notes.filter((n) => n.highlight_id != null).map((n) => [n.highlight_id as number, n]));
  const verseLevelNote = notes.find(
    (n) => n.highlight_id == null && verse.verse >= n.verse_start && verse.verse <= n.verse_end,
  );

  return (
    <div
      data-verse-row={verse.verse}
      onClick={() => onSelectVerse(verse.verse)}
      onContextMenu={(e) => {
        if (!onContextMenu) return;
        e.preventDefault();
        onContextMenu(verse.verse, e.clientX, e.clientY);
      }}
      className={cx(
        "reading-font group -mx-2 mb-0.5 flex cursor-text rounded-md px-2 py-1 transition-colors",
        isActive ? "bg-accent-soft" : "hover:bg-hover/60",
      )}
    >
      {showVerseNumbers && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelectVerse(verse.verse);
            if (onContextMenu) {
              const rect = e.currentTarget.getBoundingClientRect();
              onContextMenu(verse.verse, rect.right + 4, rect.top);
            }
          }}
          title={`Verse ${verse.verse}: highlight, note, copy, compare…`}
          aria-label={`Verse ${verse.verse} actions`}
          className={cx(
            "mr-1 mt-[0.15em] w-7 shrink-0 select-none rounded text-right font-sans text-xs font-semibold leading-none tabular-nums",
            isActive ? "text-accent" : "text-ink-4 group-hover:text-ink-3",
          )}
          style={{ fontSize: "0.65em", lineHeight: 1.9 }}
        >
          {verse.verse}
        </button>
      )}
      <span className="min-w-0 flex-1">
        {showNoteSymbols && verseLevelNote && (
          <button
            type="button"
            className="mr-1 inline-flex -translate-y-px align-middle text-amber-600 hover:text-amber-700 dark:text-amber-400"
            title="Open note"
            aria-label="Open note"
            onClick={(e) => {
              e.stopPropagation();
              onNoteSymbolClick(verseLevelNote);
            }}
          >
            <StickyNote className="h-[0.85em] w-[0.85em]" aria-hidden="true" />
          </button>
        )}
        <span data-verse-text={verse.verse}>
          {ttsActive ? (
            <ReadAloudWords text={verse.text} active />
          ) : (
            tokens.map((tok, i) => {
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
                    {seg.text}
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
                  {seg.text}
                  {showNoteSymbols && linkedNote && (
                    <button
                      type="button"
                      className="ml-0.5 inline-flex -translate-y-px align-middle text-amber-700 hover:text-amber-800"
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
            })
          )}
        </span>
      </span>
    </div>
  );
}
