import { useViewportClampedPosition } from "../../lib/useViewportClampedPosition";

const COLORS = ["#fef08a", "#bbf7d0", "#bfdbfe", "#fbcfe8", "#fed7aa"];

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
      className="z-40 flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1.5 shadow-lg dark:border-gray-700 dark:bg-gray-900"
      style={style}
      onMouseDown={(e) => e.preventDefault()}
    >
      {COLORS.map((c) => (
        <button
          key={c}
          className="h-6 w-6 rounded-full border border-black/10"
          style={{ backgroundColor: c }}
          title="Change color"
          onClick={() => onPickColor(c)}
        />
      ))}
      <button
        className="ml-1 rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
        onClick={() => onUnderline("#f59e0b")}
        title="Underline"
      >
        U
      </button>
      <button
        className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
        onClick={onNote}
        title={hasNote ? "Edit note" : "Add note"}
      >
        {hasNote ? "📝 Note" : "+ Note"}
      </button>
      <button
        className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
        onClick={onRemove}
        title="Remove"
      >
        Remove
      </button>
      <button
        className="rounded px-2 py-1 text-xs text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
        onClick={onClose}
        title="Close"
        aria-label="Close"
      >
        ✕
      </button>
    </div>
  );
}
