import { useEffect, useMemo, useState, Fragment, type ReactNode } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { useDictionaryIndex, useDictionaryEntry, useBooks } from "../../api/queries";
import { useNavigationStore } from "../../state/navigationStore";
import { buildBookLookup, scanScriptureRefs } from "../../hooks/useReferenceParser";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export function DictionaryView() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { data: index } = useDictionaryIndex();
  const { data: entry } = useDictionaryEntry(slug ?? null);
  const { data: books } = useBooks();
  const goTo = useNavigationStore((s) => s.goTo);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [activeLetter, setActiveLetter] = useState("A");
  const bookLookup = useMemo(() => buildBookLookup(books ?? []), [books]);

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

  function jumpToRef(bookId: number, chapter: number, verse?: number) {
    goTo({ bookId, chapter, verse });
    navigate("/");
  }

  function renderLinkedBody(body: string) {
    const matches = scanScriptureRefs(body, bookLookup);
    if (matches.length === 0) return body;
    const nodes: ReactNode[] = [];
    let cursor = 0;
    matches.forEach((m, i) => {
      if (m.start > cursor) nodes.push(<Fragment key={`t${i}`}>{body.slice(cursor, m.start)}</Fragment>);
      nodes.push(
        <button
          key={`r${i}`}
          onClick={() => jumpToRef(m.ref.book.id, m.ref.chapter, m.ref.verse)}
          className="text-blue-600 underline decoration-dotted hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
        >
          {m.text}
        </button>,
      );
      cursor = m.end;
    });
    if (cursor < body.length) nodes.push(<Fragment key="tail">{body.slice(cursor)}</Fragment>);
    return nodes;
  }

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
              {renderLinkedBody(entry.body)}
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
