import { useEffect, useMemo, useRef, useState, Fragment, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookA, Search } from "lucide-react";
import { api } from "../../api/client";
import { useDictionaryIndex, useDictionaryEntry, useIsbeEntryByTerm } from "../../api/queries";
import { usePaneNavigate, usePaneParams } from "../../workspace/PaneContext";
import { openContent, openPassage, targetFor } from "../../workspace/openContent";
import { useReadingTypography } from "../../state/uiStore";
import { scanScriptureRefs, useBookLookup } from "../../hooks/useReferenceParser";
import { refAttrs } from "../../lib/refAttr";
import { toPassageRef } from "../../lib/passage";
import { EmptyState, LoadingState } from "../../components/ui/EmptyState";
import { cx, inputSmClass } from "../../components/ui/classes";
import { useSetting } from "../../hooks/useSetting";
import { StudyActions } from "../sermons/StudyActions";
import { dictionaryRef } from "../sermons/sourceIdentity";
import { firstParagraph, selectionWithin } from "../sermons/excerpt";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

/** The two works bound in here, and the choice to read only one. Easton's
 *  is the more discursive, Smith's the more encyclopedic; a reader who
 *  prefers one should not have to scroll past the other. */
const SOURCES = [
  { code: "", label: "Both dictionaries" },
  { code: "EAS", label: "Easton's only" },
  { code: "SMI", label: "Smith's only" },
];

export function DictionaryView() {
  const [{ slug: paneSlug }] = usePaneParams("dictionary");
  const slug = paneSlug ?? undefined;
  const navigate = usePaneNavigate();
  const { data: index } = useDictionaryIndex();
  const { data: entry } = useDictionaryEntry(slug ?? null);
  // These entries are brief by design. Where the encyclopedia carries an
  // article on the same headword, say so rather than letting the reader
  // assume a sentence is all there is.
  const { data: inEncyclopedia } = useIsbeEntryByTerm(entry?.term ?? null);
  const typography = useReadingTypography(0.95);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [activeLetter, setActiveLetter] = useState("A");
  const [source, setSource] = useSetting("dictionary.source", "");
  // "Send to sermon" quotes the reader's selection when there is one.
  const bodyRef = useRef<HTMLDivElement>(null);
  const bookLookup = useBookLookup();

  // What the reader's choice leaves on the page, and whether it hid anything.
  const shown = useMemo(
    () => (entry ? entry.definitions.filter((d) => !source || d.source_code === source) : []),
    [entry, source],
  );
  // One heading per dictionary. A few headwords are homonyms that a single
  // work treats twice -- Easton's has "Hail" the weather and "Hail!" the
  // greeting -- so those become numbered senses under one heading rather than
  // the same title printed twice.
  const works = useMemo(() => {
    const out: { code: string; name: string; bodies: string[] }[] = [];
    for (const d of shown) {
      const last = out[out.length - 1];
      if (last && last.code === d.source_code) last.bodies.push(d.body);
      else out.push({ code: d.source_code, name: d.source_name, bodies: [d.body] });
    }
    return out;
  }, [shown]);
  const missingFromChoice = !!entry && !!source && shown.length < entry.definitions.length;

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
  const unfiltered = showingSearch ? searchResults ?? [] : letterEntries;
  // Choosing one dictionary hides the headwords the other one alone carries
  // -- about two thousand each way, so the list really is a different book.
  const list = useMemo(
    () => (source ? unfiltered.filter((e) => e.sources.includes(source)) : unfiltered),
    [unfiltered, source],
  );

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
        <div className="border-b border-line px-3 pb-2">
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            aria-label="Which dictionary to show"
            className={cx(inputSmClass, "w-full")}
          >
            {SOURCES.map((o) => (
              <option key={o.code} value={o.code}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {list.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={(ev) => navigate(`/dictionary/${e.slug}`, ev)}
              className={cx("block w-full border-b border-line px-3 py-2 text-left text-sm hover:bg-hover", slug === e.slug ? "bg-accent-soft font-medium text-accent" : "text-ink-2")}
            >
              {e.term}
              {!source && e.sources.length === 1 && (
                <span className="ml-1.5 text-xs text-ink-4">{e.sources[0] === "EAS" ? "Easton's" : "Smith's"}</span>
              )}
            </button>
          ))}
          {list.length === 0 && <EmptyState compact title={showingSearch ? "No entries match" : `No entries under ${activeLetter}`} />}
        </div>
      </aside>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        {!entry && <EmptyState icon={BookA} title="Bible dictionary" description="Browse by letter or search on the left. Scripture references inside an entry are clickable." />}
        {entry && (
          <div className="mx-auto w-full max-w-[70ch]">
            <div className="mb-2 flex items-start gap-2">
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
            {missingFromChoice && (
              <p className="mb-4 text-sm text-ink-4">
                Showing {source === "EAS" ? "Easton's" : "Smith's"} only.{" "}
                <button type="button" onClick={() => setSource("")} className="text-accent hover:underline">
                  Show both
                </button>
              </p>
            )}
            {inEncyclopedia && (
              <button
                type="button"
                onClick={(e) => openContent("encyclopedia", { slug: inEncyclopedia.slug }, { target: targetFor(e, "focused") })}
                className="mb-4 block text-sm text-accent hover:underline"
              >
                Read the full ISBE article →
              </button>
            )}
            {entry.aliases.length > 0 && (
              <p className="mb-4 text-sm text-ink-4">Also spelled {entry.aliases.join(", ")}</p>
            )}
            <div ref={bodyRef} style={typography}>
              {works.map((work) => (
                <section key={work.code} className="mb-7 last:mb-0">
                  <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-3">{work.name}</h2>
                  {work.bodies.map((body, i) => (
                    <div key={i} className="reading-font mb-3 flex gap-2 whitespace-pre-wrap text-ink last:mb-0">
                      {work.bodies.length > 1 && <span className="shrink-0 text-ink-4">{i + 1}.</span>}
                      <span className="min-w-0">{renderLinkedBody(body)}</span>
                    </div>
                  ))}
                </section>
              ))}
              {shown.length === 0 && (
                <EmptyState
                  compact
                  title={`Not in ${source === "EAS" ? "Easton's" : "Smith's"}`}
                  description="The other dictionary has an article on this headword."
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
