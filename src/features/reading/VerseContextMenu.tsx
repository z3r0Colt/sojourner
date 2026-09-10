import { useViewportClampedPosition } from "../../lib/useViewportClampedPosition";

export function VerseContextMenu({
  x,
  y,
  onCompare,
  onCopy,
  onClose,
}: {
  x: number;
  y: number;
  onCompare: () => void;
  onCopy?: () => void;
  onClose: () => void;
}) {
  const { ref, style } = useViewportClampedPosition<HTMLDivElement>(x, y);

  return (
    <div className="fixed inset-0 z-40" onClick={onClose} onContextMenu={(e) => e.preventDefault()}>
      <div
        ref={ref}
        className="w-56 rounded-lg border border-gray-200 bg-white py-1 text-sm shadow-xl dark:border-gray-700 dark:bg-gray-900"
        style={style}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="block w-full px-3 py-1.5 text-left hover:bg-gray-100 dark:hover:bg-gray-800"
          onClick={() => {
            onCompare();
            onClose();
          }}
        >
          Compare across translations
        </button>
        {onCopy && (
          <button
            className="block w-full px-3 py-1.5 text-left hover:bg-gray-100 dark:hover:bg-gray-800"
            onClick={() => {
              onCopy();
              onClose();
            }}
          >
            Copy with reference
          </button>
        )}
      </div>
    </div>
  );
}
