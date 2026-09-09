import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { useTranslations, useCommentarySources, useBooks, useWestminsterDocuments } from "../../api/queries";

type Tab = "verses" | "commentary" | "resources" | "westminster";

export function SearchOverlay({
  onClose,
  onJumpToVerse,
}: {
  onClose: () => void;
  onJumpToVerse: (bookId: number, chapter: number, verse: number | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [tab, setTab] = useState<Tab>("verses");
  const { data: translations } = useTranslations();
  const { data: sources } = useCommentarySources();
  const { data: books } = useBooks();
  const { data: westminsterDocs } = useWestminsterDocuments();
  const navigate = useNavigate();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  const translationIds = useMemo(() => translations?.map((t) => t.id) ?? [], [translations]);
  const sourceIds = useMemo(() => sources?.map((s) => s.id) ?? [], [sources]);
  const active = debounced.trim().length > 1;

  const { data: results, isFetching } = useQuery({
    queryKey: ["search", debounced, translationIds, sourceIds],
    queryFn: () => api.search(debounced, translationIds, sourceIds, 50),
    enabled: active && translationIds.length > 0,
  });
  const { data: resourceResults, isFetching: resourcesFetching } = useQuery({
    queryKey: ["resourceSearch", debounced],
    queryFn: () => api.searchResources(debounced, 50),
    enabled: active,
  });
  const { data: westminsterResults, isFetching: westminsterFetching } = useQuery({
    queryKey: ["westminsterSearchOverlay", debounced],
    queryFn: () => api.searchWestminster(debounced, 50),
    enabled: active,
  });

  function bookName(id: number) {
    return books?.find((b) => b.id === id)?.name ?? `#${id}`;
  }

  const isFetching_ = isFetching || resourcesFetching || westminsterFetching;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-20" onClick={onClose}>
      <div
        className="flex max-h-[70vh] w-full max-w-2xl flex-col rounded-lg bg-white shadow-xl dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-gray-200 p-3 dark:border-gray-800">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && onClose()}
            placeholder="Search scripture, commentary, resources, Westminster Standards…"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-950"
          />
          <div className="mt-2 flex flex-wrap gap-2 text-sm">
            <button
              onClick={() => setTab("verses")}
              className={`rounded px-2 py-1 ${tab === "verses" ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" : "text-gray-500"}`}
            >
              Scripture ({results?.verses.length ?? 0})
            </button>
            <button
              onClick={() => setTab("commentary")}
              className={`rounded px-2 py-1 ${tab === "commentary" ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" : "text-gray-500"}`}
            >
              Commentary ({results?.commentary.length ?? 0})
            </button>
            <button
              onClick={() => setTab("resources")}
              className={`rounded px-2 py-1 ${tab === "resources" ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" : "text-gray-500"}`}
            >
              Resources ({resourceResults?.length ?? 0})
            </button>
            <button
              onClick={() => setTab("westminster")}
              className={`rounded px-2 py-1 ${tab === "westminster" ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" : "text-gray-500"}`}
            >
              Westminster ({westminsterResults?.length ?? 0})
            </button>
            {isFetching_ && <span className="self-center text-xs text-gray-400">searching…</span>}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {(tab === "verses" || tab === "commentary") && (
            <>
              {(tab === "verses" ? results?.verses : results?.commentary)?.length === 0 && active && !isFetching && (
                <p className="p-3 text-sm text-gray-400">No results.</p>
              )}
              {(tab === "verses" ? results?.verses : results?.commentary)?.map((r, i) => (
                <button
                  key={i}
                  onClick={() => onJumpToVerse(r.book_id, r.chapter ?? 1, r.verse)}
                  className="block w-full rounded p-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <div className="text-xs font-medium text-gray-500">
                    {bookName(r.book_id)} {r.chapter}
                    {r.verse ? `:${r.verse}` : ""} · {r.source_label}
                  </div>
                  <div
                    className="text-gray-800 dark:text-gray-200"
                    dangerouslySetInnerHTML={{ __html: r.snippet.replace(/\[/g, "<b>").replace(/\]/g, "</b>") }}
                  />
                </button>
              ))}
            </>
          )}
          {tab === "resources" && (
            <>
              {resourceResults?.length === 0 && active && !resourcesFetching && (
                <p className="p-3 text-sm text-gray-400">No results.</p>
              )}
              {resourceResults?.map((r) => (
                <button
                  key={r.resource_id}
                  onClick={() => {
                    navigate(`/resources/${r.resource_id}`);
                    onClose();
                  }}
                  className="block w-full rounded p-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <div className="text-xs font-medium text-gray-500">{r.title}</div>
                  <div
                    className="text-gray-800 dark:text-gray-200"
                    dangerouslySetInnerHTML={{ __html: r.snippet.replace(/\[/g, "<b>").replace(/\]/g, "</b>") }}
                  />
                </button>
              ))}
            </>
          )}
          {tab === "westminster" && (
            <>
              {westminsterResults?.length === 0 && active && !westminsterFetching && (
                <p className="p-3 text-sm text-gray-400">No results.</p>
              )}
              {westminsterResults?.map((r) => (
                <button
                  key={r.section_id}
                  onClick={() => {
                    const code = westminsterDocs?.find((d) => d.id === r.document_id)?.code ?? r.document_id;
                    navigate(`/westminster/${code}/${r.section_id}`);
                    onClose();
                  }}
                  className="block w-full rounded p-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <div className="text-xs font-medium text-gray-500">
                    {r.heading}
                    {r.prompt ? ` — ${r.prompt}` : ""}
                  </div>
                  <div
                    className="text-gray-800 dark:text-gray-200"
                    dangerouslySetInnerHTML={{ __html: r.snippet.replace(/\[/g, "<b>").replace(/\]/g, "</b>") }}
                  />
                </button>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
