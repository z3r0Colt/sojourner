import { useViewportClampedPosition } from "../../lib/useViewportClampedPosition";

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
      className="z-40 w-72 rounded-lg border border-gray-200 bg-white p-3 text-sm shadow-xl dark:border-gray-700 dark:bg-gray-900"
      style={style}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="mb-1 flex items-start justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Note {marker}</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600" title="Close" aria-label="Close">
          ✕
        </button>
      </div>
      <p className="text-gray-700 dark:text-gray-300">{text}</p>
    </div>
  );
}
