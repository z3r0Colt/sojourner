import { useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, MessageSquareText } from "lucide-react";
import { api } from "../../api/client";
import { useBooks, useCommentarySources } from "../../api/queries";
import { usePane, usePaneNavigate, usePaneParams } from "../../workspace/PaneContext";
import { SidePanel } from "../../components/ui/SidePanel";
import { PaneLink as Link } from "../../workspace/PaneLink";
import { openPassage, targetFor } from "../../workspace/openContent";
import { useTtsReadingHere, useTtsStore } from "../../state/ttsStore";
import { useReadingTypography } from "../../state/uiStore";
import { CommentaryHtml } from "./CommentaryPanel";
import { ReadFromHereButton } from "./CommentaryReadAloud";
import { buildCommentaryReading, entryOfPiece, isReadingClick, onScreenStart, pieceIndexAt } from "./commentarySpeech";
import { ReadAloudButton } from "../tts/ReadAloudButton";
import { EmptyState, LoadingState } from "../../components/ui/EmptyState";
import { cx, selectSmClass } from "../../components/ui/classes";
import { CommentarySourceOptions } from "./CommentarySourceOptions";

const navItemClass = "block rounded-md px-2 py-1 text-sm hover:bg-hover";

export function CommentaryStandaloneView() {
  const [params] = usePaneParams("commentary-book");
  const { sourceId, bookId, sectionId } = params;
  const navigate = usePaneNavigate();
  const typography = useReadingTypography(0.95);

  const { data: books } = useBooks();
  const { data: sources } = useCommentarySources();
  const source = sources?.find((s) => s.id === sourceId);
  const book = books?.find((b) => b.id === bookId);

  const { data: toc } = useQuery({
    queryKey: ["commentaryToc", sourceId, bookId],
    queryFn: () => api.getCommentaryToc(sourceId as number, bookId as number),
    enabled: sourceId != null && bookId != null,
  });

  const activeSectionId = sectionId ?? toc?.[0]?.id ?? null;
  const { data: entries } = useQuery({
    queryKey: ["commentarySectionEntries", activeSectionId],
    queryFn: () => api.getSectionEntries(activeSectionId as number),
    enabled: activeSectionId != null,
  });

  function jumpToRef(bookOsisCode: string, chapter: number, verse: number, e?: React.MouseEvent) {
    const target = books?.find((b) => b.osis_code === bookOsisCode);
    if (target) openPassage({ bookId: target.id, chapter, verse }, { target: e ? targetFor(e) : "focused" });
  }

  const sectionIdx = toc?.findIndex((s) => s.id === activeSectionId) ?? -1;
  const prevSection = sectionIdx > 0 ? toc?.[sectionIdx - 1] : null;
  const nextSection = toc && sectionIdx >= 0 && sectionIdx < toc.length - 1 ? toc[sectionIdx + 1] : null;

  const paneId = usePane().id;
  const ttsHere = useTtsReadingHere(paneId, "commentary");
  const ttsCurrentSegmentId = useTtsStore((s) => (ttsHere ? (s.segments[s.currentSegmentIndex]?.id ?? null) : null));
  const readingEntryId = entryOfPiece(ttsCurrentSegmentId);
  const sectionTitle = toc?.find((s) => s.id === activeSectionId)?.title;
  const ttsTitle = commentaryBookTitle(source?.title ?? "Commentary", book?.name ?? "", sectionTitle);
  const scrollerRef = useRef<HTMLDivElement>(null);

  // The section as the voice reads it, a paragraph at a time and each cut into
  // sentence-sized pieces. Read as a book, the place worth naming is the
  // chapter and the paragraph in it ("Ch. 4 ¶2"); a section on no chapter --
  // a preface -- numbers its paragraphs alone.
  const reading = useMemo(() => buildCommentaryReading(entries ?? [], (e) => (e.chapter != null ? `Ch. ${e.chapter}` : null)), [entries]);

  // A click on a paragraph while this pane is reading moves the voice there,
  // as a click on a verse does in the Bible.
  function readFromClick(e: React.MouseEvent, entryId: number) {
    if (!ttsHere || !isReadingClick(e.target, window.getSelection())) return;
    const index = pieceIndexAt(e.target, { x: e.clientX, y: e.clientY }) ?? reading.firstPiece.get(entryId);
    if (index == null) return;
    useTtsStore.getState().readFrom(ttsTitle, "commentary", reading.segments, index, { paneId });
  }

  return (
    <div className="flex h-full">
      {/* Folds away in a narrow pane as soon as there is a section to read
          beside it -- which there is from the start, the book's first. Only
          a section named in the link used to count, so opened from the
          commentary beside the Bible the contents took most of a 390 px
          pane and left the text two or three words a line. */}
      <SidePanel id="commentary-contents" label="Contents" defaultWidth={240} autoCollapse={activeSectionId != null} className="overflow-y-auto p-2">
        <select aria-label="Commentary" className={cx(selectSmClass, "mb-3 w-full")} value={sourceId ?? ""} onChange={(e) => navigate(`/commentary/${e.target.value}`)}>
          <CommentarySourceOptions sources={sources} />
        </select>
        <div className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-ink-3">Books</div>
        <ul className="mb-4 space-y-0.5">
          {books
            ?.filter((b) => source?.covered_book_ids.includes(b.id))
            .map((b) => (
              <li key={b.id}>
                <Link to={`/commentary/${sourceId}/${b.id}`} className={cx(navItemClass, b.id === bookId ? "bg-accent-soft font-medium text-accent" : "text-ink-2")}>
                  {b.name}
                </Link>
              </li>
            ))}
        </ul>
        {book && toc && (
          <>
            <div className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-ink-3">{book.name}</div>
            <ul className="space-y-0.5">
              {toc.map((s) => (
                <li key={s.id}>
                  <Link
                    to={`/commentary/${sourceId}/${bookId}/${s.id}`}
                    className={cx(navItemClass, s.id === activeSectionId ? "bg-accent-soft font-medium text-accent" : "text-ink-2")}
                  >
                    {s.title ?? (s.chapter ? `Chapter ${s.chapter}` : "Section")}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </SidePanel>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Read aloud stays in reach above the text rather than scrolling
          away with the book's heading: it starts from the first paragraph
          on screen (onScreenStart), which is only any help if it can be
          pressed from wherever the reader has got to. */}
        {book && (
          <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line bg-surface px-2">
            <span className="min-w-0 flex-1 truncate text-xs text-ink-3" title={sectionTitle ?? undefined}>
              {sectionTitle ?? book.name}
            </span>
            <ReadAloudButton
              title={ttsTitle}
              sourceKind="commentary"
              segments={reading.segments}
              onStart={
                reading.segments.length > 0
                  ? () => useTtsStore.getState().start(ttsTitle, "commentary", reading.segments, { paneId, startIndex: onScreenStart(scrollerRef.current, reading, entries ?? []) })
                  : undefined
              }
            />
          </div>
        )}
        <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
          {!source && <EmptyState icon={MessageSquareText} title="Choose a commentary" description="Pick one from the list on the left." />}
          {source && !book && <EmptyState icon={MessageSquareText} title={`Choose a book to read ${source.title}`} description="Pick a book from the contents on the left." />}
          {book && (
            <div className="mx-auto w-full max-w-[70ch]">
              <div className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-ink-3">{source?.title}</div>
              <h1 className="reading-font mb-1 text-2xl font-semibold text-ink">{book.name}</h1>
              <h2 className="mb-5 text-sm text-ink-3">{sectionTitle}</h2>
              {!entries && <LoadingState />}
              <div className="reading-font commentary-html space-y-3 text-ink" style={typography}>
                {entries?.map((e, i) => {
                  const firstPiece = reading.firstPiece.get(e.id);
                  const spoken = readingEntryId === e.id ? reading.pieces.get(e.id) : undefined;
                  return (
                    <div key={e.id} data-entry-index={i} className="group relative" onClick={(ev) => readFromClick(ev, e.id)}>
                      {/* In the margin, on hover: start here, playing or not. */}
                      {firstPiece != null && (
                        <ReadFromHereButton
                          title={ttsTitle}
                          segments={reading.segments}
                          index={firstPiece}
                          className="absolute -left-8 top-0 opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
                        />
                      )}
                      <CommentaryHtml
                        html={e.html}
                        onJumpToRef={jumpToRef}
                        speaking={spoken && firstPiece != null ? { entryId: e.id, pieces: spoken, first: firstPiece } : undefined}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="mt-8 flex justify-between gap-4 border-t border-line pt-4 text-sm">
                {prevSection ? (
                  <Link to={`/commentary/${sourceId}/${bookId}/${prevSection.id}`} className="inline-flex items-center gap-1 text-accent hover:underline">
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" /> {prevSection.title ?? "Previous"}
                  </Link>
                ) : (
                  <span />
                )}
                {nextSection && (
                  <Link to={`/commentary/${sourceId}/${bookId}/${nextSection.id}`} className="inline-flex items-center gap-1 text-accent hover:underline">
                    {nextSection.title ?? "Next"} <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The player's title for a commentary read as a book: the commentary, then
 * the section -- which usually names the book already ("Romans 8"), and then
 * the book is not said twice ("...: Romans — Romans 8").
 */
export function commentaryBookTitle(source: string, book: string, section: string | null | undefined): string {
  if (!section) return `${source}: ${book}`;
  if (book && section.toLowerCase().startsWith(book.toLowerCase())) return `${source}: ${section}`;
  return `${source}: ${book} — ${section}`;
}
