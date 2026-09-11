import { StickyNote, Trash2, Underline, X } from "lucide-react";
import { useViewportClampedPosition } from "../../lib/useViewportClampedPosition";
import { HIGHLIGHT_COLORS, UNDERLINE_COLOR } from "./highlightColors";
import { Button, IconButton } from "../../components/ui/Button";

export function HighlightPopup({
  x,
  y,
  hasNote,
  onPickColor,
  onUnderline,
  onNote,
  onRemove,
  onClose,
}: {
  x: number;
  y: number;
  hasNote?: boolean;
  onPickColor: (color: string) => void;
  onUnderline: (color: string) => void;
  onNote: () => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const { ref, style } = useViewportClampedPosition<HTMLDivElement>(x, y, { align: "above-center" });

  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label="Highlight actions"
      className="z-40 flex items-center gap-1 rounded-lg border border-line bg-surface p-1.5 shadow-xl"
      style={style}
      onMouseDown={(e) => e.preventDefault()}
    >
      {HIGHLIGHT_COLORS.map((c) => (
        <button
          key={c.color}
          type="button"
          className="h-6 w-6 rounded-full border border-black/10 transition-transform hover:scale-110"
          style={{ backgroundColor: c.color }}
          title={`Change to ${c.name.toLowerCase()}`}
          aria-label={`Change to ${c.name.toLowerCase()}`}
          onClick={() => onPickColor(c.color)}
        />
      ))}
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
