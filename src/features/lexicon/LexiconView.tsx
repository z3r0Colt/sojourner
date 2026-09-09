import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { useStrongsEntry } from "../../api/queries";
import { ConcordancePanel } from "./ConcordancePanel";

export function LexiconView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [language, setLanguage] = useState<"hebrew" | "greek" | undefined>(undefined);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  const directIdMatch = /^[hg]\s*\d+$/i.test(debounced.trim())
    ? debounced.trim().replace(/\s+/g, "").toUpperCase()
    : null;

  const { data: results, isFetching } = useQuery({
    queryKey: ["lexiconSearch", debounced, language],
    queryFn: () => api.searchStrongs(debounced, language, 100),
    enabled: debounced.trim().length > 1 && !directIdMatch,
  });

  const { data: entry } = useStrongsEntry(id ?? directIdMatch ?? null);

  return (
    <div className="flex h-full">
      <aside className="flex w-80 shrink-0 flex-col border-r border-gray-200 dark:border-gray-800">
        <div className="border-b border-gray-200 p-3 dark:border-gray-800">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search or enter a number (e.g. H1, G25)…"
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-950"
          />
          <div className="mt-2 flex gap-1 text-xs">
            {(["hebrew", "greek"] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLanguage(language === l ? undefined : l)}
                className={`rounded px-2 py-1 capitalize ${
                  language === l
                    ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                    : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                }`}
              >
                {l}
              </button>
            ))}
            {isFetching && <span className="self-center text-gray-400">searching…</span>}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {directIdMatch && (
            <button
              onClick={() => navigate(`/lexicon/${directIdMatch}`)}
              className="block w-full border-b border-gray-100 px-3 py-2 text-left text-sm hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800"
            >
              Go to {directIdMatch} →
            </button>
          )}
          {results?.map((r) => (
            <button
              key={r.id}
              onClick={() => navigate(`/lexicon/${r.id}`)}
              className={`block w-full border-b border-gray-100 px-3 py-2 text-left text-sm hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800 ${
                id === r.id ? "bg-blue-50 dark:bg-blue-950/40" : ""
              }`}
            >
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-xs text-gray-400">{r.id}</span>
                <span lang={r.language === "hebrew" ? "he" : "el"}>{r.original_word}</span>
                {r.transliteration && <span className="italic text-gray-500">{r.transliteration}</span>}
              </div>
              <div className="truncate text-xs text-gray-500">{r.definition}</div>
            </button>
          ))}
          {!results?.length && debounced.trim().length > 1 && !directIdMatch && !isFetching && (
            <p className="p-3 text-sm text-gray-400">No matches.</p>
          )}
        </div>
      </aside>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        {!entry && <p className="text-gray-400">Search the Hebrew and Greek lexicon, or select an entry.</p>}
        {entry && (
          <div className="max-w-2xl">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
              {entry.id} · {entry.language}
            </div>
            <div className="mb-2 flex items-baseline gap-3">
              <span className="text-4xl" lang={entry.language === "hebrew" ? "he" : "el"}>
                {entry.original_word}
              </span>
              {entry.transliteration && <span className="text-lg italic text-gray-500">{entry.transliteration}</span>}
            </div>
            {entry.pronunciation && (
              <div className="mb-4 text-sm text-gray-400">pronounced: {entry.pronunciation}</div>
            )}
            <p className="mb-4 text-base leading-relaxed text-gray-800 dark:text-gray-200">{entry.definition}</p>
            {entry.derivation && (
              <p className="mb-2 text-sm text-gray-600 dark:text-gray-400">
                <span className="font-semibold">Derivation:</span> {entry.derivation}
              </p>
            )}
            {entry.kjv_usage && (
              <p className="mb-2 text-sm text-gray-600 dark:text-gray-400">
                <span className="font-semibold">KJV usage:</span> {entry.kjv_usage}
              </p>
            )}
            <Link to="/" className="mt-4 inline-block text-sm text-blue-600 hover:underline dark:text-blue-400">
              ← Back to reading
            </Link>
            <ConcordancePanel strongsId={entry.id} />
          </div>
        )}
      </div>
    </div>
  );
}
