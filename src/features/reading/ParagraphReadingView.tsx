import type { Highlight, Note, Verse, Footnote } from "../../api/types";
import { buildTokens } from "./verseTokens";

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
  isRedLetter,
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
  isRedLetter?: boolean;
}) {
  const tokens = buildTokens(verse.text, highlights, verse.verse, footnotes ?? []);
  const notesByHighlight = new Map(notes.filter((n) => n.highlight_id != null).map((n) => [n.highlight_id as number, n]));
  const verseLevelNote = notes.find(
    (n) => n.highlight_id == null && verse.verse >= n.verse_start && verse.verse <= n.verse_end,
  );

  return (
    <span
      onClick={() => onSelectVerse(verse.verse)}
      onContextMenu={(e) => {
        if (!onContextMenu) return;
        e.preventDefault();
        onContextMenu(verse.verse, e.clientX, e.clientY);
      }}
      className={`rounded transition-colors ${isActive ? "bg-blue-50 dark:bg-blue-950/40" : ""}`}
    >
      {showVerseNumbers && (
        <sup className="mr-0.5 select-none text-xs font-semibold text-gray-400">{verse.verse}</sup>
      )}
      {showNoteSymbols && verseLevelNote && (
        <button
          className="mr-0.5 align-middle text-amber-500"
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
      <span data-verse-text={verse.verse} className={isRedLetter ? "text-red-600 dark:text-red-400" : undefined}>
        {tokens.map((tok, i) => {
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
          if (!seg.color) return <span key={i}>{seg.text} </span>;
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
  fontSize,
  isRedLetterVerse,
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
  fontSize: number;
  isRedLetterVerse?: (verseNum: number) => boolean;
  onSelectVerse: (verseNum: number) => void;
  onHighlightClick: (highlightId: number, x: number, y: number) => void;
  onNoteSymbolClick: (note: Note) => void;
  onFootnoteClick?: (footnote: Footnote, x: number, y: number) => void;
  onContextMenu?: (verseNum: number, x: number, y: number) => void;
}) {
  return (
    <p className="reading-font leading-relaxed" style={{ fontSize }}>
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
          isRedLetter={isRedLetterVerse?.(v.verse)}
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
