import { useEffect, useMemo, useRef, useState, Fragment, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookA, Search } from "lucide-react";
import { api } from "../../api/client";
import { useDictionaryIndex, useDictionaryEntry, useBooks } from "../../api/queries";
import { usePaneNavigate, usePaneParams } from "../../workspace/PaneContext";
import { openPassage, targetFor } from "../../workspace/openContent";
import { useReadingTypography } from "../../state/uiStore";
import { buildBookLookup, scanScriptureRefs } from "../../hooks/useReferenceParser";
import { refAttrs } from "../../lib/refAttr";
import { toPassageRef } from "../../lib/passage";
import { EmptyState, LoadingState } from "../../components/ui/EmptyState";
import { cx, inputSmClass } from "../../components/ui/classes";
import { StudyActions } from "../sermons/StudyActions";
import { dictionaryRef } from "../sermons/sourceIdentity";
import { firstParagraph, selectionWithin } from "../sermons/excerpt";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export function DictionaryView() {
  const [{ slug: paneSlug }] = usePaneParams("dictionary");
  const slug = paneSlug ?? undefined;
  const navigate = usePaneNavigate();
  const { data: index } = useDictionaryIndex();
  const { data: entry } = useDictionaryEntry(slug ?? null);
  const { data: books } = useBooks();
  const typography = useReadingTypography(0.95);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [activeLetter, setActiveLetter] = useState("A");
  // "Send to sermon" quotes the reader's selection when there is one.
  const bodyRef = useRef<HTMLDivElement>(null);
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

  const letterEntries = useMemo(() => (index ?? []).filter((e) => e.term.toUpperCase().startsWith(activeLetter)), [index, activeLetter]);

  const showingSearch = debounced.trim().length > 1;
  const list = showingSearch ? searchResults ?? [] : letterEntries;

  function jumpToRef(bookId: number, chapter: number, verse: number | undefined, e: React.MouseEvent) {
    openPassage({ bookId, chapter, verse }, { target: targetFor(e) });
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
          type="button"
          onClick={(e) => jumpToRef(m.ref.book.id, m.ref.chapter, m.ref.verse, e)}
          onAuxClick={(e) => e.button === 1 && jumpToRef(m.ref.book.id, m.ref.chapter, m.ref.verse, e)}
          className="text-accent underline decoration-dotted underline-offset-2 hover:text-accent-hover"
          {...(m.ref.verse != null ? refAttrs(toPassageRef(m.ref.book.id, m.ref.chapter, m.ref.verse, m.ref.verseEnd)) : {})}
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
      <aside className="flex w-80 shrink-0 flex-col border-r border-line bg-surface-2/60">
        <div className="border-b border-line p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-4" aria-hidden="true" />
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search people, places, topics…" className={cx(inputSmClass, "w-full pl-7")} />
          </div>
          {isFetching && <LoadingState className="pt-2" label="Searching…" />}
        </div>
        {!showingSearch && (
          <div className="flex flex-wrap gap-0.5 border-b border-line p-2">
            {LETTERS.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setActiveLetter(l)}
                aria-pressed={activeLetter === l}
                className={cx("h-7 w-7 rounded-md text-xs font-medium", activeLetter === l ? "bg-accent-soft text-accent" : "text-ink-3 hover:bg-hover hover:text-ink")}
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
              type="button"
              onClick={(ev) => navigate(`/dictionary/${e.slug}`, ev)}
              className={cx("block w-full border-b border-line px-3 py-2 text-left text-sm hover:bg-hover", slug === e.slug ? "bg-accent-soft font-medium text-accent" : "text-ink-2")}
            >
              {e.term}
            </button>
          ))}
          {list.length === 0 && <EmptyState compact title={showingSearch ? "No entries match" : `No entries under ${activeLetter}`} />}
        </div>
      </aside>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        {!entry && <EmptyState icon={BookA} title="Bible dictionary" description="Browse by letter or search on the left. Scripture references inside an entry are clickable." />}
        {entry && (
          <div className="mx-auto w-full max-w-[70ch]">
            <div className="mb-4 flex items-start gap-2">
              <h1 className="reading-font min-w-0 flex-1 text-3xl font-semibold text-ink">{entry.term}</h1>
              <StudyActions
                what={entry.term}
                item={() => ({
                  kind: "dictionary",
                  refId: dictionaryRef(entry.slug),
                  label: `${entry.term}, Bible dictionary`,
                  excerpt: selectionWithin(bodyRef.current) ?? firstParagraph(entry.body),
                })}
              />
            </div>
            <div ref={bodyRef} className="reading-font whitespace-pre-wrap text-ink" style={typography}>
              {renderLinkedBody(entry.body)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
