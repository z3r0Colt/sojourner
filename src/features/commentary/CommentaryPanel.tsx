import { useRef } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { api } from "../../api/client";
import { useCommentaryForPassage, useCommentarySources } from "../../api/queries";
import { useNavigationStore } from "../../state/navigationStore";
import { useTtsStore } from "../../state/ttsStore";
import { ReadAloudButton } from "../tts/ReadAloudButton";
import { ReadAloudWords } from "../tts/ReadAloudWords";
import type { Book } from "../../api/types";

export function CommentaryPanel({
  book,
  chapter,
  activeVerse,
  onJumpToVerse,
  onJumpToRef,
  onClose,
}: {
  book: Book;
  chapter: number;
  activeVerse: number | null;
  onJumpToVerse: (chapter: number, verse: number) => void;
  onJumpToRef: (bookOsisCode: string, chapter: number, verse: number) => void;
  onClose: () => void;
}) {
  const { data: sources } = useCommentarySources();
  const { activeCommentarySourceId, setActiveCommentarySource } = useNavigationStore();
  const sourceId = activeCommentarySourceId ?? sources?.[0]?.id ?? null;

  const { data: hasCommentary } = useQuery({
    queryKey: ["bookHasCommentary", sourceId, book.id],
    queryFn: () => api.bookHasCommentary(sourceId as number, book.id),
    enabled: sourceId != null,
  });

  const { data: entries } = useCommentaryForPassage(sourceId, book.id, chapter);
  const ttsSourceKind = useTtsStore((s) => s.sourceKind);
  const ttsCurrentSegmentId = useTtsStore((s) => s.segments[s.currentSegmentIndex]?.id ?? null);
  const sourceTitle = sources?.find((s) => s.id === sourceId)?.title ?? "Commentary";

  const listRef = useRef<HTMLDivElement>(null);
  // Virtualized so a long commentary entry list (e.g. Henry or Barnes on a
  // dense chapter) doesn't render every HTML block -- some quite large -- at
  // once. Entry heights vary a lot, so sizes are measured after render.
  const rowVirtualizer = useVirtualizer({
    count: entries?.length ?? 0,
    getScrollElement: () => listRef.current,
    estimateSize: () => 150,
    overscan: 5,
  });

  return (
    <aside className="flex h-full w-full flex-col border-l border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/40">
      <div className="flex items-center gap-2 border-b border-gray-200 p-2 dark:border-gray-800">
        <select
          className="flex-1 rounded border border-gray-300 bg-white px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-900"
          value={sourceId ?? ""}
          onChange={(e) => setActiveCommentarySource(Number(e.target.value))}
        >
          {sources?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
        {sourceId != null && (
          <Link
            to={`/commentary/${sourceId}/${book.id}`}
            className="whitespace-nowrap text-xs text-blue-600 hover:underline dark:text-blue-400"
          >
            Read as book
          </Link>
        )}
        <ReadAloudButton
          title={`${sourceTitle}: ${book.name} ${chapter}`}
          sourceKind="commentary"
          segments={(entries ?? []).map((e) => ({
            id: e.id,
            text: e.plain_text,
            label: e.verse_start != null ? `v.${e.verse_start}${e.verse_end !== e.verse_start ? `-${e.verse_end}` : ""}` : undefined,
          }))}
          label="🔊"
          className="rounded border border-gray-300 px-1.5 py-0.5 text-xs text-gray-500 hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
        />
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600" title="Close panel" aria-label="Close panel">
          ✕
        </button>
      </div>
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-3 text-sm leading-relaxed">
        {sourceId == null && <p className="text-gray-400">No commentary installed.</p>}
        {sourceId != null && hasCommentary === false && (
          <p className="text-gray-400">
            No commentary available for {book.name} in this source.{" "}
            <Link to={`/commentary/${sourceId}`} className="text-blue-600 hover:underline dark:text-blue-400">
              Browse other books
            </Link>
          </p>
        )}
        {entries && entries.length > 0 && (
          <div style={{ position: "relative", height: rowVirtualizer.getTotalSize() }}>
            {rowVirtualizer.getVirtualItems().map((item) => {
              const e = entries[item.index];
              return (
                <div
                  key={e.id}
                  ref={rowVirtualizer.measureElement}
                  data-index={item.index}
                  style={{ position: "absolute", top: 0, left: 0, right: 0, transform: `translateY(${item.start}px)` }}
                  className={`mb-3 rounded p-1.5 ${
                    activeVerse != null && e.verse_start != null && activeVerse >= e.verse_start && activeVerse <= (e.verse_end ?? e.verse_start)
                      ? "bg-amber-50 dark:bg-amber-950/30"
                      : ""
                  }`}
                >
                  {e.verse_start != null && (
                    <button
                      className="mb-0.5 block text-xs font-semibold text-gray-500 hover:underline"
                      onClick={() => onJumpToVerse(chapter, e.verse_start as number)}
                    >
                      {e.verse_start === e.verse_end ? `v.${e.verse_start}` : `v.${e.verse_start}-${e.verse_end}`}
                    </button>
                  )}
                  {ttsSourceKind === "commentary" && ttsCurrentSegmentId === e.id ? (
                    <ReadAloudWords text={e.plain_text} active className="reading-font" />
                  ) : (
                    <CommentaryHtml html={e.html} onJumpToRef={onJumpToRef} />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}

export function CommentaryHtml({
  html,
  onJumpToRef,
}: {
  html: string;
  onJumpToRef: (bookOsisCode: string, chapter: number, verse: number) => void;
}) {
  return (
    <div
      className="commentary-html"
      onClick={(e) => {
        const target = e.target as HTMLElement;
        const link = target.closest<HTMLElement>("a.scripref");
        if (link) {
          const osis = link.getAttribute("data-osis") ?? "";
          const m = osis.match(/(?:Bible:)?([1-3]?[A-Za-z]+)\.(\d+)\.(\d+)/);
          if (m) onJumpToRef(m[1], Number(m[2]), Number(m[3]));
        }
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
