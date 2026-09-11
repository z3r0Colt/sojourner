import { Copy, StickyNote, Underline, X } from "lucide-react";
import { useViewportClampedPosition } from "../../lib/useViewportClampedPosition";
import { HIGHLIGHT_COLORS, UNDERLINE_COLOR, highlightColorLabel, useHighlightLabels } from "./highlightColors";
import { IconButton } from "../../components/ui/Button";

/** Floats above a text selection: pick a highlight color, underline, add a
 * note, or copy with the reference. Each color button is named by the
 * reader's label for it ("Promise (yellow)"). */
export function SelectionToolbar({
  x,
  y,
  onPickColor,
  onUnderline,
  onAddNote,
  onCopy,
  onClose,
}: {
  x: number;
  y: number;
  onPickColor: (color: string) => void;
  onUnderline: (color: string) => void;
  onAddNote: () => void;
  onCopy?: () => void;
  onClose: () => void;
}) {
  const { ref, style } = useViewportClampedPosition<HTMLDivElement>(x, y, { align: "above-center" });
  const [labels] = useHighlightLabels();

  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label="Selection actions"
      className="z-40 flex items-center gap-1 rounded-lg border border-line bg-surface p-1.5 shadow-xl"
      style={style}
      onMouseDown={(e) => e.preventDefault()}
    >
      {HIGHLIGHT_COLORS.map((c) => {
        const name = `Highlight: ${highlightColorLabel(c, labels)}`;
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
      <IconButton icon={Underline} label="Underline" size="sm" onClick={() => onUnderline(UNDERLINE_COLOR)} />
      <IconButton icon={StickyNote} label="Add note" size="sm" onClick={onAddNote} />
      {onCopy && <IconButton icon={Copy} label="Copy (in the format chosen in Settings)" size="sm" onClick={onCopy} />}
      <IconButton icon={X} label="Close" size="sm" onClick={onClose} />
    </div>
  );
}
