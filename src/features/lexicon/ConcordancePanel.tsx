import { useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useNavigate } from "react-router-dom";
import { useConcordance } from "../../api/queries";
import { useBooks } from "../../api/queries";
import { useNavigationStore } from "../../state/navigationStore";

/** Every occurrence of a Strong's-tagged word across the whole Bible, with
 * KJV context -- collapsed by default and only queried once opened, since a
 * common word's occurrence list can run into the hundreds or thousands. */
export function ConcordancePanel({ strongsId }: { strongsId: string }) {
  const [open, setOpen] = useState(false);
  const { data: entries } = useConcordance(strongsId, open);
  const { data: books } = useBooks();
  const goTo = useNavigationStore((s) => s.goTo);
  const navigate = useNavigate();
  const listRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: entries?.length ?? 0,
    getScrollElement: () => listRef.current,
    estimateSize: () => 60,
    overscan: 10,
  });

  function bookName(id: number) {
    return books?.find((b) => b.id === id)?.name ?? `#${id}`;
  }

  return (
    <div className="mt-4 border-t border-gray-200 pt-3 dark:border-gray-800">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-xs font-semibold uppercase tracking-wide text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
      >
        {open ? "▾" : "▸"} Concordance{entries ? ` (${entries.length} occurrences)` : ""}
      </button>
      {open && (
        <div ref={listRef} className="mt-2 max-h-96 overflow-y-auto text-sm">
          {!entries && <p className="p-2 text-gray-400">Loading…</p>}
          {entries && entries.length === 0 && <p className="p-2 text-gray-400">No occurrences found.</p>}
          {entries && entries.length > 0 && (
            <div style={{ position: "relative", height: rowVirtualizer.getTotalSize() }}>
              {rowVirtualizer.getVirtualItems().map((item) => {
                const e = entries[item.index];
                return (
                  <button
                    key={item.index}
                    ref={rowVirtualizer.measureElement}
                    data-index={item.index}
                    style={{ position: "absolute", top: 0, left: 0, right: 0, transform: `translateY(${item.start}px)` }}
                    className="block w-full rounded p-1.5 text-left hover:bg-gray-100 dark:hover:bg-gray-800"
                    onClick={() => {
                      goTo({ bookId: e.book_id, chapter: e.chapter, verse: e.verse });
                      navigate("/");
                    }}
                  >
                    <div className="text-xs font-medium text-gray-500">
                      {bookName(e.book_id)} {e.chapter}:{e.verse}
                    </div>
                    <div className="text-gray-700 dark:text-gray-300">{e.text}</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
