import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { BookOpenText, MessageSquareText } from "lucide-react";
import { api } from "../../api/client";
import { useCommentaryForPassage, useCommentarySources } from "../../api/queries";
import { useTtsReadingHere, useTtsStore } from "../../state/ttsStore";
import { useReadingTypography } from "../../state/uiStore";
import { ReadAloudButton } from "../tts/ReadAloudButton";
import { ReadAloudWords } from "../tts/ReadAloudWords";
import { PaneLink } from "../../workspace/PaneLink";
import { usePane } from "../../workspace/PaneContext";
import type { Book } from "../../api/types";
import { selectSmClass, cx } from "../../components/ui/classes";
import { EmptyState, LoadingState } from "../../components/ui/EmptyState";

export function CommentaryPanel({
  book,
  chapter,
  activeVerse,
  sourceId: requestedSourceId,
  onSourceChange,
  onJumpToVerse,
  onJumpToRef,
}: {
  book: Book;
  chapter: number;
  activeVerse: number | null;
  /** The chosen source, or null for the first installed one. */
  sourceId: number | null;
  onSourceChange: (sourceId: number) => void;
  onJumpToVerse: (chapter: number, verse: number) => void;
  onJumpToRef: (bookOsisCode: string, chapter: number, verse: number) => void;
}) {
  const { data: sources } = useCommentarySources();
  const sourceId = requestedSourceId ?? sources?.[0]?.id ?? null;
  const typography = useReadingTypography(0.85);

  const { data: hasCommentary } = useQuery({
    queryKey: ["bookHasCommentary", sourceId, book.id],
    queryFn: () => api.bookHasCommentary(sourceId as number, book.id),
    enabled: sourceId != null,
  });

  const { data: entries, isLoading } = useCommentaryForPassage(sourceId, book.id, chapter);
  const ttsHere = useTtsReadingHere(usePane().id, "commentary");
  const ttsCurrentSegmentId = useTtsStore((s) => (ttsHere ? (s.segments[s.currentSegmentIndex]?.id ?? null) : null));
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
    <div className="flex h-full w-full flex-col">
      <div className="flex items-center gap-1.5 border-b border-line px-2 py-1.5">
        <select aria-label="Commentary source" className={cx(selectSmClass, "min-w-0 flex-1")} value={sourceId ?? ""} onChange={(e) => onSourceChange(Number(e.target.value))}>
          {sources?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
        {sourceId != null && (
          <PaneLink
            to={`/commentary/${sourceId}/${book.id}`}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-hover hover:text-ink"
            title="Read this commentary as a book"
            aria-label="Read this commentary as a book"
          >
            <BookOpenText className="h-4 w-4" aria-hidden="true" />
          </PaneLink>
        )}
        <ReadAloudButton
          title={`${sourceTitle}: ${book.name} ${chapter}`}
          sourceKind="commentary"
          iconOnly
          segments={(entries ?? []).map((e) => ({
            id: e.id,
            text: e.plain_text,
            label: e.verse_start != null ? `v.${e.verse_start}${e.verse_end !== e.verse_start ? `-${e.verse_end}` : ""}` : undefined,
          }))}
        />
      </div>
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-3">
        {sourceId == null && <EmptyState compact icon={MessageSquareText} title="No commentary installed" description="Add one under Settings → Library." />}
        {sourceId != null && isLoading && <LoadingState />}
        {sourceId != null && hasCommentary === false && (
          <EmptyState
            compact
            title={`No commentary on ${book.name} in this source`}
            action={
              <PaneLink to={`/commentary/${sourceId}`} className="text-sm text-accent hover:underline">
                Browse the books it does cover
              </PaneLink>
            }
          />
        )}
        {entries && entries.length > 0 && (
          <div style={{ position: "relative", height: rowVirtualizer.getTotalSize() }}>
            {rowVirtualizer.getVirtualItems().map((item) => {
              const e = entries[item.index];
              const isCurrent =
                activeVerse != null && e.verse_start != null && activeVerse >= e.verse_start && activeVerse <= (e.verse_end ?? e.verse_start);
              return (
                <div
                  key={e.id}
                  ref={rowVirtualizer.measureElement}
                  data-index={item.index}
                  style={{ position: "absolute", top: 0, left: 0, right: 0, transform: `translateY(${item.start}px)` }}
                  className={cx("mb-3 rounded-md p-2 -mx-1", isCurrent && "bg-amber-50 ring-1 ring-amber-200 dark:bg-amber-950/30 dark:ring-amber-900")}
                >
                  {e.verse_start != null && (
                    <button
                      type="button"
                      className="mb-1 block text-xs font-semibold text-accent hover:underline"
                      onClick={() => onJumpToVerse(chapter, e.verse_start as number)}
                    >
                      {e.verse_start === e.verse_end ? `Verse ${e.verse_start}` : `Verses ${e.verse_start}-${e.verse_end}`}
                    </button>
                  )}
                  <div className="reading-font text-ink-2" style={typography}>
                    {ttsHere && ttsCurrentSegmentId === e.id ? (
                      <ReadAloudWords text={e.plain_text} active />
                    ) : (
                      <CommentaryHtml html={e.html} onJumpToRef={onJumpToRef} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
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
