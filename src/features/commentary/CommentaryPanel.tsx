import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { BookOpenText, MessageSquareText } from "lucide-react";
import { api } from "../../api/client";
import { useBooks, useCommentaryForPassage, useCommentarySources } from "../../api/queries";
import { decorateRefLinks } from "../../lib/refAttr";
import { sanitizeHtml } from "../../lib/sanitizeHtml";
import { toPassageRef } from "../../lib/passage";
import { useTtsReadingHere, useTtsStore } from "../../state/ttsStore";
import { useReadingTypography } from "../../state/uiStore";
import { ReadFromHereButton, useSpokenPieces, type SpeakingEntry } from "./CommentaryReadAloud";
import { buildCommentaryReading, entryOfPiece, isReadingClick, onScreenStart, pieceIndexAt, verseRangeLabel } from "./commentarySpeech";
import { landOnRow } from "./landOnRow";
import { ReadAloudButton } from "../tts/ReadAloudButton";
import { PaneLink } from "../../workspace/PaneLink";
import { usePane } from "../../workspace/PaneContext";
import type { Book } from "../../api/types";
import { selectSmClass, cx } from "../../components/ui/classes";
import { EmptyState, LoadingState } from "../../components/ui/EmptyState";
import { StudyActions } from "../sermons/StudyActions";
import { commentaryRef } from "../sermons/sourceIdentity";
import { firstParagraph } from "../sermons/excerpt";

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
  // The book's contents, for the "read as a book" link: it opens at this
  // chapter rather than at the book's first section (a preface, Romans 1).
  const { data: toc } = useQuery({
    queryKey: ["commentaryToc", sourceId, book.id],
    queryFn: () => api.getCommentaryToc(sourceId as number, book.id),
    enabled: sourceId != null && hasCommentary !== false,
  });
  const chapterSection = toc?.find((s) => s.chapter === chapter);
  const paneId = usePane().id;
  const ttsHere = useTtsReadingHere(paneId, "commentary");
  const ttsCurrentSegmentId = useTtsStore((s) => (ttsHere ? (s.segments[s.currentSegmentIndex]?.id ?? null) : null));
  // The entry the voice is in, whichever of its pieces it has reached.
  const readingEntryId = entryOfPiece(ttsCurrentSegmentId);
  const source = sources?.find((s) => s.id === sourceId);
  const sourceTitle = source?.title ?? "Commentary";
  // A source line reads better with the author's name than the volume title.
  const sourceAuthor = source?.author ?? sourceTitle;
  const ttsTitle = `${sourceTitle}: ${book.name} ${chapter}`;

  // The chapter's entries as the voice reads them, built once per list so
  // that a paragraph's place in the reading stays put between renders -- a
  // click on it seeks by that place. Labelled by verse ("vv. 28-30 ¶2"); an
  // entry on no verse in particular is on the chapter.
  const reading = useMemo(
    () => buildCommentaryReading(entries ?? [], (e) => verseRangeLabel(e.verse_start, e.verse_end) ?? `Ch. ${chapter}`),
    [entries, chapter],
  );

  // A click on a paragraph while this pane is reading the commentary moves
  // the voice to it -- to the very sentence, in the paragraph being read --
  // as a click on a verse does in the Bible beside it. Links, buttons and a
  // selection being made are left to do what they do.
  function readFromClick(e: React.MouseEvent, entryId: number) {
    if (!ttsHere || !isReadingClick(e.target, window.getSelection())) return;
    const index = pieceIndexAt(e.target, { x: e.clientX, y: e.clientY }) ?? reading.firstPiece.get(entryId);
    if (index == null) return;
    useTtsStore.getState().readFrom(ttsTitle, "commentary", reading.segments, index, { paneId });
  }

  const listRef = useRef<HTMLDivElement>(null);
  // Virtualized so a long commentary entry list (e.g. Henry or Barnes on a
  // dense chapter) doesn't render every HTML block -- some quite large -- at
  // once. Entry heights vary a lot, so sizes are measured after render.
  const rowVirtualizer = useVirtualizer({
    count: entries?.length ?? 0,
    getScrollElement: () => listRef.current,
    estimateSize: () => 150,
    overscan: 5,
    // Rows are measured from their ref callbacks, during React's commit,
    // where a synchronous re-render is an error (see ReadingPane).
    useFlushSync: false,
  });

  // While the voice reads this commentary and the page follows along, the
  // page is the voice's. A verse picked in the Bible beside it -- right-
  // clicked for its menu, a word in it double-clicked -- is still marked
  // here, but does not take the page away from the paragraph being read.
  const autoScroll = useTtsStore((s) => s.autoScroll);
  const voiceRunning = useTtsStore((s) => s.isPlaying && !s.isPaused);
  const voiceLeads = ttsHere && voiceRunning && autoScroll;

  // Bring the verse being read into view: the entry that starts on it, or
  // else the first whose range covers it. Only when the verse (or the list
  // under it) changes, so reading down the commentary isn't yanked back.
  const landingIndex = useMemo(() => verseLandingIndex(entries ?? [], activeVerse), [entries, activeVerse]);
  useEffect(() => {
    if (landingIndex < 0 || voiceLeads) return;
    const aim = () => rowVirtualizer.scrollToIndex(landingIndex, { align: "start" });
    aim();
    // The aim is taken from guessed row heights; hold the row at the top
    // while the rows around it are drawn and measured (see landOnRow).
    return landOnRow(listRef.current, landingIndex, aim);
    // Not again when the voice stops: that would yank the page from the
    // paragraph the reader was just listening to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [landingIndex, entries]);

  // Keep the paragraph being read on the page as the voice moves on. The
  // spoken words scroll themselves into view (ReadAloudWords), but only when
  // they are on the page: the list is virtualized, and a paragraph scrolled
  // well away is not rendered at all, leaving nothing to follow -- the page
  // stood still from then on. Its row is brought back first.
  const readingIndex = useMemo(() => (readingEntryId == null ? -1 : (entries ?? []).findIndex((e) => e.id === readingEntryId)), [entries, readingEntryId]);
  useEffect(() => {
    if (!autoScroll || readingIndex < 0) return;
    if (!rowVirtualizer.getVirtualItems().some((item) => item.index === readingIndex)) rowVirtualizer.scrollToIndex(readingIndex, { align: "start" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ttsCurrentSegmentId, readingIndex, autoScroll]);

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
            to={`/commentary/${sourceId}/${book.id}${chapterSection ? `/${chapterSection.id}` : ""}`}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-hover hover:text-ink"
            title="Read this commentary as a book"
            aria-label="Read this commentary as a book"
          >
            <BookOpenText className="h-4 w-4" aria-hidden="true" />
          </PaneLink>
        )}
        {/* From the first paragraph on screen (onScreenStart), worked out on
            the click. With nothing to read there is no onStart, and the
            button shows itself disabled. */}
        <ReadAloudButton
          title={ttsTitle}
          sourceKind="commentary"
          iconOnly
          segments={reading.segments}
          onStart={
            reading.segments.length > 0
              ? () => useTtsStore.getState().start(ttsTitle, "commentary", reading.segments, { paneId, startIndex: onScreenStart(listRef.current, reading, entries ?? []) })
              : undefined
          }
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
              const prev = item.index > 0 ? entries[item.index - 1] : null;
              // A run of paragraphs on one passage (all of Calvin on 8:28-30)
              // carries its verse label once, at the top of the run.
              const showVerseLabel = e.verse_start != null && !(prev && prev.verse_start === e.verse_start && prev.verse_end === e.verse_end);
              const isCurrent =
                activeVerse != null && e.verse_start != null && activeVerse >= e.verse_start && activeVerse <= (e.verse_end ?? e.verse_start);
              const firstPiece = reading.firstPiece.get(e.id);
              const spoken = readingEntryId === e.id ? reading.pieces.get(e.id) : undefined;
              return (
                <div
                  key={e.id}
                  ref={rowVirtualizer.measureElement}
                  data-index={item.index}
                  data-entry-index={item.index}
                  style={{ position: "absolute", top: 0, left: 0, right: 0, transform: `translateY(${item.start}px)` }}
                  className={cx("mb-3 rounded-md p-2 -mx-1", isCurrent && "bg-amber-50 ring-1 ring-amber-200 dark:bg-amber-950/30 dark:ring-amber-900")}
                >
                  <div className="mb-1 flex items-start gap-1">
                    {showVerseLabel && (
                      <button
                        type="button"
                        className="block text-xs font-semibold text-accent hover:underline"
                        onClick={() => onJumpToVerse(chapter, e.verse_start as number)}
                      >
                        {e.verse_start === e.verse_end ? `Verse ${e.verse_start}` : `Verses ${e.verse_start}-${e.verse_end}`}
                      </button>
                    )}
                    <span className="ml-auto flex shrink-0 items-center">
                      {firstPiece != null && <ReadFromHereButton title={ttsTitle} segments={reading.segments} index={firstPiece} />}
                      <StudyActions
                        what={`${sourceTitle} on ${book.name} ${chapter}${e.verse_start != null ? `:${e.verse_start}` : ""}`}
                        item={() =>
                          sourceId == null
                            ? null
                            : {
                                kind: "commentary",
                                refId: commentaryRef(sourceId, book.id, chapter, e.verse_start),
                                label: `${sourceAuthor} on ${book.name} ${chapter}${e.verse_start != null ? `:${e.verse_start}${e.verse_end !== e.verse_start ? `-${e.verse_end}` : ""}` : ""}`,
                                excerpt: firstParagraph(e.plain_text),
                              }
                        }
                      />
                    </span>
                  </div>
                  {/* While the voice is in this entry, the piece being read
                      is marked in the entry's own HTML (useSpokenPieces). */}
                  <div className="reading-font text-ink-2" style={typography} onClick={(ev) => readFromClick(ev, e.id)}>
                    <CommentaryHtml
                      html={e.html}
                      onJumpToRef={onJumpToRef}
                      speaking={spoken && firstPiece != null ? { entryId: e.id, pieces: spoken, first: firstPiece } : undefined}
                    />
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

/** Where a verse lands in a chapter's entries: the first entry that starts
 * on it, else the first whose range covers it, else -1. */
export function verseLandingIndex(entries: { verse_start: number | null; verse_end: number | null }[], verse: number | null): number {
  if (verse == null) return -1;
  const starts = entries.findIndex((e) => e.verse_start === verse);
  if (starts >= 0) return starts;
  return entries.findIndex((e) => e.verse_start != null && verse >= e.verse_start && verse <= (e.verse_end ?? e.verse_start));
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

export function CommentaryHtml({ html, onJumpToRef, speaking }: { html: string; onJumpToRef: JumpToRef; speaking?: SpeakingEntry }) {
  const ref = useRef<HTMLDivElement>(null);
  useSpokenPieces(ref, html, speaking);
  const { data: books } = useBooks();
  // One object per HTML string: React resets innerHTML whenever this
  // object's identity changes, which would wipe the attributes added below
  // on every parent re-render. Sanitized on the way in -- the importer
  // already builds this markup from an allowlist of its own, so this is
  // belt and braces, but no display point should be the exception.
  const inner = useMemo(() => ({ __html: sanitizeHtml(html) }), [html]);

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
