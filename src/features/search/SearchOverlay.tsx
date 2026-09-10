import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import {
  useTranslations,
  useCommentarySources,
  useBooks,
  useWestminsterDocuments,
  useRecentSearches,
  useSavedSearches,
  useSetSearchSaved,
  useDeleteSearchHistory,
} from "../../api/queries";

type Tab = "verses" | "commentary" | "notes" | "resources" | "westminster";

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
  const [scopeBookId, setScopeBookId] = useState<number | "">("");
  const [scopeTestament, setScopeTestament] = useState<"" | "OT" | "NT">("");
  const { data: translations } = useTranslations();
  const { data: sources } = useCommentarySources();
  const { data: books } = useBooks();
  const { data: westminsterDocs } = useWestminsterDocuments();
  const { data: recentSearches } = useRecentSearches();
  const { data: savedSearches } = useSavedSearches();
  const setSearchSaved = useSetSearchSaved();
  const deleteSearchHistory = useDeleteSearchHistory();
  const navigate = useNavigate();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  const translationIds = useMemo(() => translations?.map((t) => t.id) ?? [], [translations]);
  const sourceIds = useMemo(() => sources?.map((s) => s.id) ?? [], [sources]);
  const active = debounced.trim().length > 1;
  const scope = useMemo(
    () => ({
      bookId: scopeBookId === "" ? undefined : scopeBookId,
      testament: scopeTestament === "" ? undefined : scopeTestament,
    }),
    [scopeBookId, scopeTestament],
  );
  const isSaved = savedSearches?.includes(debounced.trim()) ?? false;

  const { data: results, isFetching, isError, error } = useQuery({
    queryKey: ["search", debounced, translationIds, sourceIds, scope],
    queryFn: () => api.search(debounced, translationIds, sourceIds, scope, 50),
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

  function runQuery(q: string) {
    setQuery(q);
    setDebounced(q);
    if (q.trim().length > 1) api.recordSearchQuery(q.trim());
  }

  const isFetching_ = isFetching || resourcesFetching || westminsterFetching;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-20" onClick={onClose}>
      <div
        className="flex max-h-[70vh] w-full max-w-2xl flex-col rounded-lg bg-white shadow-xl dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-gray-200 p-3 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") onClose();
                if (e.key === "Enter" && query.trim().length > 1) api.recordSearchQuery(query.trim());
              }}
              placeholder='Search… "phrase", word1 OR word2, -exclude'
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-950"
            />
            {active && (
              <button
                onClick={() => setSearchSaved.mutate({ query: debounced.trim(), saved: !isSaved })}
                title={isSaved ? "Unsave this search" : "Save this search"}
                className={`shrink-0 rounded border px-2 py-1.5 text-xs ${isSaved ? "border-amber-300 bg-amber-50 text-amber-600 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400" : "border-gray-300 text-gray-500 dark:border-gray-700"}`}
              >
                {isSaved ? "★ Saved" : "☆ Save"}
              </button>
            )}
          </div>
          {!active && ((recentSearches && recentSearches.length > 0) || (savedSearches && savedSearches.length > 0)) && (
            <div className="mt-2 space-y-1.5 text-xs">
              {savedSearches && savedSearches.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-gray-400">Saved:</span>
                  {savedSearches.map((q) => (
                    <button
                      key={q}
                      onClick={() => runQuery(q)}
                      className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-amber-700 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}
              {recentSearches && recentSearches.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-gray-400">Recent:</span>
                  {recentSearches.map((q) => (
                    <span key={q} className="group inline-flex items-center rounded-full border border-gray-300 dark:border-gray-700">
                      <button onClick={() => runQuery(q)} className="rounded-l-full px-2 py-0.5 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800">
                        {q}
                      </button>
                      <button
                        onClick={() => deleteSearchHistory.mutate(q)}
                        title="Remove"
                        aria-label={`Remove "${q}" from recent searches`}
                        className="rounded-r-full px-1.5 py-0.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <button
              onClick={() => setTab("verses")}
              className={`rounded px-2 py-1 ${tab === "verses" ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" : "text-gray-500"}`}
            >
              Scripture ({results?.verses.length ?? 0})
            </button>
            {tab === "verses" && (
              <>
                <select
                  value={scopeTestament}
                  onChange={(e) => setScopeTestament(e.target.value as "" | "OT" | "NT")}
                  className="rounded border border-gray-300 bg-white px-1.5 py-1 text-xs dark:border-gray-700 dark:bg-gray-900"
                >
                  <option value="">Whole Bible</option>
                  <option value="OT">Old Testament</option>
                  <option value="NT">New Testament</option>
                </select>
                <select
                  value={scopeBookId}
                  onChange={(e) => setScopeBookId(e.target.value === "" ? "" : Number(e.target.value))}
                  className="rounded border border-gray-300 bg-white px-1.5 py-1 text-xs dark:border-gray-700 dark:bg-gray-900"
                >
                  <option value="">Any book</option>
                  {books?.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </>
            )}
            <button
              onClick={() => setTab("commentary")}
              className={`rounded px-2 py-1 ${tab === "commentary" ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" : "text-gray-500"}`}
            >
              Commentary ({results?.commentary.length ?? 0})
            </button>
            <button
              onClick={() => setTab("notes")}
              className={`rounded px-2 py-1 ${tab === "notes" ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" : "text-gray-500"}`}
            >
              Notes ({results?.notes.length ?? 0})
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
          {isError && (tab === "verses" || tab === "commentary" || tab === "notes") && (
            <p className="p-3 text-sm text-red-500">
              Search failed: {error instanceof Error ? error.message : "unknown error"}
            </p>
          )}
          {(tab === "verses" || tab === "commentary" || tab === "notes") && (
            <>
              {(tab === "verses" ? results?.verses : tab === "commentary" ? results?.commentary : results?.notes)
                ?.length === 0 && active && !isFetching && <p className="p-3 text-sm text-gray-400">No results.</p>}
              {(tab === "verses" ? results?.verses : tab === "commentary" ? results?.commentary : results?.notes)?.map((r, i) => (
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
