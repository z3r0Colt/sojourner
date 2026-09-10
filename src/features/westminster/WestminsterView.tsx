import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import {
  useWestminsterDocuments,
  useWestminsterSections,
  useWestminsterSection,
  useBooks,
  useWestminsterCommentarySources,
  useWestminsterCommentary,
} from "../../api/queries";
import { useNavigationStore } from "../../state/navigationStore";
import type { WestminsterProofRef } from "../../api/types";

// WCF section headings are formatted "Chapter N, M" by the confession importer.
function parseChapterHeading(heading: string): { chapter: number; section: number } | null {
  const m = heading.match(/^Chapter (\d+),\s*(\d+)$/);
  return m ? { chapter: Number(m[1]), section: Number(m[2]) } : null;
}

// WLC/WSC section headings are formatted "Question N" by the same importer.
// There's no sub-section number to a catechism question, so `section` is a
// value no real commentary entry will ever match (Vincent's are all
// section-less) -- it only exists so this can share CommentaryPanel's props
// with the WCF chapter/section case.
function parseQuestionHeading(heading: string): { chapter: number; section: number } | null {
  const m = heading.match(/^Question (\d+)$/);
  return m ? { chapter: Number(m[1]), section: -1 } : null;
}

export function WestminsterView() {
  const { docCode, sectionId: sectionIdParam } = useParams();
  const navigate = useNavigate();
  const goTo = useNavigationStore((s) => s.goTo);
  const { data: documents } = useWestminsterDocuments();
  const { data: books } = useBooks();
  const doc = documents?.find((d) => d.code === docCode) ?? documents?.[0];
  const { data: sections } = useWestminsterSections(doc?.id ?? null);
  const sectionId = sectionIdParam ? Number(sectionIdParam) : sections?.[0]?.id ?? null;
  const { data: section } = useWestminsterSection(sectionId);

  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);
  const { data: searchResults } = useQuery({
    queryKey: ["westminsterSearch", debounced],
    queryFn: () => api.searchWestminster(debounced, 100),
    enabled: debounced.trim().length > 1,
  });

  function bookName(id: number) {
    return books?.find((b) => b.id === id)?.name ?? `#${id}`;
  }

  const proofsByMarker = useMemo(() => {
    const map = new Map<number, WestminsterProofRef[]>();
    if (!section) return map;
    for (const p of section.proofs) {
      const arr = map.get(p.marker) ?? [];
      arr.push(p);
      map.set(p.marker, arr);
    }
    return map;
  }, [section]);

  const idx = sections?.findIndex((s) => s.id === sectionId) ?? -1;
  const prev = idx > 0 ? sections?.[idx - 1] : null;
  const next = sections && idx >= 0 && idx < sections.length - 1 ? sections[idx + 1] : null;

  const chapterRef =
    section && doc?.code === "wcf"
      ? parseChapterHeading(section.heading)
      : section && (doc?.code === "wsc" || doc?.code === "wlc")
        ? parseQuestionHeading(section.heading)
        : null;
  const { data: allCommentarySources } = useWestminsterCommentarySources();
  const commentarySources = useMemo(
    () => allCommentarySources?.filter((s) => s.document_code === doc?.code) ?? [],
    [allCommentarySources, doc?.code],
  );
  const [commentarySourceId, setCommentarySourceId] = useState<number | null>(null);
  useEffect(() => {
    // Reset to the new document's first source (or none) whenever the
    // available sources change -- otherwise switching from WCF to WSC would
    // keep Hodge selected while showing Vincent's questions underneath it.
    setCommentarySourceId(commentarySources.length > 0 ? commentarySources[0].id : null);
  }, [commentarySources]);

  function renderBody(text: string) {
    const parts = text.split(/(\[\d+\])/g);
    return parts.map((part, i) => {
      const m = part.match(/^\[(\d+)\]$/);
      if (!m) return <span key={i}>{part}</span>;
      const marker = Number(m[1]);
      const refs = proofsByMarker.get(marker);
      const first = refs?.[0];
      return (
        <sup key={i}>
          <button
            className="text-blue-600 hover:underline dark:text-blue-400"
            title={refs?.map((r) => `${bookName(r.book_id)} ${r.chapter}:${r.verse_start}`).join("; ")}
            onClick={() => {
              if (first) {
                goTo({ bookId: first.book_id, chapter: first.chapter, verse: first.verse_start });
                navigate("/");
              }
            }}
          >
            [{marker}]
          </button>
        </sup>
      );
    });
  }

  return (
    <div className="flex h-full">
      <aside className="flex w-72 shrink-0 flex-col border-r border-gray-200 dark:border-gray-800">
        <div className="border-b border-gray-200 p-3 dark:border-gray-800">
          <select
            className="mb-2 w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-900"
            value={doc?.code ?? ""}
            onChange={(e) => navigate(`/westminster/${e.target.value}`)}
          >
            {documents?.map((d) => (
              <option key={d.id} value={d.code}>
                {d.title}
              </option>
            ))}
          </select>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search all three documents…"
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-950"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {debounced.trim().length > 1
            ? searchResults?.map((r) => (
                <button
                  key={r.section_id}
                  onClick={() => {
                    const targetDoc = documents?.find((d) => d.id === r.document_id);
                    if (targetDoc) navigate(`/westminster/${targetDoc.code}/${r.section_id}`);
                  }}
                  className="block w-full border-b border-gray-100 px-3 py-2 text-left text-sm hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800"
                >
                  <div className="font-medium">{r.heading}</div>
                  {r.prompt && <div className="text-xs text-gray-500">{r.prompt}</div>}
                  <div
                    className="text-xs text-gray-400"
                    dangerouslySetInnerHTML={{ __html: r.snippet.replace(/\[/g, "<b>").replace(/\]/g, "</b>") }}
                  />
                </button>
              ))
            : sections?.map((s) => (
                <Link
                  key={s.id}
                  to={`/westminster/${doc?.code}/${s.id}`}
                  className={`block border-b border-gray-100 px-3 py-2 text-sm hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800 ${
                    s.id === sectionId ? "bg-blue-50 font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300" : ""
                  }`}
                >
                  {s.heading}
                </Link>
              ))}
        </div>
      </aside>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        {!section && <p className="text-gray-400">Select a section.</p>}
        {section && (
          <div className="max-w-2xl">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">{doc?.title}</div>
            <h1 className="mb-3 text-xl font-semibold">{section.heading}</h1>
            {section.prompt && <p className="mb-3 text-base font-medium italic">{section.prompt}</p>}
            <div className="reading-font mb-6 text-[15px] leading-relaxed">{renderBody(section.body_with_proofs)}</div>

            {section.proofs.length > 0 && (
              <div className="mb-6 border-t border-gray-200 pt-3 text-sm text-gray-500 dark:border-gray-800">
                <h3 className="mb-1 text-xs font-semibold uppercase text-gray-400">Scripture Proofs</h3>
                <ul className="space-y-0.5">
                  {Array.from(proofsByMarker.entries()).map(([marker, refs]) => (
                    <li key={marker}>
                      <span className="mr-1 font-mono text-xs">[{marker}]</span>
                      {refs.map((r, i) => (
                        <button
                          key={i}
                          className="mr-2 text-blue-600 hover:underline dark:text-blue-400"
                          onClick={() => {
                            goTo({ bookId: r.book_id, chapter: r.chapter, verse: r.verse_start });
                            navigate("/");
                          }}
                        >
                          {bookName(r.book_id)} {r.chapter}:{r.verse_start}
                          {r.verse_end !== r.verse_start ? `-${r.verse_end}` : ""}
                        </button>
                      ))}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {chapterRef && commentarySources && commentarySources.length > 0 && (
              <CommentaryPanel
                chapter={chapterRef.chapter}
                currentSection={chapterRef.section}
                sources={commentarySources}
                sourceId={commentarySourceId}
                onSourceChange={setCommentarySourceId}
              />
            )}

            <div className="flex justify-between text-sm">
              {prev ? (
                <Link to={`/westminster/${doc?.code}/${prev.id}`} className="text-blue-600 hover:underline dark:text-blue-400">
                  ← {prev.heading}
                </Link>
              ) : (
                <span />
              )}
              {next && (
                <Link to={`/westminster/${doc?.code}/${next.id}`} className="text-blue-600 hover:underline dark:text-blue-400">
                  {next.heading} →
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CommentaryPanel({
  chapter,
  currentSection,
  sources,
  sourceId,
  onSourceChange,
}: {
  chapter: number;
  currentSection: number;
  sources: { id: number; code: string; title: string; author: string | null }[];
  sourceId: number | null;
  onSourceChange: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const { data: entries } = useWestminsterCommentary(open ? sourceId : null, chapter);
  const source = sources.find((s) => s.id === sourceId);

  return (
    <div className="mb-6 border-t border-gray-200 pt-3 dark:border-gray-800">
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-xs font-semibold uppercase tracking-wide text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          {open ? "▾" : "▸"} Commentary on Chapter {chapter}
        </button>
        <select
          value={sourceId ?? ""}
          onChange={(e) => {
            onSourceChange(Number(e.target.value));
            setOpen(true);
          }}
          className="rounded border border-gray-300 bg-white px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-900"
        >
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.author ?? s.title}
            </option>
          ))}
        </select>
      </div>

      {open && (
        <div className="reading-font mt-3 space-y-4 text-[15px] leading-relaxed text-gray-700 dark:text-gray-300">
          {!entries && <p className="text-sm text-gray-400">Loading…</p>}
          {entries?.length === 0 && <p className="text-sm text-gray-400">No commentary on this chapter.</p>}
          {entries?.map((e) => (
            <div
              key={e.id}
              className={e.section === currentSection ? "-mx-3 rounded bg-amber-50 px-3 py-2 dark:bg-amber-950/30" : ""}
            >
              {e.section != null && (
                <div className="mb-1 text-xs font-semibold text-gray-400">Section {e.section}</div>
              )}
              {e.body.split(/\n\s*\n/).map((para, i) => (
                <p key={i} className="mb-3 whitespace-pre-line">
                  {para}
                </p>
              ))}
            </div>
          ))}
          {source && (
            <p className="border-t border-gray-100 pt-2 text-xs text-gray-400 dark:border-gray-800">
              {source.title}
              {source.author ? ` — ${source.author}` : ""}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
