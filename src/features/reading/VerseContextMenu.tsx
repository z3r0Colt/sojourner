export function VerseContextMenu({
  x,
  y,
  onCompare,
  onClose,
}: {
  x: number;
  y: number;
  onCompare: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40" onClick={onClose} onContextMenu={(e) => e.preventDefault()}>
      <div
        className="absolute w-56 rounded-lg border border-gray-200 bg-white py-1 text-sm shadow-xl dark:border-gray-700 dark:bg-gray-900"
        style={{ left: Math.min(x, window.innerWidth - 230), top: y }}
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
      </div>
    </div>
  );
}
