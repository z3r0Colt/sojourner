import { X } from "lucide-react";
import { useViewportClampedPosition } from "../../lib/useViewportClampedPosition";
import { IconButton } from "../../components/ui/Button";
import { cx } from "../../components/ui/classes";
import { tidyFootnoteText } from "./footnoteText";

export function FootnotePopup({
  marker,
  text,
  x,
  y,
  anchorTop,
  onClose,
}: {
  marker: string;
  text: string;
  x: number;
  y: number;
  /** The top of the marker the note hangs under. A note with no room below
   * the marker opens above it instead, clear of the marker and its line,
   * rather than over the very words it is a note on. */
  anchorTop?: number;
  onClose: () => void;
}) {
  // Closes on Escape and on a press anywhere else, like the verse menu and
  // the Strong's card, as well as when the text is scrolled away from it.
  const { ref, style, scrolled } = useViewportClampedPosition<HTMLDivElement>(x, y, {
    flipY: anchorTop,
    onDismiss: onClose,
    closeOnEscape: true,
    closeOnPressOutside: true,
  });

  return (
    <div
      ref={ref}
      role="note"
      aria-label={`Note ${marker}`}
      className="z-40 w-72 rounded-lg border border-line bg-surface px-3 pb-3 text-sm shadow-xl"
      style={style}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Stays put when a window too short for a long note holds the popup
          to a scrolling height, so its only Close is never scrolled away. It
          carries the popup's top padding, so there is no strip above it for
          the note to show through, and a rule under it once the note scrolls
          beneath it, so the cut-off line reads as passing under a header. */}
      <div
        className={cx(
          "sticky top-0 z-10 -mx-3 flex items-start justify-between rounded-t-lg border-b bg-surface px-3 pb-1 pt-3",
          scrolled ? "border-line" : "border-transparent",
        )}
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-3">Note {marker}</span>
        <IconButton icon={X} label="Close" size="sm" onClick={onClose} />
      </div>
      <p className="text-ink-2">{tidyFootnoteText(text)}</p>
    </div>
  );
}
