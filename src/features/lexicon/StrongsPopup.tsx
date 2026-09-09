import { Link } from "react-router-dom";
import { useStrongsEntry } from "../../api/queries";

export function StrongsPopup({ id, x, y, onClose }: { id: string; x: number; y: number; onClose: () => void }) {
  const { data: entry, isLoading } = useStrongsEntry(id);

  return (
    <div
      className="fixed z-40 w-80 rounded-lg border border-gray-200 bg-white p-3 shadow-xl dark:border-gray-700 dark:bg-gray-900"
      style={{ left: Math.min(x, window.innerWidth - 340), top: y }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="mb-1 flex items-start justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">{id}</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          ✕
        </button>
      </div>
      {isLoading && <p className="text-sm text-gray-400">Loading…</p>}
      {!isLoading && !entry && <p className="text-sm text-gray-400">No lexicon entry found.</p>}
      {entry && (
        <div className="text-sm">
          <div className="mb-1 flex items-baseline gap-2">
            <span className="text-2xl" lang={entry.language === "hebrew" ? "he" : "el"}>
              {entry.original_word}
            </span>
            {entry.transliteration && <span className="italic text-gray-500">{entry.transliteration}</span>}
          </div>
          {entry.pronunciation && (
            <div className="mb-2 text-xs text-gray-400">pronounced: {entry.pronunciation}</div>
          )}
          <p className="mb-2 text-gray-700 dark:text-gray-300">{entry.definition}</p>
          {entry.derivation && (
            <p className="mb-1 text-xs text-gray-500">
              <span className="font-semibold">Derivation:</span> {entry.derivation}
            </p>
          )}
          {entry.kjv_usage && (
            <p className="mb-2 text-xs text-gray-500">
              <span className="font-semibold">KJV usage:</span> {entry.kjv_usage}
            </p>
          )}
          <Link
            to={`/lexicon/${entry.id}`}
            className="text-xs text-blue-600 hover:underline dark:text-blue-400"
            onClick={onClose}
          >
            View full entry →
          </Link>
        </div>
      )}
    </div>
  );
}
