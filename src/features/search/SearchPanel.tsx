import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardCopy, CornerDownLeft, HelpCircle, ListTree, PanelRight, Rows3, Star, X } from "lucide-react";
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
import type { SearchResult } from "../../api/types";
import { openContent } from "../../workspace/openContent";
import { useUiStore } from "../../state/uiStore";
import { useReaderTranslationId } from "../../state/workspaceStore";
import { useBookLookup } from "../../hooks/useReferenceParser";
import { Tabs } from "../../components/ui/Tabs";
import { Button, IconButton } from "../../components/ui/Button";
import { Popover, PopoverItem, PopoverLabel } from "../../components/ui/Popover";
import { Kbd } from "../../components/ui/Page";
import { LoadingState } from "../../components/ui/EmptyState";
import { toast } from "../../components/ui/toast";
import { checkboxClass, cx, inputClass, selectSmClass } from "../../components/ui/classes";
import { htmlToText } from "../sermons/excerpt";
import { sendToSermon } from "../sermons/sendToSermon";
import { snippetHtml, snippetText, splitAtFirstMatch } from "../../lib/snippet";
import {
  OPERATOR_HELP,
  bareWords,
  bookToken,
  getToken,
  lastWord,
  leadingChapterScope,
  replaceLastWord,
  searchesOlderEnglish,
  setToken,
  wholeReference,
} from "./searchQuery";

export type SearchTab =
  | "all"
  | "verses"
  | "commentary"
  | "notes"
  | "prayer"
  | "resources"
  | "westminster"
  | "encyclopedia"
  | "sermons"
  | "illustrations";

/** How many results one page asks for; the last is the server's cap. */
const PAGE_SIZES = [50, 200, 500];

interface Row {
  key: string;
  heading: string;
  snippet: string;
  /** Scripture and commentary rows keep the hit, for copying and the concordance. */
  hit?: SearchResult;
  run: (e?: React.MouseEvent) => void;
}

function Snippet({ html }: { html: string }) {
  return <div className="text-sm text-ink" dangerouslySetInnerHTML={{ __html: snippetHtml(html) }} />;
}

export interface SearchPanelProps {
  query: string;
  onQueryChange: (q: string) => void;
  /** Docked in a pane: results open beside it instead of closing anything. */
  docked: boolean;
  /** Open a passage. `newPane` for Ctrl+click. */
  onOpenVerse: (bookId: number, chapter: number, verse: number | null, newPane: boolean) => void;
  /** After a non-passage result opens (the overlay closes). */
  onOpened?: () => void;
  /** Overlay only: move this search into a docked pane. */
  onDock?: () => void;
  autoFocus?: boolean;
}

/**
 * The search, wherever it is shown: the Ctrl+K overlay, or a pane docked
 * beside the reading. Everything a search asks is in the words of the box
 * (`in:`, `t:`), so the dropdowns and facet clicks write into it, and a
 * saved search is its text.
 */
