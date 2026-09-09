import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { useBooks, useCommentarySources } from "../../api/queries";
import { useNavigationStore } from "../../state/navigationStore";
import { useTtsStore } from "../../state/ttsStore";
import { ReadAloudButton } from "../tts/ReadAloudButton";
import { ReadAloudWords } from "../tts/ReadAloudWords";
import { CommentaryHtml } from "./CommentaryPanel";

export function CommentaryStandaloneView() {
  const { sourceId: sourceIdParam, bookId: bookIdParam, sectionId: sectionIdParam } = useParams();
  const sourceId = sourceIdParam ? Number(sourceIdParam) : null;
  const bookId = bookIdParam ? Number(bookIdParam) : null;
  const sectionId = sectionIdParam ? Number(sectionIdParam) : null;
  const navigate = useNavigate();
  const goTo = useNavigationStore((s) => s.goTo);

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

  function jumpToRef(bookOsisCode: string, chapter: number, verse: number) {
    const target = books?.find((b) => b.osis_code === bookOsisCode);
    if (target) {
      goTo({ bookId: target.id, chapter, verse });
      navigate("/");
    }
  }

  const sectionIdx = toc?.findIndex((s) => s.id === activeSectionId) ?? -1;
  const prevSection = sectionIdx > 0 ? toc?.[sectionIdx - 1] : null;
  const nextSection = toc && sectionIdx >= 0 && sectionIdx < toc.length - 1 ? toc[sectionIdx + 1] : null;

  const ttsSourceKind = useTtsStore((s) => s.sourceKind);
  const ttsCurrentSegmentId = useTtsStore((s) => s.segments[s.currentSegmentIndex]?.id ?? null);
  const sectionTitle = toc?.find((s) => s.id === activeSectionId)?.title;

  return (
    <div className="flex h-full">
      <aside className="w-56 shrink-0 overflow-y-auto border-r border-gray-200 p-2 dark:border-gray-800">
        <select
          className="mb-2 w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-900"
          value={sourceId ?? ""}
          onChange={(e) => navigate(`/commentary/${e.target.value}`)}
        >
          {sources?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
        <div className="mb-2 text-xs font-semibold uppercase text-gray-400">Books</div>
        <ul className="mb-4 space-y-0.5 text-sm">
          {books
            ?.filter((b) => source?.covered_book_ids.includes(b.id))
            .map((b) => (
              <li key={b.id}>
                <Link
                  to={`/commentary/${sourceId}/${b.id}`}
                  className={`block rounded px-2 py-0.5 hover:bg-gray-100 dark:hover:bg-gray-800 ${
                    b.id === bookId ? "bg-blue-50 font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300" : ""
                  }`}
                >
                  {b.name}
                </Link>
              </li>
            ))}
        </ul>
        {book && toc && (
          <>
            <div className="mb-2 text-xs font-semibold uppercase text-gray-400">{book.name}</div>
            <ul className="space-y-0.5 text-sm">
              {toc.map((s) => (
                <li key={s.id}>
                  <Link
                    to={`/commentary/${sourceId}/${bookId}/${s.id}`}
                    className={`block rounded px-2 py-0.5 hover:bg-gray-100 dark:hover:bg-gray-800 ${
                      s.id === activeSectionId ? "bg-blue-50 font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300" : ""
                    }`}
                  >
                    {s.title ?? (s.chapter ? `Chapter ${s.chapter}` : "Section")}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </aside>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        {!source && <p className="text-gray-400">Select a commentary.</p>}
        {source && !book && <p className="text-gray-400">Select a book to browse {source.title}.</p>}
        {book && (
          <>
            <div className="mb-1 flex items-center gap-2">
              <h1 className="text-xl font-semibold">{book.name}</h1>
              <ReadAloudButton
                title={`${source?.title ?? "Commentary"}: ${book.name}${sectionTitle ? ` — ${sectionTitle}` : ""}`}
                sourceKind="commentary"
                segments={(entries ?? []).map((e) => ({ id: e.id, text: e.plain_text }))}
              />
            </div>
            <h2 className="mb-4 text-sm text-gray-500">{sectionTitle}</h2>
            <div className="reading-font commentary-html space-y-3 text-[15px] leading-relaxed">
              {entries?.map((e) =>
                ttsSourceKind === "commentary" && ttsCurrentSegmentId === e.id ? (
                  <ReadAloudWords key={e.id} text={e.plain_text} active />
                ) : (
                  <CommentaryHtml key={e.id} html={e.html} onJumpToRef={jumpToRef} />
                ),
              )}
            </div>
            <div className="mt-8 flex justify-between text-sm">
              {prevSection ? (
                <Link to={`/commentary/${sourceId}/${bookId}/${prevSection.id}`} className="text-blue-600 hover:underline dark:text-blue-400">
                  ← {prevSection.title ?? "Previous"}
                </Link>
              ) : (
                <span />
              )}
              {nextSection && (
                <Link to={`/commentary/${sourceId}/${bookId}/${nextSection.id}`} className="text-blue-600 hover:underline dark:text-blue-400">
                  {nextSection.title ?? "Next"} →
                </Link>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
