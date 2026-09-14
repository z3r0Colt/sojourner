import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { BookMarked, CornerDownRight, Search } from "lucide-react";
import { api } from "../../api/client";
import { useBooks, useDictionaryEntryForIsbe, useIsbeEntry, useIsbeIndex } from "../../api/queries";
import { usePaneNavigate, usePaneParams } from "../../workspace/PaneContext";
import { openContent, openPassage, targetFor } from "../../workspace/openContent";
import { useReadingTypography } from "../../state/uiStore";
import { CommentaryHtml } from "../commentary/CommentaryPanel";
import { EmptyState, LoadingState } from "../../components/ui/EmptyState";
import { cx, inputSmClass } from "../../components/ui/classes";
import { StudyActions } from "../sermons/StudyActions";
import { encyclopediaRef } from "../sermons/sourceIdentity";
import { firstParagraph, htmlToText, selectionWithin } from "../sermons/excerpt";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

/**
 * The International Standard Bible Encyclopedia (1915).
 *
 * Built like the Dictionary pane, and deliberately separate from it: these
 * are articles rather than definitions -- the median is a paragraph but the
 * ninetieth percentile runs five thousand characters, and "Jesus Christ" is
 * a small book. The two panes link to each other wherever they cover the
 * same subject, so neither is a dead end.
 */
export function EncyclopediaView() {
  const [{ slug: paneSlug }] = usePaneParams("encyclopedia");
  const slug = paneSlug ?? undefined;
  const navigate = usePaneNavigate();
  const { data: index } = useIsbeIndex();
  const { data: entry } = useIsbeEntry(slug ?? null);
  const { data: books } = useBooks();
  const typography = useReadingTypography(0.95);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [activeLetter, setActiveLetter] = useState("A");
  const bodyRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // The dictionary covers the same ground more briefly; where it has this
  // headword too, offer it rather than making the reader search twice. The
  // match goes through the article's alternate headwords, because an article
  // titled "Melchizedek; Melchisedec" is the one Easton's files under
  // "Melchizedek".
  const { data: inDictionary } = useDictionaryEntryForIsbe(slug ?? null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  const { data: searchResults, isFetching } = useQuery({
    queryKey: ["isbeSearch", debounced],
    queryFn: () => api.searchIsbe(debounced, 200),
    enabled: debounced.trim().length > 1,
  });

  const showingSearch = debounced.trim().length > 1;
  const letterEntries = useMemo(
    () => (index ?? []).filter((e) => e.term.toUpperCase().startsWith(activeLetter)),
    [index, activeLetter],
  );
  const list = showingSearch ? searchResults ?? [] : letterEntries;

  // Some letters run to nine hundred articles, so the list is virtualized
  // where the Dictionary's few hundred are not.
  const rows = useVirtualizer({
    count: list.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 37,
    overscan: 12,
  });

  // A new letter or a new search is a new list: start it at the top.
  useEffect(() => rows.scrollToOffset(0), [activeLetter, debounced]); // eslint-disable-line react-hooks/exhaustive-deps

  function jumpToRef(bookOsis: string, chapter: number, verse: number, e?: React.MouseEvent) {
    const book = books?.find((b) => b.osis_code === bookOsis);
    if (book) openPassage({ bookId: book.id, chapter, verse }, { target: e ? targetFor(e) : "focused" });
  }

  /** A cross-reference to another article, which the source tags for us. */
  function handleArticleLink(e: React.MouseEvent) {
    const link = (e.target as HTMLElement).closest<HTMLElement>("a.isbe-link");
    const target = link?.getAttribute("data-isbe");
    if (target) {
      e.preventDefault();
      navigate(`/encyclopedia/${encodeURIComponent(target)}`, e);
    }
  }

  return (
    <div className="flex h-full">
      <aside className="flex w-80 shrink-0 flex-col border-r border-line bg-surface-2/60">
        <div className="border-b border-line p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-4" aria-hidden="true" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search articles…"
              className={cx(inputSmClass, "w-full pl-7")}
            />
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
                className={cx(
                  "h-7 w-7 rounded-md text-xs font-medium",
                  activeLetter === l ? "bg-accent-soft text-accent" : "text-ink-3 hover:bg-hover hover:text-ink",
                )}
              >
                {l}
              </button>
            ))}
          </div>
        )}
        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
          {list.length === 0 && (
            <EmptyState compact title={showingSearch ? "No articles match" : `No articles under ${activeLetter}`} />
          )}
          <div style={{ position: "relative", height: rows.getTotalSize() }}>
            {rows.getVirtualItems().map((item) => {
              const e = list[item.index];
              return (
                <button
                  key={e.id}
                  ref={rows.measureElement}
                  data-index={item.index}
                  type="button"
                  onClick={(ev) => navigate(`/encyclopedia/${encodeURIComponent(e.slug)}`, ev)}
                  style={{ position: "absolute", top: 0, left: 0, right: 0, transform: `translateY(${item.start}px)` }}
                  className={cx(
                    "block w-full border-b border-line px-3 py-2 text-left text-sm hover:bg-hover",
                    slug === e.slug ? "bg-accent-soft font-medium text-accent" : "text-ink-2",
                  )}
                >
                  {e.term}
                </button>
              );
            })}
          </div>
        </div>
      </aside>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        {!entry && (
          <EmptyState
            icon={BookMarked}
            title="Bible encyclopedia"
            description="The International Standard Bible Encyclopedia (1915): 9,349 articles on the people, places, books, and doctrines of Scripture. Browse by letter or search on the left. References inside an article are clickable."
          />
        )}
        {entry && (
          <div className="mx-auto w-full max-w-[70ch]">
            <div className="mb-1 flex items-start gap-2">
              <h1 className="reading-font min-w-0 flex-1 text-3xl font-semibold text-ink">{entry.term}</h1>
              <StudyActions
                what={entry.term}
                item={() => ({
                  kind: "encyclopedia",
                  refId: encyclopediaRef(entry.slug),
                  label: `${entry.term}, ISBE`,
                  excerpt: selectionWithin(bodyRef.current) ?? firstParagraph(htmlToText(entry.body)),
                })}
              />
            </div>

            {inDictionary && (
              <button
                type="button"
                onClick={(e) => openContent("dictionary", { slug: inDictionary.slug }, { target: targetFor(e, "focused") })}
                className="mb-4 text-sm text-accent hover:underline"
              >
                Also in Easton's and Smith's →
              </button>
            )}

            {/* A stub whose whole substance is "See SOMETHING ELSE": send the
                reader on rather than leaving them on a one-line article. */}
            {entry.redirect_slug && (
              <button
                type="button"
                onClick={(e) => navigate(`/encyclopedia/${encodeURIComponent(entry.redirect_slug as string)}`, e)}
                className="mb-4 flex items-center gap-1.5 text-sm text-accent hover:underline"
              >
                <CornerDownRight className="h-3.5 w-3.5" aria-hidden="true" />
                Read the article this refers to
              </button>
            )}

            <div
              ref={bodyRef}
              className="reading-font isbe-html text-ink"
              style={typography}
              onClick={handleArticleLink}
              onAuxClick={(e) => e.button === 1 && handleArticleLink(e)}
            >
              <CommentaryHtml html={entry.body} onJumpToRef={jumpToRef} />
            </div>

            <p className="mt-10 border-t border-line pt-3 text-xs text-ink-4">
              International Standard Bible Encyclopedia (1915), James Orr, general editor. Public domain.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