export function SearchPanel({ query, onQueryChange, docked, onOpenVerse, onOpened, onDock, autoFocus }: SearchPanelProps) {
  const setQuery = onQueryChange;
  const [debounced, setDebounced] = useState(query);
  const [tab, setTab] = useState<SearchTab>("verses");
  const [selected, setSelected] = useState(0);
  const [limit, setLimit] = useState(PAGE_SIZES[0]);
  const [typing, setTyping] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchTranslation = useUiStore((s) => s.searchTranslation);
  const setSearchTranslation = useUiStore((s) => s.setSearchTranslation);
  const searchCommentarySource = useUiStore((s) => s.searchCommentarySource);
  const setSearchCommentarySource = useUiStore((s) => s.setSearchCommentarySource);
  const wholeWords = useUiStore((s) => s.searchWholeWords);
  const setWholeWords = useUiStore((s) => s.setSearchWholeWords);
  const passageOrder = useUiStore((s) => s.searchPassageOrder);
  const setPassageOrder = useUiStore((s) => s.setSearchPassageOrder);
  const olderSpellingsPref = useUiStore((s) => s.searchOlderSpellings);
  const setOlderSpellings = useUiStore((s) => s.setSearchOlderSpellings);
  const concordance = useUiStore((s) => s.searchConcordance);
  const setConcordance = useUiStore((s) => s.setSearchConcordance);
  const showFacets = useUiStore((s) => s.searchShowFacets);
  const setShowFacets = useUiStore((s) => s.setSearchShowFacets);
  const readerTranslationId = useReaderTranslationId();
  const { data: translations } = useTranslations();
  const { data: sources } = useCommentarySources();
  const { data: books } = useBooks();
  const lookup = useBookLookup();
  const { data: westminsterDocs } = useWestminsterDocuments();
  const { data: recentSearches } = useRecentSearches();
  const { data: savedSearches } = useSavedSearches();
  const setSearchSaved = useSetSearchSaved();
  const deleteSearchHistory = useDeleteSearchHistory();

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(query);
      setTyping(false);
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  // "Romans 8 love" searches Romans 8 for love; a bare "Jn 3:16" offers a
  // Go-to row instead of a search for the digits.
  const chapterScope = useMemo(() => leadingChapterScope(debounced, lookup), [debounced, lookup]);
  const effective = chapterScope?.query ?? debounced;
  const reference = useMemo(() => wholeReference(query, lookup), [query, lookup]);

  // The reader's own translation is the one to search unless they say
  // otherwise -- searching every installed translation at once returned the
  // same verse six times over. `t:` in the box overrides the dropdown.
  const readerTranslation = translations?.find((t) => t.id === readerTranslationId);
  const translationIds = useMemo(() => {
    const all = translations?.map((t) => t.id) ?? [];
    if (searchTranslation === "all") return all;
    const wanted = searchTranslation === "reader" ? readerTranslationId : searchTranslation;
    return wanted != null && all.includes(wanted) ? [wanted] : all;
  }, [translations, searchTranslation, readerTranslationId]);
  const typedCodes = getToken(effective, "t")?.toUpperCase().split(",").filter(Boolean) ?? null;
  const searchedIds = typedCodes ? (translations ?? []).filter((t) => typedCodes.includes(t.code.toUpperCase())).map((t) => t.id) : translationIds;
  const olderSpellings = olderSpellingsPref && searchesOlderEnglish(translations, searchedIds);
  const sourceIds = useMemo(() => {
    const all = sources?.map((s) => s.id) ?? [];
    if (searchCommentarySource === "all") return all;
    return all.includes(searchCommentarySource) ? [searchCommentarySource] : all;
  }, [sources, searchCommentarySource]);
  const active = effective.trim().length > 1;
  const scope = useMemo(() => ({ wholeWords, passageOrder, olderSpellings }), [wholeWords, passageOrder, olderSpellings]);
  const isSaved = savedSearches?.includes(debounced.trim()) ?? false;

  const { data: results, isFetching, error } = useQuery({
    queryKey: ["search", effective, translationIds, sourceIds, scope, limit],
    queryFn: () => api.search(effective, translationIds, sourceIds, scope, limit),
    enabled: active && translationIds.length > 0,
    // Keep the shorter page on screen while the longer one loads, so "Show
    // more" extends the list instead of blanking it.
    placeholderData: (previous) => previous,
  });
  useEffect(() => setLimit(PAGE_SIZES[0]), [effective, translationIds, sourceIds, scope]);
  const { data: resourceResults, isFetching: resourcesFetching, error: resourcesError } = useQuery({
    queryKey: ["resourceSearch", effective],
    queryFn: () => api.searchResources(effective, 50),
    enabled: active,
  });
  const { data: westminsterResults, isFetching: westminsterFetching, error: westminsterError } = useQuery({
    queryKey: ["westminsterSearchOverlay", effective],
    queryFn: () => api.searchWestminster(effective, 50),
    enabled: active,
  });
  const { data: encyclopediaResults, isFetching: encyclopediaFetching, error: encyclopediaError } = useQuery({
    queryKey: ["encyclopediaSearchOverlay", effective],
    queryFn: () => api.searchIsbeGlobal(effective, 50),
    enabled: active,
  });
  const { data: sermonResults, isFetching: sermonsFetching, error: sermonsError } = useQuery({
    queryKey: ["sermonSearch", effective],
    queryFn: () => api.searchSermons(effective, 30),
    enabled: active,
  });
  const { data: illustrationResults, isFetching: illustrationsFetching, error: illustrationsError } = useQuery({
    queryKey: ["illustrationSearch", effective],
    queryFn: () => api.listIllustrations({ query: effective }),
    enabled: active,
  });
  const facetKind = tab === "commentary" ? "commentary" : "verses";
  const { data: facets } = useQuery({
    queryKey: ["searchFacets", facetKind, effective, translationIds, sourceIds, scope],
    queryFn: () => api.searchFacets(effective, facetKind, translationIds, sourceIds, scope),
    enabled: active && showFacets && (tab === "verses" || tab === "commentary"),
    staleTime: 5 * 60_000,
  });
  // Suggestions for the word being typed, from the translations' own words.
  const typedWord = lastWord(query);
  const { data: suggestions } = useQuery({
    queryKey: ["suggestSearchWords", typedWord?.toLowerCase()],
    queryFn: () => api.suggestSearchWords(typedWord!, 6),
    enabled: typing && typedWord != null && typedWord.length >= 2,
    staleTime: Infinity,
  });
  // Nothing in Scripture: the nearest words the translations do use.
  const noVerses = active && !isFetching && results != null && results.verse_total === 0 && !results.verse_error;
  const missWords = noVerses ? bareWords(effective).slice(0, 3) : [];
  const { data: didYouMean } = useQuery({
    queryKey: ["didYouMean", missWords],
    queryFn: async () => {
      const out: [string, string][] = [];
      for (const w of missWords) {
        const near = await api.didYouMean(w);
        if (near[0]) out.push([w, near[0]]);
      }
      return out;
    },
    enabled: missWords.length > 0,
    staleTime: Infinity,
  });

  function bookName(id: number) {
    return books?.find((b) => b.id === id)?.name ?? `#${id}`;
  }
  function translationCode(id: number | null) {
    return translations?.find((t) => t.id === id)?.code ?? "";
  }

  function runQuery(q: string) {
    setQuery(q);
    setDebounced(q);
    if (q.trim().length > 1) api.recordSearchQuery(q.trim());
    inputRef.current?.focus();
  }

  const anyFetching =
    isFetching || resourcesFetching || westminsterFetching || encyclopediaFetching || sermonsFetching || illustrationsFetching;

  const opened = () => {
    if (!docked) onOpened?.();
  };

  function rowsFor(t: Exclude<SearchTab, "all">): Row[] {
    if (!active) return [];
    if (t === "resources") {
      return (resourceResults ?? []).map((r) => ({
        key: `r-${r.resource_id}`,
        heading: r.title,
        snippet: r.snippet,
        run: () => {
          openContent("resource", { id: r.resource_id }, docked ? { target: "new" } : {});
          opened();
        },
      }));
    }
    if (t === "westminster") {
      return (westminsterResults ?? []).map((r) => ({
        key: `w-${r.section_id}`,
        heading: `${r.heading}${r.prompt ? ` · ${r.prompt}` : ""}`,
        snippet: r.snippet,
        run: () => {
          const code = westminsterDocs?.find((d) => d.id === r.document_id)?.code ?? String(r.document_id);
          openContent("westminster", { docCode: code, sectionId: r.section_id }, docked ? { target: "new" } : {});
          opened();
        },
      }));
    }
    if (t === "encyclopedia") {
      return (encyclopediaResults ?? []).map((r) => ({
        key: `e-${r.id}`,
        heading: r.term,
        snippet: r.snippet,
        run: () => {
          openContent("encyclopedia", { slug: r.slug }, docked ? { target: "new" } : {});
          opened();
        },
      }));
    }
    if (t === "sermons") {
      return (sermonResults ?? []).map((sermon) => ({
        key: `s-${sermon.id}`,
        heading: [sermon.title, sermon.preach_date ?? "", sermon.series_title ?? ""].filter(Boolean).join(" · "),
        snippet: sermon.big_idea ?? htmlToText(sermon.body).slice(0, 160),
        run: () => {
          openContent("sermon", { id: sermon.id }, docked ? { target: "new" } : {});
          opened();
        },
      }));
    }
    if (t === "illustrations") {
      return (illustrationResults ?? []).map((illustration) => ({
        key: `i-${illustration.id}`,
        heading: [illustration.title, illustration.source_label ?? ""].filter(Boolean).join(" · "),
        snippet: htmlToText(illustration.body).slice(0, 160),
        run: () => {
          openContent("illustrations", {}, docked ? { target: "new" } : {});
          opened();
        },
      }));
    }
    const list = t === "verses" ? results?.verses : t === "commentary" ? results?.commentary : t === "notes" ? results?.notes : results?.prayers;
    return (list ?? []).map((r, i) => ({
      key: `${t}-${r.entry_id}-${i}`,
      heading: `${r.book_id != null ? `${bookName(r.book_id)} ${r.chapter}${r.verse ? `:${r.verse}` : ""} · ` : ""}${r.source_label}`,
      snippet: r.snippet,
      hit: r,
      run: (e) => {
        if (r.book_id != null) {
          onOpenVerse(r.book_id, r.chapter ?? 1, r.verse, !!e && (e.ctrlKey || e.metaKey));
        } else if (t === "prayer") {
          openContent("prayer", {}, docked ? { target: "new" } : {});
          opened();
        }
      },
    }));
  }

  // The All tab: Scripture first and weighted heaviest, then the rest a few
  // each, so one list answers "where does this come up at all?".
  const ALL_SHARE: [Exclude<SearchTab, "all">, number, string][] = [
    ["verses", 8, "Scripture"],
    ["commentary", 4, "Commentary"],
    ["westminster", 3, "Confessions"],
    ["encyclopedia", 3, "Encyclopedia"],
    ["resources", 3, "Books"],
    ["notes", 3, "Notes"],
    ["sermons", 2, "Sermons"],
    ["prayer", 2, "Prayer"],
    ["illustrations", 2, "Illustrations"],
  ];

  const rows = useMemo<Row[]>(() => {
    if (tab !== "all") return rowsFor(tab);
    return ALL_SHARE.flatMap(([t, n, label]) =>
      rowsFor(t)
        .slice(0, n)
        .map((r) => ({ ...r, key: `all-${r.key}`, heading: `${label} · ${r.heading}` })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, tab, results, resourceResults, westminsterResults, westminsterDocs, encyclopediaResults, sermonResults, illustrationResults, books, docked]);

  // The Go-to row sits above the results and is chosen first.
  const goTo: Row | null = reference
    ? {
        key: "goto",
        heading: "Go to",
        snippet: `${reference.book.name} ${reference.chapter}${reference.verse ? `:${reference.verse}${reference.verseEnd ? `-${reference.verseEnd}` : ""}` : ""}`,
        run: (e) => onOpenVerse(reference.book.id, reference.chapter, reference.verse ?? null, !!e && (e.ctrlKey || e.metaKey)),
      }
    : null;
  const allRows = goTo ? [goTo, ...rows] : rows;

  useEffect(() => setSelected(0), [tab, effective, !!reference]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((i) => Math.min(allRows.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      if (query.trim().length > 1) api.recordSearchQuery(query.trim());
      allRows[selected]?.run();
    } else if (e.key === "Tab" && suggestions && suggestions.length > 0 && typing && !e.shiftKey) {
      e.preventDefault();
      setQuery(replaceLastWord(query, suggestions[0][0]));
    }
  }

  const tabError: Record<SearchTab, unknown> = {
    all: null,
    verses: error ?? (results?.verse_error ? new Error(results.verse_error) : null),
    commentary: error,
    notes: error,
    prayer: error,
    resources: resourcesError,
    westminster: westminsterError,
    encyclopedia: encyclopediaError,
    sermons: sermonsError,
    illustrations: illustrationsError,
  };
  const activeError = tabError[tab];

  const count = (n: number | undefined) => (active && n != null ? n : undefined);
  const total = tab === "verses" ? results?.verse_total : tab === "commentary" ? results?.commentary_total : undefined;
  const nextPageSize = PAGE_SIZES.find((n) => n > limit);
  const canShowMore = total != null && total > rows.length && nextPageSize != null;
  const showsFilters = tab === "verses" || tab === "commentary" || tab === "notes" || tab === "prayer" || tab === "all";
  const showsScope = tab === "verses" || tab === "commentary" || tab === "all";
  const tabs = [
    { key: "all" as const, label: "All" },
    { key: "verses" as const, label: "Scripture", count: count(results?.verse_total) },
    { key: "commentary" as const, label: "Commentary", count: count(results?.commentary_total) },
    { key: "notes" as const, label: "Notes", count: count(results?.notes.length) },
    { key: "prayer" as const, label: "Prayer", count: count(results?.prayers.length) },
    { key: "resources" as const, label: "Books", count: count(resourceResults?.length) },
    { key: "westminster" as const, label: "Confessions", count: count(westminsterResults?.length) },
    { key: "encyclopedia" as const, label: "Encyclopedia", count: count(encyclopediaResults?.length) },
    { key: "sermons" as const, label: "Sermons", count: count(sermonResults?.length) },
    { key: "illustrations" as const, label: "Illustrations", count: count(illustrationResults?.length) },
  ];

  // The scope dropdowns read and write `in:` in the box.
  const inToken = getToken(query, "in");
  const testamentValue = inToken?.toLowerCase() === "ot" ? "OT" : inToken?.toLowerCase() === "nt" ? "NT" : "";
  const scopeBook = books?.find((b) => inToken != null && bookToken(b).toLowerCase() === inToken.toLowerCase());
  const customScope = inToken != null && !testamentValue && !scopeBook;

  // The parsed-as chip: what the search understood, including the chapter
  // read off the front of the box.
  const chips = results?.parsed.chips ?? [];
  const unknown = results?.parsed.unknown ?? [];

  const hits = rows.map((r) => r.hit).filter((h): h is SearchResult => !!h && h.book_id != null);
  const refOf = (h: SearchResult) => `${bookName(h.book_id!)} ${h.chapter}${h.verse ? `:${h.verse}` : ""}`;

  function copyResults(withText: boolean) {
    const lines = hits.map((h) =>
      withText ? `${refOf(h)} ${h.kind === "verse" ? translationCode(h.source_id) : h.source_label}\n${snippetText(h.snippet)}` : refOf(h),
    );
    navigator.clipboard
      .writeText(lines.join(withText ? "\n\n" : "\n"))
      .then(() => toast.success(`Copied ${hits.length} ${withText ? "results" : "references"}`))
      .catch(() => toast.error("Could not copy to the clipboard"));
  }

  function sendAllToSermon() {
    const verses = hits.filter((h) => h.kind === "verse" && h.verse != null);
    if (verses.length === 0) return;
    sendToSermon({
      kind: "passage",
      refId: null,
      label: `Search: ${effective.trim()}`,
      excerpt: null,
      passages: verses.map((h) => ({ book_id: h.book_id!, chapter: h.chapter!, verse_start: h.verse!, verse_end: h.verse! })),
    });
  }

  const facetRows = facets
    ? {
        books: facets.by_book.map(([id, n]) => ({ id, n, label: bookName(id) })),
        sources: facets.by_source.map(([id, n]) => ({
          id,
          n,
          label: tab === "commentary" ? sources?.find((s) => s.id === id)?.title ?? `#${id}` : translationCode(id),
        })),
      }
    : null;

  function narrowToBook(id: number) {
    const b = books?.find((x) => x.id === id);
    if (b) runQuery(setToken(effective, "in", bookToken(b)));
  }
  function narrowToSource(id: number) {
    if (tab === "commentary") {
      setSearchCommentarySource(id);
    } else {
      const code = translationCode(id);
      if (code) runQuery(setToken(effective, "t", code.toLowerCase()));
    }
  }

  const concordanceView = tab === "verses" && concordance;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-line p-3">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            autoFocus={autoFocus}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setTyping(true);
            }}
            onKeyDown={onKeyDown}
            placeholder='Search… "a phrase", OR, -word, in:psalms, +LORD — ? for more'
            aria-label="Search"
            className={cx(inputClass, "w-full py-2 text-base")}
          />
          <Popover
            width="w-[26rem]"
            trigger={({ toggle, open }) => <IconButton icon={HelpCircle} label="Search operators" active={open} onClick={toggle} />}
          >
            {(close) => (
              <div className="max-h-[60vh] overflow-y-auto p-1">
                <PopoverLabel>Search operators — click one to try it</PopoverLabel>
                {OPERATOR_HELP.map((h) => (
                  <PopoverItem
                    key={h.syntax}
                    onClick={() => {
                      runQuery(h.example);
                      close();
                    }}
                  >
                    <span className="flex w-full items-baseline gap-2">
                      <code className="shrink-0 font-mono text-xs text-accent">{h.syntax}</code>
                      <span className="text-xs text-ink-3">{h.means}</span>
                    </span>
                  </PopoverItem>
                ))}
              </div>
            )}
          </Popover>
          {active && (
            <Button
              size="sm"
              variant={isSaved ? "secondary" : "ghost"}
              icon={Star}
              active={isSaved}
              onClick={() => {
                // A saved search carries the translation it was made in, so
                // it reruns the same wherever the reader is reading.
                let q = debounced.trim();
                if (!isSaved && getToken(q, "t") == null && typeof searchTranslation === "number") {
                  const code = translationCode(searchTranslation);
                  if (code) q = setToken(q, "t", code.toLowerCase());
                }
                setSearchSaved.mutate({ query: q, saved: !isSaved });
              }}
              title={isSaved ? "Remove from saved searches" : "Save this search"}
            >
              {isSaved ? "Saved" : "Save"}
            </Button>
          )}
          {onDock && (
            <IconButton icon={PanelRight} label="Dock beside the reading" title="Dock as a pane beside the reading" onClick={onDock} />
          )}
        </div>
        {typing && suggestions && suggestions.length > 0 && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1 text-xs" aria-label="Word suggestions">
            {suggestions.map(([w, n]) => (
              <button
                key={w}
                type="button"
                onClick={() => {
                  setQuery(replaceLastWord(query, w));
                  inputRef.current?.focus();
                }}
                className="rounded-full border border-line-2 px-2 py-0.5 text-ink-2 hover:bg-hover"
              >
                {w} <span className="text-ink-4">{n.toLocaleString()}</span>
              </button>
            ))}
            <span className="text-ink-4">
              <Kbd>Tab</Kbd> takes the first
            </span>
          </div>
        )}
        {active && (chips.length > 0 || chapterScope || unknown.length > 0) && (
          <p className="mt-1.5 text-xs text-ink-3" aria-live="polite">
            <span className="text-ink-4">Searching for </span>
            {chips.join(" · ")}
            {chapterScope && !chips.some((c) => c.startsWith("in ")) ? ` · in ${chapterScope.label}` : ""}
            {unknown.length > 0 && <span className="text-danger"> · not understood: {unknown.join(", ")}</span>}
          </p>
        )}
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
      {/* Ten tabs will not fit one row of the box; they wrap onto a second
          rather than scroll, so every tab is always in view. */}
      <div className="flex items-start gap-2 border-b border-line px-3">
        <Tabs size="sm" bare className="min-w-0 flex-1 flex-wrap" items={tabs} value={tab} onChange={setTab} />
        {anyFetching && <LoadingState className="shrink-0 py-1" label="Searching…" />}
      </div>
      {showsFilters && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-line px-3 py-1.5 text-xs text-ink-3">
          {(tab === "verses" || tab === "all") && (
            <select
              value={String(searchTranslation)}
              onChange={(e) => {
                const v = e.target.value;
                setSearchTranslation(v === "all" || v === "reader" ? v : Number(v));
              }}
              className={selectSmClass}
              aria-label="Translation"
              disabled={typedCodes != null}
              title={typedCodes != null ? "The t: in the box chooses the translation" : undefined}
            >
              {readerTranslation && <option value="reader">Current translation ({readerTranslation.code})</option>}
              <option value="all">All translations</option>
              {translations?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.code} · {t.name}
                </option>
              ))}
            </select>
          )}
          {tab === "commentary" && (
            <select
              value={String(searchCommentarySource)}
              onChange={(e) => setSearchCommentarySource(e.target.value === "all" ? "all" : Number(e.target.value))}
              className={selectSmClass}
              aria-label="Commentary"
            >
              <option value="all">All commentaries</option>
              {sources?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          )}
          {showsScope && (
            <>
              <span>in</span>
              <select
                value={customScope ? "custom" : testamentValue}
                onChange={(e) => {
                  const v = e.target.value;
                  runQuery(setToken(query, "in", v === "" ? null : v.toLowerCase()));
                }}
                className={selectSmClass}
                aria-label="Testament"
              >
                <option value="">Whole Bible</option>
                <option value="OT">Old Testament</option>
                <option value="NT">New Testament</option>
                {customScope && <option value="custom">in:{inToken}</option>}
              </select>
              <select
                value={scopeBook?.id ?? ""}
                onChange={(e) => {
                  const b = books?.find((x) => x.id === Number(e.target.value));
                  runQuery(setToken(query, "in", b ? bookToken(b) : null));
                }}
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
              <select
                value={passageOrder ? "passage" : "relevance"}
                onChange={(e) => setPassageOrder(e.target.value === "passage")}
                className={selectSmClass}
                aria-label="Sort order"
              >
                <option value="relevance">Best match first</option>
                <option value="passage">Bible order</option>
              </select>
            </>
          )}
          <label className="inline-flex items-center gap-1.5">
            <input type="checkbox" checked={wholeWords} onChange={(e) => setWholeWords(e.target.checked)} className={checkboxClass} />
            Whole words
          </label>
          {searchesOlderEnglish(translations, searchedIds) && (
            <label className="inline-flex items-center gap-1.5" title="Also match shew for show, hath for has, and the -eth and -est endings">
              <input type="checkbox" checked={olderSpellingsPref} onChange={(e) => setOlderSpellings(e.target.checked)} className={checkboxClass} />
              Older spellings
            </label>
          )}
          <span className="flex-1" />
          {(tab === "verses" || tab === "commentary") && (
            <IconButton
              icon={ListTree}
              size="sm"
              label={showFacets ? "Hide counts by book" : "Show counts by book"}
              active={showFacets}
              onClick={() => setShowFacets(!showFacets)}
            />
          )}
          {tab === "verses" && (
            <IconButton
              icon={Rows3}
              size="sm"
              label={concordance ? "Show as a list" : "Show as a concordance"}
              active={concordance}
              onClick={() => setConcordance(!concordance)}
            />
          )}
          {hits.length > 0 && (
            <Popover width="w-60" trigger={({ toggle, open }) => <IconButton icon={ClipboardCopy} size="sm" label="Copy or send results" active={open} onClick={toggle} />}>
              {(close) => (
                <>
                  <PopoverItem
                    onClick={() => {
                      copyResults(false);
                      close();
                    }}
                  >
                    Copy as a reference list
                  </PopoverItem>
                  <PopoverItem
                    onClick={() => {
                      copyResults(true);
                      close();
                    }}
                  >
                    Copy with text
                  </PopoverItem>
                  {tab === "verses" && (
                    <PopoverItem
                      onClick={() => {
                        sendAllToSermon();
                        close();
                      }}
                    >
                      Send all to the sermon
                    </PopoverItem>
                  )}
                </>
              )}
            </Popover>
          )}
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        {showFacets && facetRows && (tab === "verses" || tab === "commentary") && active && (
          <aside className="hidden w-40 shrink-0 overflow-y-auto border-r border-line p-2 text-xs sm:block" aria-label="Counts by book">
            {facetRows.sources.length > 1 && (
              <>
                <div className="mb-1 font-semibold uppercase tracking-wide text-ink-4">{tab === "commentary" ? "Commentary" : "Translation"}</div>
                <ul className="mb-3 space-y-0.5">
                  {facetRows.sources.map((f) => (
                    <li key={f.id}>
                      <button type="button" onClick={() => narrowToSource(f.id)} className="flex w-full justify-between gap-1 rounded px-1 py-0.5 text-left text-ink-2 hover:bg-hover">
                        <span className="truncate">{f.label}</span>
                        <span className="tabular-nums text-ink-4">{f.n}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div className="mb-1 font-semibold uppercase tracking-wide text-ink-4">Book</div>
            <ul className="space-y-0.5">
              {facetRows.books.map((f) => (
                <li key={f.id}>
                  <button type="button" onClick={() => narrowToBook(f.id)} className="flex w-full justify-between gap-1 rounded px-1 py-0.5 text-left text-ink-2 hover:bg-hover">
                    <span className="truncate">{f.label}</span>
                    <span className="tabular-nums text-ink-4">{f.n}</span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {activeError != null && (
            <p className="p-3 text-sm text-danger">Search failed: {activeError instanceof Error ? activeError.message : "unknown error"}</p>
          )}
          {!active && !goTo && <p className="p-3 text-sm text-ink-3">Type at least two characters to search, or a reference like Jn 3:16 to go there.</p>}
          {active && rows.length === 0 && !anyFetching && activeError == null && (
            <div className="p-3 text-sm text-ink-3">
              No results in this section.
              {didYouMean && didYouMean.length > 0 && (
                <span>
                  {" "}
                  Did you mean{" "}
                  {didYouMean.map(([from, to], i) => (
                    <span key={from}>
                      {i > 0 && ", "}
                      <button
                        type="button"
                        className="font-medium text-accent hover:underline"
                        onClick={() => runQuery(effective.replace(new RegExp(`\\b${from}\\b`), to))}
                      >
                        {to}
                      </button>
                    </span>
                  ))}
                  ?
                </span>
              )}
            </div>
          )}
          <ul role="listbox" aria-label="Search results" className={cx(concordanceView && "font-[inherit]")}>
            {allRows.map((r, i) =>
              concordanceView && r.hit ? (
                <li key={r.key} role="option" aria-selected={i === selected}>
                  <ConcordanceLine row={r} selected={i === selected} onHover={() => setSelected(i)} refLabel={refOf(r.hit)} />
                </li>
              ) : (
                <li key={r.key} role="option" aria-selected={i === selected}>
                  <button
                    type="button"
                    onMouseEnter={() => setSelected(i)}
                    onClick={(e) => r.run(e)}
                    className={cx("block w-full rounded-md p-2 text-left", i === selected ? "bg-accent-soft" : "hover:bg-hover")}
                  >
                    <div className="mb-0.5 flex items-center gap-1 text-xs font-medium text-ink-3">
                      {r.key === "goto" && <CornerDownLeft className="h-3 w-3" aria-hidden="true" />}
                      {r.heading}
                    </div>
                    <Snippet html={r.snippet} />
                  </button>
                </li>
              ),
            )}
          </ul>
          {active && total != null && total > rows.length && (
            <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-ink-3">
              <span>
                Showing {rows.length} of {total}
              </span>
              {canShowMore ? (
                <Button size="sm" variant="ghost" onClick={() => setLimit(nextPageSize!)} disabled={isFetching}>
                  Show more
                </Button>
              ) : (
                <span>Narrow the search to see the rest.</span>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 border-t border-line px-3 py-1.5 text-xs text-ink-3">
        <Kbd>↑↓</Kbd> choose <Kbd>Enter</Kbd> open <Kbd>Ctrl</Kbd>+click new pane {!docked && <><Kbd>Esc</Kbd> close</>}
      </div>
    </div>
  );
}

/** One hit as a concordance line: the reference, the words before the
 * match right-aligned, the match in a fixed column, the words after. */
function ConcordanceLine({ row, selected, onHover, refLabel }: { row: Row; selected: boolean; onHover: () => void; refLabel: string }) {
  const [before, match, after] = splitAtFirstMatch(row.snippet);
  const tail = (s: string, n: number) => (s.length > n ? `…${s.slice(s.length - n)}` : s);
  const head = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);
  return (
    <button
      type="button"
      onMouseEnter={onHover}
      onClick={(e) => row.run(e)}
      className={cx(
        "grid w-full grid-cols-[7.5rem_minmax(0,1fr)_auto_minmax(0,1fr)] items-baseline gap-x-2 rounded px-2 py-1 text-left text-sm",
        selected ? "bg-accent-soft" : "hover:bg-hover",
      )}
    >
      <span className="truncate text-xs text-ink-3">{refLabel}</span>
      <span className="truncate text-right text-ink-2" dir="ltr">
        {tail(before, 60)}
      </span>
      <mark className="rounded bg-accent-soft px-0.5 font-medium text-accent">{match}</mark>
      <span className="truncate text-ink-2">{head(after, 60)}</span>
    </button>
  );
}
