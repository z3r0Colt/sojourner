import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Star, X } from "lucide-react";
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
import { openContent } from "../../workspace/openContent";
import { Modal } from "../../components/ui/Modal";
import { Tabs } from "../../components/ui/Tabs";
import { Button } from "../../components/ui/Button";
import { Kbd } from "../../components/ui/Page";
import { LoadingState } from "../../components/ui/EmptyState";
import { cx, inputClass, selectSmClass } from "../../components/ui/classes";
import { htmlToText } from "../sermons/excerpt";

type Tab = "verses" | "commentary" | "notes" | "prayer" | "resources" | "westminster" | "encyclopedia" | "sermons" | "illustrations";

interface Row {
  key: string;
  heading: string;
  snippet: string;
  run: () => void;
}

function Snippet({ html }: { html: string }) {
  return <div className="text-sm text-ink" dangerouslySetInnerHTML={{ __html: html.replace(/\[/g, "<mark class='rounded bg-accent-soft px-0.5 text-accent'>").replace(/\]/g, "</mark>") }} />;
}

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
  const [selected, setSelected] = useState(0);
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
  // Twenty-six megabytes of encyclopedia: the largest body of prose the app
  // carries, and until now the only one global search could not reach.
  const { data: encyclopediaResults, isFetching: encyclopediaFetching } = useQuery({
    queryKey: ["encyclopediaSearchOverlay", debounced],
    queryFn: () => api.searchIsbeGlobal(debounced, 50),
    enabled: active,
  });
  // A preacher looks for his own work the same way he looks for a verse.
  const { data: sermonResults, isFetching: sermonsFetching } = useQuery({
    queryKey: ["sermonSearch", debounced],
    queryFn: () => api.searchSermons(debounced, 30),
    enabled: active,
  });
  const { data: illustrationResults, isFetching: illustrationsFetching } = useQuery({
    queryKey: ["illustrationSearch", debounced],
    queryFn: () => api.listIllustrations({ query: debounced }),
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

  const anyFetching =
    isFetching || resourcesFetching || westminsterFetching || encyclopediaFetching || sermonsFetching || illustrationsFetching;

  const rows = useMemo<Row[]>(() => {
    if (!active) return [];
    if (tab === "resources") {
      return (resourceResults ?? []).map((r) => ({
        key: `r-${r.resource_id}`,
        heading: r.title,
        snippet: r.snippet,
        run: () => {
          openContent("resource", { id: r.resource_id });
          onClose();
        },
      }));
    }
    if (tab === "westminster") {
      return (westminsterResults ?? []).map((r) => ({
        key: `w-${r.section_id}`,
        heading: `${r.heading}${r.prompt ? ` · ${r.prompt}` : ""}`,
        snippet: r.snippet,
        run: () => {
          const code = westminsterDocs?.find((d) => d.id === r.document_id)?.code ?? String(r.document_id);
          openContent("westminster", { docCode: code, sectionId: r.section_id });
          onClose();
        },
      }));
    }
    if (tab === "encyclopedia") {
      return (encyclopediaResults ?? []).map((r) => ({
        key: `e-${r.id}`,
        heading: r.term,
        snippet: r.snippet,
        run: () => {
          openContent("encyclopedia", { slug: r.slug });
          onClose();
        },
      }));
    }
    if (tab === "sermons") {
      return (sermonResults ?? []).map((sermon) => ({
        key: `s-${sermon.id}`,
        heading: [sermon.title, sermon.preach_date ?? "", sermon.series_title ?? ""].filter(Boolean).join(" · "),
        snippet: sermon.big_idea ?? htmlToText(sermon.body).slice(0, 160),
        run: () => {
          openContent("sermon", { id: sermon.id });
          onClose();
        },
      }));
    }
    if (tab === "illustrations") {
      return (illustrationResults ?? []).map((illustration) => ({
        key: `i-${illustration.id}`,
        heading: [illustration.title, illustration.source_label ?? ""].filter(Boolean).join(" · "),
        snippet: htmlToText(illustration.body).slice(0, 160),
        run: () => {
          openContent("illustrations", {});
          onClose();
        },
      }));
    }
    const list = tab === "verses" ? results?.verses : tab === "commentary" ? results?.commentary : tab === "notes" ? results?.notes : results?.prayers;
    return (list ?? []).map((r, i) => ({
      key: `${tab}-${i}`,
      heading: `${r.book_id != null ? `${bookName(r.book_id)} ${r.chapter}${r.verse ? `:${r.verse}` : ""} · ` : ""}${r.source_label}`,
      snippet: r.snippet,
      run: () => {
        if (r.book_id != null) {
          onJumpToVerse(r.book_id, r.chapter ?? 1, r.verse);
        } else if (tab === "prayer") {
          openContent("prayer", {});
          onClose();
        }
      },
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, tab, results, resourceResults, westminsterResults, westminsterDocs, encyclopediaResults, sermonResults, illustrationResults, books]);

  useEffect(() => setSelected(0), [tab, debounced]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((i) => Math.min(rows.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      if (query.trim().length > 1) api.recordSearchQuery(query.trim());
      rows[selected]?.run();
    }
  }

  const count = (n: number | undefined) => (active && n != null ? n : undefined);
  const tabs = [
    { key: "verses" as const, label: "Scripture", count: count(results?.verses.length) },
    { key: "commentary" as const, label: "Commentary", count: count(results?.commentary.length) },
    { key: "notes" as const, label: "Notes", count: count(results?.notes.length) },
    { key: "prayer" as const, label: "Prayer", count: count(results?.prayers.length) },
    { key: "resources" as const, label: "Resources", count: count(resourceResults?.length) },
    { key: "westminster" as const, label: "Confessions", count: count(westminsterResults?.length) },
    { key: "encyclopedia" as const, label: "Encyclopedia", count: count(encyclopediaResults?.length) },
    { key: "sermons" as const, label: "Sermons", count: count(sermonResults?.length) },
    { key: "illustrations" as const, label: "Illustrations", count: count(illustrationResults?.length) },
  ];

  return (
    <Modal onClose={onClose} align="top" size="lg" bodyClassName="flex min-h-0 flex-col">
      <div className="border-b border-line p-3">
        <div className="flex items-center gap-2">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder='Search… use "quotes" for a phrase, OR for either word, -word to exclude'
            aria-label="Search"
            className={cx(inputClass, "w-full py-2 text-base")}
          />
          {active && (
            <Button
              size="sm"
              variant={isSaved ? "secondary" : "ghost"}
              icon={Star}
              active={isSaved}
              onClick={() => setSearchSaved.mutate({ query: debounced.trim(), saved: !isSaved })}
              title={isSaved ? "Remove from saved searches" : "Save this search"}
            >
              {isSaved ? "Saved" : "Save"}
            </Button>
          )}
        </div>
        {!active && ((recentSearches && recentSearches.length > 0) || (savedSearches && savedSearches.length > 0)) && (
          <div className="mt-2 space-y-1.5 text-xs">
            {savedSearches && savedSearches.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-ink-3">Saved</span>
                {savedSearches.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => runQuery(q)}
                    className="rounded-full border border-accent/30 bg-accent-soft px-2.5 py-0.5 text-accent hover:bg-accent-soft-2"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
            {recentSearches && recentSearches.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-ink-3">Recent</span>
                {recentSearches.map((q) => (
                  <span key={q} className="inline-flex items-center rounded-full border border-line-2">
                    <button type="button" onClick={() => runQuery(q)} className="rounded-l-full px-2.5 py-0.5 text-ink-2 hover:bg-hover">
                      {q}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteSearchHistory.mutate(q)}
                      aria-label={`Remove "${q}" from recent searches`}
                      className="rounded-r-full px-1.5 py-0.5 text-ink-4 hover:bg-hover hover:text-ink"
                    >
                      <X className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 border-b border-line px-3">
        <Tabs size="sm" bare className="min-w-0 flex-1 overflow-x-auto" items={tabs} value={tab} onChange={setTab} />
        {anyFetching && <LoadingState className="shrink-0 py-1" label="Searching…" />}
      </div>
      {tab === "verses" && (
        <div className="flex items-center gap-2 border-b border-line px-3 py-1.5 text-xs text-ink-3">
          <span>Limit to</span>
          <select value={scopeTestament} onChange={(e) => setScopeTestament(e.target.value as "" | "OT" | "NT")} className={selectSmClass} aria-label="Testament">
            <option value="">Whole Bible</option>
            <option value="OT">Old Testament</option>
            <option value="NT">New Testament</option>
          </select>
          <select
            value={scopeBookId}
            onChange={(e) => setScopeBookId(e.target.value === "" ? "" : Number(e.target.value))}
            className={selectSmClass}
            aria-label="Book"
          >
            <option value="">Any book</option>
            {books?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {isError && tab !== "resources" && tab !== "westminster" && tab !== "encyclopedia" && tab !== "sermons" && tab !== "illustrations" && (
          <p className="p-3 text-sm text-danger">Search failed: {error instanceof Error ? error.message : "unknown error"}</p>
        )}
        {!active && <p className="p-3 text-sm text-ink-3">Type at least two characters to search.</p>}
        {active && rows.length === 0 && !anyFetching && <p className="p-3 text-sm text-ink-3">No results in this section.</p>}
        <ul role="listbox">
          {rows.map((r, i) => (
            <li key={r.key} role="option" aria-selected={i === selected}>
              <button
                type="button"
                onMouseEnter={() => setSelected(i)}
                onClick={r.run}
                className={cx("block w-full rounded-md p-2 text-left", i === selected ? "bg-accent-soft" : "hover:bg-hover")}
              >
                <div className="mb-0.5 text-xs font-medium text-ink-3">{r.heading}</div>
                <Snippet html={r.snippet} />
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex items-center gap-2 border-t border-line px-3 py-1.5 text-xs text-ink-3">
        <Kbd>↑↓</Kbd> choose <Kbd>Enter</Kbd> open <Kbd>Esc</Kbd> close
      </div>
    </Modal>
  );
}
