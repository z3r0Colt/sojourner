import { useEffect } from "react";
import { Bookmark, BookmarkCheck, Brain, Columns2, Copy, Mic, StickyNote, Underline } from "lucide-react";
import { useViewportClampedPosition } from "../../lib/useViewportClampedPosition";
import { HIGHLIGHT_COLORS, UNDERLINE_COLOR, highlightColorLabel, useHighlightLabels } from "./highlightColors";
import { PopoverItem } from "../../components/ui/Popover";

/** Right-click (or verse-number click) menu: everything you can do to a
 * whole verse without first drag-selecting its text. */
export function VerseContextMenu({
  x,
  y,
  verseLabel,
  isBookmarked,
  onHighlight,
  onUnderline,
  onNote,
  onCompare,
  onCopy,
  onMemorize,
  onBookmark,
  onSendToSermon,
  onClose,
}: {
  x: number;
  y: number;
  verseLabel: string;
  isBookmarked: boolean;
  onHighlight: (color: string) => void;
  onUnderline: (color: string) => void;
  onNote: () => void;
  onCompare: () => void;
  onCopy: () => void;
  onMemorize: () => void;
  onBookmark: () => void;
  /** Drops this verse into the open sermon as a live passage block. */
  onSendToSermon?: () => void;
  onClose: () => void;
}) {
  const { ref, style } = useViewportClampedPosition<HTMLDivElement>(x, y);
  const [labels] = useHighlightLabels();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  function run(fn: () => void) {
    return () => {
      fn();
      onClose();
    };
  }

  return (
    <div className="fixed inset-0 z-40" onMouseDown={onClose} onContextMenu={(e) => e.preventDefault()}>
      <div
        ref={ref}
        role="menu"
        aria-label={`${verseLabel} actions`}
        className="w-60 rounded-lg border border-line bg-surface p-1.5 text-sm shadow-xl"
        style={style}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="px-2 pb-1.5 pt-1 text-xs font-semibold text-ink-3">{verseLabel}</div>
        <div className="mb-1 flex items-center gap-1.5 px-2 pb-1.5">
          {HIGHLIGHT_COLORS.map((c) => {
            const name = `Highlight verse: ${highlightColorLabel(c, labels)}`;
            return (
              <button
                key={c.color}
                type="button"
                role="menuitem"
                className="h-6 w-6 rounded-full border border-black/10 transition-transform hover:scale-110"
                style={{ backgroundColor: c.color }}
                title={name}
                aria-label={name}
                onClick={run(() => onHighlight(c.color))}
              />
            );
          })}
        </div>
        <PopoverItem onClick={run(() => onUnderline(UNDERLINE_COLOR))}>
          <Underline className="h-4 w-4 text-ink-3" aria-hidden="true" /> Underline verse
        </PopoverItem>
        <PopoverItem onClick={run(onNote)}>
          <StickyNote className="h-4 w-4 text-ink-3" aria-hidden="true" /> Add a note
        </PopoverItem>
        <PopoverItem onClick={run(onCopy)}>
          <Copy className="h-4 w-4 text-ink-3" aria-hidden="true" /> Copy verse
        </PopoverItem>
        <PopoverItem onClick={run(onCompare)}>
          <Columns2 className="h-4 w-4 text-ink-3" aria-hidden="true" /> Compare translations
        </PopoverItem>
        {onSendToSermon && (
          <PopoverItem onClick={run(onSendToSermon)}>
            <Mic className="h-4 w-4 text-ink-3" aria-hidden="true" /> Send to sermon
          </PopoverItem>
        )}
        <div className="my-1 h-px bg-line" aria-hidden="true" />
        <PopoverItem onClick={run(onMemorize)}>
          <Brain className="h-4 w-4 text-ink-3" aria-hidden="true" /> Add to Scripture memory
        </PopoverItem>
        <PopoverItem onClick={run(onBookmark)}>
          {isBookmarked ? (
            <>
              <BookmarkCheck className="h-4 w-4 text-accent" aria-hidden="true" /> Remove bookmark
            </>
          ) : (
            <>
              <Bookmark className="h-4 w-4 text-ink-3" aria-hidden="true" /> Bookmark verse
            </>
          )}
        </PopoverItem>
      </div>
    </div>
  );
}
