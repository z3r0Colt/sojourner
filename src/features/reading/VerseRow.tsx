import type { Highlight, Note, Verse, Footnote } from "../../api/types";
import { ReadAloudWords } from "../tts/ReadAloudWords";
import { buildTokens } from "./verseTokens";
import type { RedLetterSpan } from "./redLetterSpans";

export function VerseRow({
  verse,
  highlights,
  notes,
  footnotes,
  isActive,
  showVerseNumbers,
  showHighlights,
  showNoteSymbols,
  fontSize,
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
  fontSize: number;
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
      className={`reading-font mb-1 cursor-default rounded px-2 py-0.5 leading-relaxed transition-colors ${
        isActive ? "bg-blue-50 dark:bg-blue-950/40" : ""
      }`}
      style={{ fontSize }}
    >
      {showVerseNumbers && (
        <sup className="mr-1 select-none text-xs font-semibold text-gray-400">{verse.verse}</sup>
      )}
      {showNoteSymbols && verseLevelNote && (
        <button
          className="mr-1 align-middle text-amber-500"
          title="Has a note"
          aria-label="Has a note"
          onClick={(e) => {
            e.stopPropagation();
            onNoteSymbolClick(verseLevelNote);
          }}
        >
          📝
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
                className="ml-0.5 cursor-pointer text-blue-500 hover:text-blue-700 dark:text-blue-400"
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
              <span key={i} className={seg.isRedLetter ? "text-red-600 dark:text-red-400" : undefined}>
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
                <sup
                  className="ml-0.5 cursor-pointer text-amber-600"
                  title="Has a note"
                  aria-label="Has a note"
                  onClick={(e) => {
                    e.stopPropagation();
                    onNoteSymbolClick(linkedNote);
                  }}
                >
                  📝
                </sup>
              )}
            </mark>
          );
          })
        )}
      </span>
    </div>
  );
}
