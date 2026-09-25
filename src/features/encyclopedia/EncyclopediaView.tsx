import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { BookMarked, CornerDownRight, List, Search } from "lucide-react";
import { api } from "../../api/client";
import { useBooks, useDictionaryEntryForIsbe, useIsbeEntry, useIsbeIndex } from "../../api/queries";
import { usePane, usePaneNavigate, usePaneParams } from "../../workspace/PaneContext";
import { SidePanel } from "../../components/ui/SidePanel";
import { openContent, openPassage, targetFor } from "../../workspace/openContent";
import { useReadingTypography } from "../../state/uiStore";
import { CommentaryHtml } from "../commentary/CommentaryPanel";
import { EmptyState, LoadingState } from "../../components/ui/EmptyState";
import { cx, inputSmClass } from "../../components/ui/classes";
import { StudyActions } from "../sermons/StudyActions";
import { encyclopediaRef } from "../sermons/sourceIdentity";
import { firstParagraph, htmlToText, selectionWithin } from "../sermons/excerpt";

/** "I.", "PART II.", "3.", "(4)" -- how these articles number their sections
 *  when the source gives them no heading markup. The groups say which level:
 *  roman, then arabic, then parenthesised. */
const OUTLINE_NUMBER = /^(?:(?:PART\s+)?([IVXLC]{1,6})\.|(\d{1,2})\.|\((\d{1,2})\))\s+\S/;

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
  const articleRef = useRef<HTMLDivElement>(null);
  const { width } = usePane();
  // ISBE's longer articles carry a full outline -- Abraham has six sections
  // and twenty-one subsections, and "Jesus Christ" runs to a third of a
  // megabyte. Rendering that as one unbroken column with no way to move
  // about it is the difference between a reference work and a wall of text.
  const [outline, setOutline] = useState<{ id: string; text: string; level: number }[]>([]);
  const [openOutline, setOpenOutline] = useState(false);

  // Built from the rendered article rather than the stored HTML: the ids
  // have to exist on the real nodes for the links to reach them, and this
  // is the same post-render pass the commentary reader already makes.
  useEffect(() => {
    const root = articleRef.current;
    if (!root) {
      setOutline([]);
      return;
    }
    const nodes = [...root.querySelectorAll("h2, h3, p")];
    const found: { id: string; text: string; level: number }[] = [];

    nodes.forEach((node, index) => {
      const text = node.textContent?.trim();
      if (!text) return;

      let level: number;
      if (node.tagName === "H2") level = 2;
      else if (node.tagName === "H3") level = 3;
      else {
        // Most of the long articles carry no heading markup at all -- the
        // source sets their outline as ordinary paragraphs ("I. The Names.",
        // "1. In General:"). Two hundred of the three hundred longest are
        // like that, "Jesus Christ" among them, and without this they get no
        // contents at all: exactly the articles that need one most.
        const numbering = OUTLINE_NUMBER.exec(text);
        if (!numbering || text.length > 80) return;
        // The same lines appear twice in these articles, once in the
        // contents the source prints at the top and again over the section
        // itself. A real heading is followed by prose; a line in a contents
        // list is followed by more short lines. That is what tells them
        // apart -- and it matters, because the reader should land on the
        // section, not back at the list.
        const introducesProse = nodes
          .slice(index + 1, index + 3)
          .some((next) => (next.textContent?.trim().length ?? 0) >= 200);
        if (!introducesProse) return;
        level = numbering[1] ? 2 : numbering[2] ? 3 : 4;
      }

      const id = `isbe-s${index}`;
      node.id = id;
      found.push({ id, text, level });
    });

    setOutline(found);
    setOpenOutline(false);
  }, [entry?.slug, entry?.body]);

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

  // Wide enough for the contents to sit beside the article rather than
  // above it: the article column is 70ch, and the pane also holds a 320px index.
  const wideEnough = width >= 1120;
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
      <SidePanel id="encyclopedia-index" label="Encyclopedia index" defaultWidth={320} autoCollapse={!!slug} className="flex flex-col">
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
      </SidePanel>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        {!entry && (
          <EmptyState
            icon={BookMarked}
            title="Bible encyclopedia"
            description="The International Standard Bible Encyclopedia (1915): 9,349 articles on the people, places, books, and doctrines of Scripture. Browse by letter or search on the left. References inside an article are clickable."
          />
        )}
        {entry && (
          <div className={cx("mx-auto w-full", wideEnough && outline.length >= 3 ? "flex max-w-[96ch] items-start gap-8" : "max-w-[70ch]")}>
            <div className="min-w-0 flex-1">
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

            {outline.length >= 3 && !wideEnough && (
              <nav className="mb-6" aria-label="Contents">
                <button
                  type="button"
                  onClick={() => setOpenOutline((v) => !v)}
                  aria-expanded={openOutline}
                  className={cx(
                    "flex w-full items-center gap-1.5 rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-ink-3",
                  )}
                >
                  <List className="h-3.5 w-3.5" aria-hidden="true" />
                  Contents
                  <span className="ml-auto font-normal normal-case tracking-normal text-ink-4">
                    {openOutline ? "hide" : `${outline.length} sections`}
                  </span>
                </button>
                {openOutline && (
                  <ol className="mt-1 max-h-[60vh] overflow-y-auto rounded-md border border-line bg-surface py-1">
                    {outline.map((h) => (
                      <li key={h.id}>
                        <button
                          type="button"
                          onClick={() => document.getElementById(h.id)?.scrollIntoView({ block: "start", behavior: "smooth" })}
                          className={cx(
                            "block w-full truncate px-2.5 py-1 text-left text-xs text-ink-2 hover:bg-hover hover:text-accent",
                            h.level === 3 && "pl-5 text-ink-3",
                            h.level === 4 && "pl-8 text-ink-3",
                          )}
                          title={h.text}
                        >
                          {h.text}
                        </button>
                      </li>
                    ))}
                  </ol>
                )}
              </nav>
            )}
            <div
              ref={bodyRef}
              className="reading-font isbe-html text-ink"
              style={typography}
              onClick={handleArticleLink}
              onAuxClick={(e) => e.button === 1 && handleArticleLink(e)}
            >
              <div ref={articleRef}>
                <CommentaryHtml html={entry.body} onJumpToRef={jumpToRef} />
              </div>
            </div>

            <p className="mt-10 border-t border-line pt-3 text-xs text-ink-4">
              International Standard Bible Encyclopedia (1915), James Orr, general editor. Public domain.
            </p>
            </div>

            {/* Wide enough for the contents to stand beside the article. Its
                own column rather than a float, so it never comes to rest on
                top of the text it is meant to guide you through. */}
            {wideEnough && outline.length >= 3 && (
              <aside className="sticky top-0 w-56 shrink-0">
                <nav aria-label="Contents">
                  <p className="flex items-center gap-1.5 rounded-t-md border border-line bg-surface-2 px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-ink-3">
                    <List className="h-3.5 w-3.5" aria-hidden="true" />
                    Contents
                    <span className="ml-auto font-normal normal-case tracking-normal text-ink-4">{outline.length}</span>
                  </p>
                  <ol className="max-h-[calc(100vh-9rem)] overflow-y-auto rounded-b-md border border-t-0 border-line bg-surface py-1">
                    {outline.map((h) => (
                      <li key={h.id}>
                        <button
                          type="button"
                          onClick={() => document.getElementById(h.id)?.scrollIntoView({ block: "start", behavior: "smooth" })}
                          className={cx(
                            "block w-full truncate px-2.5 py-1 text-left text-xs text-ink-2 hover:bg-hover hover:text-accent",
                            h.level === 3 && "pl-5 text-ink-3",
                            h.level === 4 && "pl-8 text-ink-3",
                          )}
                          title={h.text}
                        >
                          {h.text}
                        </button>
                      </li>
                    ))}
                  </ol>
                </nav>
              </aside>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
