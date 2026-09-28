import { StickyNote, Trash2, Underline, X } from "lucide-react";
import { useViewportClampedPosition } from "../../lib/useViewportClampedPosition";
import { HIGHLIGHT_COLORS, UNDERLINE_COLOR, highlightColorLabel, useHighlightLabels } from "./highlightColors";
import { Button, IconButton } from "../../components/ui/Button";

export function HighlightPopup({
  x,
  y,
  flipY,
  hasNote,
  onPickColor,
  onUnderline,
  onNote,
  onRemove,
  onClose,
}: {
  /** The middle of the top of the highlighted line that was clicked, which
   * the bar floats over. */
  x: number;
  y: number;
  /** The bottom of that line: with no room over it, the bar drops under it
   * here rather than onto the words. */
  flipY?: number;
  hasNote?: boolean;
  onPickColor: (color: string) => void;
  onUnderline: (color: string) => void;
  onNote: () => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  // Closes when the reader scrolls the text, rather than floating on over
  // whatever words scroll in under it; and, like the verse menu, on Escape
  // and on a press anywhere else -- another verse, another highlight.
  const { ref, style } = useViewportClampedPosition<HTMLDivElement>(x, y, {
    align: "above-center",
    flipY,
    onDismiss: onClose,
    closeOnEscape: true,
    closeOnPressOutside: true,
  });
  const [labels] = useHighlightLabels();

  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label="Highlight actions"
      className="z-40 flex items-center gap-1 rounded-lg border border-line bg-surface p-1.5 shadow-xl"
      style={style}
      onMouseDown={(e) => e.preventDefault()}
    >
      {HIGHLIGHT_COLORS.map((c) => {
        const name = `Change to ${highlightColorLabel(c, labels)}`;
        return (
          <button
            key={c.color}
            type="button"
            className="h-6 w-6 rounded-full border border-black/10 transition-transform hover:scale-110"
            style={{ backgroundColor: c.color }}
            title={name}
            aria-label={name}
            onClick={() => onPickColor(c.color)}
          />
        );
      })}
      <span className="mx-1 h-5 w-px bg-line" aria-hidden="true" />
      <IconButton icon={Underline} label="Change to underline" size="sm" onClick={() => onUnderline(UNDERLINE_COLOR)} />
      <Button variant="ghost" size="sm" icon={StickyNote} onClick={onNote}>
        {hasNote ? "Edit note" : "Add note"}
      </Button>
      <IconButton icon={Trash2} label="Remove highlight" size="sm" onClick={onRemove} className="text-danger hover:bg-danger-soft hover:text-danger" />
      <IconButton icon={X} label="Close" size="sm" onClick={onClose} />
    </div>
  );
}
