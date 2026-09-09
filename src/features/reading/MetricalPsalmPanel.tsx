import { useState } from "react";
import { useMetricalPsalm } from "../../api/queries";

export function MetricalPsalmPanel({ psalm, onClose }: { psalm: number; onClose: () => void }) {
  const { data: versions } = useMetricalPsalm(psalm);
  const [versionIdx, setVersionIdx] = useState(0);
  const version = versions?.[Math.min(versionIdx, (versions?.length ?? 1) - 1)];

  return (
    <aside className="flex h-full w-full flex-col bg-gray-50 dark:bg-gray-900/40">
      <div className="flex items-center justify-between border-b border-gray-200 p-2 text-xs text-gray-500 dark:border-gray-800">
        <span>1650 Scottish Metrical Psalter — Psalm {psalm}</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600" title="Close panel">
          ✕
        </button>
      </div>
      {versions && versions.length > 1 && (
        <div className="flex gap-1 border-b border-gray-200 px-2 py-1 dark:border-gray-800">
          {versions.map((v, i) => (
            <button
              key={i}
              onClick={() => setVersionIdx(i)}
              className={`rounded px-2 py-0.5 text-xs ${
                i === versionIdx
                  ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                  : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
              }`}
            >
              {v.label ?? `Version ${i + 1}`}
            </button>
          ))}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto p-3 text-sm">
        {!versions && <p className="p-2 text-gray-400">Loading…</p>}
        {versions && versions.length === 0 && <p className="p-2 text-gray-400">No metrical setting for this psalm.</p>}
        {version?.verses.map((v) => (
          <p key={v.verse} className="reading-font mb-3 leading-relaxed">
            <sup className="mr-1 text-xs font-semibold text-gray-400">{v.verse}</sup>
            {v.text}
          </p>
        ))}
      </div>
    </aside>
  );
}
