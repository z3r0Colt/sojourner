import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { BookOpenText, MessageSquareText } from "lucide-react";
import { api } from "../../api/client";
import { useBooks, useCommentaryForPassage, useCommentarySources } from "../../api/queries";
import { decorateRefLinks } from "../../lib/refAttr";
import { toPassageRef } from "../../lib/passage";
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
  onJumpToRef: JumpToRef;
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

/** A click on a Scripture reference inside commentary HTML. The event is
 * passed so callers can honor Ctrl+click and middle-click (a new pane). */
export type JumpToRef = (bookOsisCode: string, chapter: number, verse: number, e?: React.MouseEvent) => void;

/** "Bible:John.3.16", "John.3.16-John.3.18", or "John.3.16-18" (the forms
 * the ThML and Thayer's importers write to `data-osis`). A range that
 * crosses into another chapter keeps only its first verse. */
export function parseOsis(osis: string): { book: string; chapter: number; verse: number; verseEnd: number } | null {
  const m = osis.match(/^(?:Bible:)?([1-3]?[A-Za-z]+)\.(\d+)\.(\d+)(?:-(?:[1-3]?[A-Za-z]+\.)?(?:(\d+)\.)?(\d+))?/);
  if (!m) return null;
  const chapter = Number(m[2]);
  const verse = Number(m[3]);
  const endChapter = m[4] != null ? Number(m[4]) : chapter;
  const verseEnd = m[5] != null && endChapter === chapter ? Math.max(verse, Number(m[5])) : verse;
  return { book: m[1], chapter, verse, verseEnd };
}

export function CommentaryHtml({ html, onJumpToRef }: { html: string; onJumpToRef: JumpToRef }) {
  const ref = useRef<HTMLDivElement>(null);
  const { data: books } = useBooks();
  // One object per HTML string: React resets innerHTML whenever this
  // object's identity changes, which would wipe the attributes added below
  // on every parent re-render.
  const inner = useMemo(() => ({ __html: html }), [html]);

  // Hover previews: every `a.scripref` gets a data-ref derived from its
  // data-osis after render, so the stored HTML stays as imported. Runs
  // again when the HTML changes (React rewrites innerHTML then).
  useEffect(() => {
    const root = ref.current;
    if (!root || !books) return;
    decorateRefLinks(root, "a.scripref[data-osis]", (el) => {
      const parsed = parseOsis(el.getAttribute("data-osis") ?? "");
      const book = parsed ? books.find((b) => b.osis_code === parsed.book) : undefined;
      return parsed && book ? toPassageRef(book.id, parsed.chapter, parsed.verse, parsed.verseEnd) : null;
    });
  }, [html, books]);

  function handleClick(e: React.MouseEvent) {
    const link = (e.target as HTMLElement).closest<HTMLElement>("a.scripref");
    if (!link) return;
    const parsed = parseOsis(link.getAttribute("data-osis") ?? "");
    if (parsed) onJumpToRef(parsed.book, parsed.chapter, parsed.verse, e);
  }

  return (
    <div
      ref={ref}
      className="commentary-html"
      onClick={handleClick}
      onAuxClick={(e) => e.button === 1 && handleClick(e)}
      dangerouslySetInnerHTML={inner}
    />
  );
}
