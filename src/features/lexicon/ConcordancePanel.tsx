import { useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronDown } from "lucide-react";
import { useConcordance } from "../../api/queries";
import { useBooks } from "../../api/queries";
import { openPassage, targetFor } from "../../workspace/openContent";
import { EmptyState, LoadingState } from "../../components/ui/EmptyState";
import { cx } from "../../components/ui/classes";

/** Every occurrence of a Strong's-tagged word across the whole Bible, with
 * KJV context -- collapsed by default and only queried once opened, since a
 * common word's occurrence list can run into the hundreds or thousands. */
export function ConcordancePanel({ strongsId }: { strongsId: string }) {
  const [open, setOpen] = useState(false);
  const { data: entries } = useConcordance(strongsId, open);
  const { data: books } = useBooks();
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
    <div className="mt-6 border-t border-line pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-ink-3 hover:text-ink"
      >
        <ChevronDown className={cx("h-3.5 w-3.5 transition-transform", !open && "-rotate-90")} aria-hidden="true" />
        Concordance{entries ? ` · ${entries.length} occurrence${entries.length === 1 ? "" : "s"}` : " · every verse using this word"}
      </button>
      {open && (
        <div ref={listRef} className="mt-2 max-h-96 overflow-y-auto text-sm">
          {!entries && <LoadingState />}
          {entries && entries.length === 0 && <EmptyState compact title="No occurrences found" />}
          {entries && entries.length > 0 && (
            <div style={{ position: "relative", height: rowVirtualizer.getTotalSize() }}>
              {rowVirtualizer.getVirtualItems().map((item) => {
                const e = entries[item.index];
                return (
                  <button
                    key={item.index}
                    type="button"
                    ref={rowVirtualizer.measureElement}
                    data-index={item.index}
                    style={{ position: "absolute", top: 0, left: 0, right: 0, transform: `translateY(${item.start}px)` }}
                    className="block w-full rounded-md p-2 text-left hover:bg-hover"
                    onClick={(ev) => openPassage({ bookId: e.book_id, chapter: e.chapter, verse: e.verse }, { target: targetFor(ev) })}
                  >
                    <div className="text-xs font-medium text-accent">
                      {bookName(e.book_id)} {e.chapter}:{e.verse}
                    </div>
                    <div className="reading-font text-ink-2">{e.text}</div>
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
