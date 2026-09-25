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
import { ReadAloudButton } from "../tts/ReadAloudButton";
import { ReadAloudWords } from "../tts/ReadAloudWords";
import { CommentaryHtml } from "./CommentaryPanel";
import { EmptyState, LoadingState } from "../../components/ui/EmptyState";
import { cx, selectSmClass } from "../../components/ui/classes";

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

  const ttsHere = useTtsReadingHere(usePane().id, "commentary");
  const ttsCurrentSegmentId = useTtsStore((s) => (ttsHere ? (s.segments[s.currentSegmentIndex]?.id ?? null) : null));
  const sectionTitle = toc?.find((s) => s.id === activeSectionId)?.title;

  return (
    <div className="flex h-full">
      <SidePanel id="commentary-contents" label="Contents" defaultWidth={240} autoCollapse={sectionId != null} className="overflow-y-auto p-2">
        <select aria-label="Commentary" className={cx(selectSmClass, "mb-3 w-full")} value={sourceId ?? ""} onChange={(e) => navigate(`/commentary/${e.target.value}`)}>
          {sources?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
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

      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        {!source && <EmptyState icon={MessageSquareText} title="Choose a commentary" />}
        {source && !book && <EmptyState icon={MessageSquareText} title={`Choose a book to read ${source.title}`} />}
        {book && (
          <div className="mx-auto w-full max-w-[70ch]">
            <div className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-ink-3">{source?.title}</div>
            <div className="mb-1 flex items-center gap-2">
              <h1 className="reading-font text-2xl font-semibold text-ink">{book.name}</h1>
              <ReadAloudButton
                title={`${source?.title ?? "Commentary"}: ${book.name}${sectionTitle ? ` — ${sectionTitle}` : ""}`}
                sourceKind="commentary"
                segments={(entries ?? []).map((e) => ({ id: e.id, text: e.plain_text }))}
              />
            </div>
            <h2 className="mb-5 text-sm text-ink-3">{sectionTitle}</h2>
            {!entries && <LoadingState />}
            <div className="reading-font commentary-html space-y-3 text-ink" style={typography}>
              {entries?.map((e) =>
                ttsHere && ttsCurrentSegmentId === e.id ? (
                  <ReadAloudWords key={e.id} text={e.plain_text} active />
                ) : (
                  <CommentaryHtml key={e.id} html={e.html} onJumpToRef={jumpToRef} />
                ),
              )}
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
  );
}
