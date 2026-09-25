import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookA, Languages, Search } from "lucide-react";
import { api } from "../../api/client";
import { useBooks, useStrongsEntry } from "../../api/queries";
import { ConcordancePanel } from "./ConcordancePanel";
import { CommentaryHtml } from "../commentary/CommentaryPanel";
import { usePaneNavigate, usePaneParams } from "../../workspace/PaneContext";
import { SidePanel } from "../../components/ui/SidePanel";
import { openContent, openPassage, targetFor } from "../../workspace/openContent";
import { useReadingTypography } from "../../state/uiStore";
import { Button } from "../../components/ui/Button";
import { EmptyState, LoadingState } from "../../components/ui/EmptyState";
import { StudyActions } from "../sermons/StudyActions";
import { strongsRef } from "../sermons/sourceIdentity";
import { cx, inputSmClass } from "../../components/ui/classes";

export function LexiconView() {
  const [{ id: paneEntryId, query: paneQuery, source: paneSource, entryId: paneLexEntryId }, setParams] = usePaneParams("lexicon");
  const id = paneEntryId ?? undefined;
  const navigate = usePaneNavigate();
  const [query, setQuery] = useState(paneQuery ?? "");
  const [debounced, setDebounced] = useState(paneQuery ?? "");
  const [language, setLanguage] = useState<"hebrew" | "greek" | undefined>(undefined);
  const typography = useReadingTypography(0.95);

  // A search handed to the pane ("Search the lexicon for ‘word’") fills the box.
  useEffect(() => {
    if (paneQuery) setQuery(paneQuery);
  }, [paneQuery]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  const directIdMatch = /^[hg]\s*\d+$/i.test(debounced.trim()) ? debounced.trim().replace(/\s+/g, "").toUpperCase() : null;

  const { data: results, isFetching } = useQuery({
    queryKey: ["lexiconSearch", debounced, language],
    queryFn: () => api.searchStrongs(debounced, language, 100),
    enabled: debounced.trim().length > 1 && !directIdMatch,
  });

  const { data: entry } = useStrongsEntry(id ?? directIdMatch ?? null);
  // The lexicon shelf: which lexicons have this word, and the chosen one's
  // articles (a Strong's number can have several in one lexicon).
  const { data: shelf } = useQuery({
    queryKey: ["lexiconsForStrongs", entry?.id],
    queryFn: () => api.lexiconsForStrongs(entry!.id),
    enabled: !!entry,
    staleTime: Infinity,
  });
  const source = paneSource && shelf?.some(([code]) => code === paneSource) ? paneSource : null;
  const { data: articles } = useQuery({
    queryKey: ["lexiconEntries", entry?.id],
    queryFn: () => api.getLexiconEntries(entry!.id),
    enabled: !!entry && !!source,
    staleTime: Infinity,
  });
  const { data: lone } = useQuery({
    queryKey: ["lexiconEntry", paneLexEntryId],
    queryFn: () => api.getLexiconEntry(paneLexEntryId!),
    enabled: paneLexEntryId != null && !entry,
    staleTime: Infinity,
  });
  const { data: books } = useBooks();

  function jumpToRef(bookOsisCode: string, chapter: number, verse: number, e?: React.MouseEvent) {
    const target = books?.find((b) => b.osis_code === bookOsisCode);
    if (target) openPassage({ bookId: target.id, chapter, verse }, { target: e ? targetFor(e) : "focused" });
  }

  return (
    <div className="flex h-full">
      <SidePanel id="lexicon-list" label="Lexicon search" defaultWidth={320} autoCollapse={!!(paneEntryId || paneLexEntryId)} className="flex flex-col">
        <div className="border-b border-line p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-4" aria-hidden="true" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Word, meaning, or number (H1, G25)…"
              className={cx(inputSmClass, "w-full pl-7")}
            />
          </div>
          <div className="mt-2 flex items-center gap-1">
            {(["hebrew", "greek"] as const).map((l) => (
              <Button key={l} size="sm" variant="ghost" active={language === l} onClick={() => setLanguage(language === l ? undefined : l)} className="capitalize">
                {l}
              </Button>
            ))}
            {isFetching && <LoadingState className="ml-auto py-0" label="Searching…" />}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {directIdMatch && (
            <button type="button" onClick={(e) => navigate(`/lexicon/${directIdMatch}`, e)} className="block w-full border-b border-line px-3 py-2 text-left text-sm text-accent hover:bg-hover">
              Open {directIdMatch}
            </button>
          )}
          {results?.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={(e) => navigate(`/lexicon/${r.id}`, e)}
              className={cx("block w-full border-b border-line px-3 py-2 text-left text-sm hover:bg-hover", id === r.id && "bg-accent-soft")}
            >
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-xs text-ink-3">{r.id}</span>
                <span className="text-base text-ink" lang={r.language === "hebrew" ? "he" : "el"}>
                  {r.original_word}
                </span>
                {r.transliteration && <span className="italic text-ink-3">{r.transliteration}</span>}
              </div>
              <div className="truncate text-xs text-ink-3">{r.definition}</div>
            </button>
          ))}
          {!results?.length && debounced.trim().length > 1 && !directIdMatch && !isFetching && <EmptyState compact title="No matches" />}
          {debounced.trim().length <= 1 && !id && (
            <p className="p-3 text-xs text-ink-3">Search by English meaning, transliteration, or Strong's number. Or click any word in interlinear view while reading.</p>
          )}
        </div>
      </SidePanel>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        {!entry && lone && (
          <div className="mx-auto w-full max-w-[70ch]">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">{lone.source_name}</div>
            <div className="text-ink" style={typography}>
              <CommentaryHtml html={lone.html} onJumpToRef={jumpToRef} />
            </div>
          </div>
        )}
        {!entry && !lone && <EmptyState icon={Languages} title="Hebrew and Greek lexicon" description="Search on the left, or pick an entry, to see its definition, Thayer's notes, and every verse that uses it." />}
        {entry && shelf && shelf.length > 0 && (
          <div className="mx-auto mb-4 flex w-full max-w-[70ch] flex-wrap gap-1" role="tablist" aria-label="Lexicon">
            <Button size="sm" variant="ghost" role="tab" aria-selected={source == null} active={source == null} onClick={() => setParams({ source: null })}>
              Strong's
            </Button>
            {shelf.map(([code, name]) => (
              <Button key={code} size="sm" variant="ghost" role="tab" aria-selected={source === code} active={source === code} onClick={() => setParams({ source: code })}>
                {name}
              </Button>
            ))}
          </div>
        )}
        {entry && source && (
          <div className="mx-auto w-full max-w-[70ch]">
            {(articles ?? [])
              .filter((a) => a.source_code === source)
              .map((a) => (
                <article key={a.id} className="mb-6 text-ink" style={typography}>
                  <CommentaryHtml html={a.html} onJumpToRef={jumpToRef} />
                </article>
              ))}
            {!articles && <LoadingState />}
          </div>
        )}
        {entry && !source && (
          <div className="mx-auto w-full max-w-[70ch]">
            <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-3">
              <span>
                {entry.id} · {entry.language}
              </span>
              <StudyActions
                what={entry.id}
                item={() => ({
                  kind: "strongs",
                  refId: strongsRef(entry.id),
                  label: `${entry.original_word}${entry.transliteration ? ` (${entry.transliteration})` : ""}, ${entry.id}`,
                  excerpt: entry.definition ?? null,
                })}
              />
            </div>
            <div className="mb-2 flex items-baseline gap-3">
              <span className="text-4xl text-ink" lang={entry.language === "hebrew" ? "he" : "el"}>
                {entry.original_word}
              </span>
              {entry.transliteration && <span className="text-lg italic text-ink-3">{entry.transliteration}</span>}
            </div>
            {entry.pronunciation && <div className="mb-4 text-sm text-ink-3">pronounced {entry.pronunciation}</div>}
            <p className="mb-4 text-ink" style={typography}>
              {entry.definition}
            </p>
            {entry.thayers_definition && (
              <div className="mb-4 rounded-lg border-l-2 border-line-2 bg-surface-2 p-3 text-ink-2" style={typography}>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-3">Thayer's Greek-English Lexicon</div>
                <CommentaryHtml html={entry.thayers_definition} onJumpToRef={jumpToRef} />
              </div>
            )}
            {entry.derivation && (
              <p className="mb-2 text-sm text-ink-2">
                <span className="font-semibold">Derivation:</span> {entry.derivation}
              </p>
            )}
            {entry.kjv_usage && (
              <p className="mb-2 text-sm text-ink-2">
                <span className="font-semibold">KJV usage:</span> {entry.kjv_usage}
              </p>
            )}
            <Button
              className="mt-4"
              variant="secondary"
              icon={BookA}
              onClick={(e) => openContent("wordstudy", { id: entry.id }, { target: targetFor(e, "new") })}
            >
              Word study: renderings, forms, where it occurs
            </Button>
            <ConcordancePanel strongsId={entry.id} />
          </div>
        )}
      </div>
    </div>
  );
}
