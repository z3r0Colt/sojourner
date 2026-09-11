import { X } from "lucide-react";
import { useViewportClampedPosition } from "../../lib/useViewportClampedPosition";
import { IconButton } from "../../components/ui/Button";

export function FootnotePopup({
  marker,
  text,
  x,
  y,
  onClose,
}: {
  marker: string;
  text: string;
  x: number;
  y: number;
  onClose: () => void;
}) {
  const { ref, style } = useViewportClampedPosition<HTMLDivElement>(x, y);

  return (
    <div
      ref={ref}
      className="z-40 w-72 rounded-lg border border-line bg-surface p-3 text-sm shadow-xl"
      style={style}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="mb-1 flex items-start justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-3">Note {marker}</span>
        <IconButton icon={X} label="Close" size="sm" onClick={onClose} />
      </div>
      <p className="text-ink-2">{text}</p>
    </div>
  );
}
