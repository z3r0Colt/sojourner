import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { useDictionaryIndex, useDictionaryEntry } from "../../api/queries";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export function DictionaryView() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { data: index } = useDictionaryIndex();
  const { data: entry } = useDictionaryEntry(slug ?? null);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [activeLetter, setActiveLetter] = useState("A");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  const { data: searchResults, isFetching } = useQuery({
    queryKey: ["dictionarySearch", debounced],
    queryFn: () => api.searchDictionary(debounced, 100),
    enabled: debounced.trim().length > 1,
  });

  const letterEntries = useMemo(
    () => (index ?? []).filter((e) => e.term.toUpperCase().startsWith(activeLetter)),
    [index, activeLetter],
  );

  const showingSearch = debounced.trim().length > 1;
  const list = showingSearch ? searchResults ?? [] : letterEntries;

  return (
    <div className="flex h-full">
      <aside className="flex w-80 shrink-0 flex-col border-r border-gray-200 dark:border-gray-800">
        <div className="border-b border-gray-200 p-3 dark:border-gray-800">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the dictionary…"
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-950"
          />
          {isFetching && <span className="text-xs text-gray-400">searching…</span>}
        </div>
        {!showingSearch && (
          <div className="flex flex-wrap gap-1 border-b border-gray-200 p-2 dark:border-gray-800">
            {LETTERS.map((l) => (
              <button
                key={l}
                onClick={() => setActiveLetter(l)}
                className={`h-6 w-6 rounded text-xs ${
                  activeLetter === l
                    ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                    : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {list.map((e) => (
            <button
              key={e.id}
              onClick={() => navigate(`/dictionary/${e.slug}`)}
              className={`block w-full border-b border-gray-100 px-3 py-2 text-left text-sm hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800 ${
                slug === e.slug ? "bg-blue-50 dark:bg-blue-950/40" : ""
              }`}
            >
              {e.term}
            </button>
          ))}
          {list.length === 0 && <p className="p-3 text-sm text-gray-400">No entries.</p>}
        </div>
      </aside>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        {!entry && <p className="text-gray-400">Browse by letter, search, or select a term.</p>}
        {entry && (
          <div className="max-w-2xl">
            <h1 className="mb-3 text-2xl font-semibold">{entry.term}</h1>
            <div className="whitespace-pre-wrap text-base leading-relaxed text-gray-800 dark:text-gray-200">
              {entry.body}
            </div>
            <Link to="/" className="mt-6 inline-block text-sm text-blue-600 hover:underline dark:text-blue-400">
              ← Back to reading
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
