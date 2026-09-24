import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, MapPin, Search, Users } from "lucide-react";
import { api } from "../../api/client";
import { useBooks, useCommentarySources } from "../../api/queries";
import type { FactbookEntry, FactbookSummary } from "../../api/types";
import { usePane, usePaneParams } from "../../workspace/PaneContext";
import { openContent, openPassage, targetFor } from "../../workspace/openContent";
import { useReadingTypography } from "../../state/uiStore";
import { EmptyState, LoadingState } from "../../components/ui/EmptyState";
import { Button } from "../../components/ui/Button";
import { cx, inputSmClass } from "../../components/ui/classes";
import { CommentaryHtml } from "../commentary/CommentaryPanel";
import { StudyActions } from "../sermons/StudyActions";
import { factbookRef } from "../sermons/sourceIdentity";
import { snippetHtml } from "../../lib/snippet";

/** How each relation reads in the family section, in the order shown. */
const RELATION_GROUPS: [string, string[]][] = [
  ["Parents", ["father", "mother", "parent"]],
  ["Married to", ["partner"]],
  ["Children", ["child"]],
  ["Brothers and sisters", ["sibling"]],
  ["Founded by", ["founder"]],
  ["Founded", ["founded"]],
  ["People of the place", ["inhabitant"]],
  ["Lived in", ["lived_in"]],
];

const QUALIFIER: Record<string, string> = {
  d: "descendants",
  a: "ancestor",
  f: "founder",
  "?": "uncertain",
};

function describe(e: FactbookSummary): string {
  return e.description && e.description !== "Place" ? e.description : e.entity_type || e.kind;
}

/**
 * The Factbook: one page per person, place or named thing. Who they were,
 * their family, every verse that names them, and what the encyclopedia and
 * dictionaries say, with the map for a place.
 */
export function FactbookView() {
  const { id: paneId, width } = usePane();
  const [params, setParams] = usePaneParams("factbook");
  // In a narrow pane the list gives way to the entry once one is chosen.
  const narrow = width > 0 && width < 700;
  const [browsing, setBrowsing] = useState(false);
  const showList = !narrow || !params.id || browsing;
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const typography = useReadingTypography(0.95);
  const { data: books } = useBooks();
  const bookName = (id: number) => books?.find((b) => b.id === id)?.name ?? `#${id}`;

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 200);
    return () => clearTimeout(t);
  }, [query]);
  const { data: results } = useQuery({
    queryKey: ["factbookSearch", debounced],
    queryFn: () => api.searchFactbook(debounced, 40),
    enabled: debounced.trim().length >= 2,
  });
  const { data: entry, isLoading } = useQuery({
    queryKey: ["factbookEntry", params.id],
    queryFn: () => api.getFactbookEntry(params.id!),
    enabled: !!params.id,
    staleTime: Infinity,
  });

  function jumpToRef(bookOsisCode: string, chapter: number, verse: number, e?: React.MouseEvent) {
    const book = books?.find((b) => b.osis_code === bookOsisCode);
    if (book) openPassage({ bookId: book.id, chapter, verse }, { target: e ? targetFor(e) : "focused", from: paneId });
  }

  return (
    <div className="flex h-full">
      <aside className={cx("flex shrink-0 flex-col border-r border-line bg-surface-2/60", narrow ? "w-full" : "w-72", !showList && "hidden")}>
        <div className="border-b border-line p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-4" aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="A person or place…"
              aria-label="Find in the Factbook"
              className={cx(inputSmClass, "w-full pl-7")}
            />
          </div>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {(results ?? []).map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => {
                  setParams({ id: r.id });
                  setBrowsing(false);
                }}
                className={cx("block w-full border-b border-line px-3 py-2 text-left text-sm hover:bg-hover", r.id === params.id && "bg-accent-soft")}
              >
                <div className="flex items-center gap-1.5 text-ink">
                  {r.kind === "place" ? <MapPin className="h-3.5 w-3.5 text-ink-3" aria-hidden="true" /> : <Users className="h-3.5 w-3.5 text-ink-3" aria-hidden="true" />}
                  {r.name}
                </div>
                <div className="truncate text-xs text-ink-3">
                  {describe(r)} · {r.verse_count} verse{r.verse_count === 1 ? "" : "s"}
                </div>
              </button>
            </li>
          ))}
          {debounced.trim().length < 2 && (
            <li className="p-3 text-xs text-ink-3">Type a name. Each person and place the Bible names has its own page: which Zechariah, whose son, every verse.</li>
          )}
        </ul>
      </aside>
      <div className={cx("min-h-0 flex-1 overflow-y-auto", narrow ? "px-4 py-4" : "px-8 py-6", narrow && showList && "hidden")}>
        {narrow && params.id && (
          <button type="button" className="mb-3 flex items-center gap-1 text-xs text-accent hover:underline" onClick={() => setBrowsing(true)}>
            <Search className="h-3 w-3" aria-hidden="true" /> Find another
          </button>
        )}
        {!params.id && <EmptyState icon={Users} title="Factbook" description="Find a person or place on the left, or double-click a name in the text." />}
        {params.id && isLoading && <LoadingState />}
        {params.id && !isLoading && !entry && <EmptyState icon={Users} title="Not in the Factbook" />}
        {entry && <EntryBody entry={entry} bookName={bookName} typography={typography} onOpen={(id) => setParams({ id })} onJumpToRef={jumpToRef} paneId={paneId} />}
      </div>
    </div>
  );
}

function EntryBody({
  entry,
  bookName,
  typography,
  onOpen,
  onJumpToRef,
  paneId,
}: {
  entry: FactbookEntry;
  bookName: (id: number) => string;
  typography: React.CSSProperties;
  onOpen: (id: string) => void;
  onJumpToRef: (book: string, chapter: number, verse: number, e?: React.MouseEvent) => void;
  paneId: string;
}) {
  const e = entry.summary;
  const originals = entry.names.filter((n) => n.original);
  const englishForms = [...new Set(entry.names.flatMap((n) => n.english.split(";").map((s) => s.trim())).filter(Boolean))];
  const byBook = useMemo(() => {
    const m = new Map<number, [number, number][]>();
    for (const [b, c, v] of entry.verses) {
      const list = m.get(b) ?? [];
      list.push([c, v]);
      m.set(b, list);
    }
    return [...m.entries()];
  }, [entry.verses]);
  const isbe = entry.links.filter((l) => l.kind === "isbe");
  const dictionary = entry.links.filter((l) => l.kind === "dictionary");
  const atlas = entry.links.find((l) => l.kind === "atlas");

  return (
    <div className="mx-auto w-full max-w-[72ch]">
      <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-3">
        <span>
          Factbook · {e.kind === "place" ? "place" : e.kind === "person" ? "person" : e.entity_type.toLowerCase() || "name"}
        </span>
        <StudyActions
          what={e.name}
          item={() => ({
            kind: "encyclopedia",
            refId: factbookRef(e.id),
            label: `${e.name} (Factbook)`,
            excerpt: [
              describe(e),
              ...entry.relations.filter((r) => r.kind === "father").map((r) => `${e.entity_type === "Female" ? "daughter" : "son"} of ${r.entity.name}`),
            ].join("; "),
          })}
        />
      </div>
      <h1 className="reading-font mb-1 text-3xl text-ink">{e.name}</h1>
      <p className="mb-2 text-ink-2">
        {describe(e)}
        {entry.tribe && ` · ${entry.tribe}`}
        {entry.region && ` · ${entry.region}`}
      </p>
      {(englishForms.length > 1 || originals.length > 0) && (
        <p className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-ink-3">
          {englishForms.length > 1 && <span>Also: {englishForms.filter((f) => f !== e.name).join(", ")}</span>}
          {originals.map((n, i) => (
            <button
              key={i}
              type="button"
              className="text-original text-base text-ink hover:text-accent"
              title={`${n.significance}: ${n.english}${n.strongs_plain ? ` (${n.strongs_plain})` : ""} — open the word study`}
              onClick={(ev) => n.strongs_plain && openContent("wordstudy", { id: n.strongs_plain }, { target: targetFor(ev, "new"), from: paneId })}
            >
              {n.original}
            </button>
          ))}
        </p>
      )}
      {entry.summary_html && (
        <div className="mb-5 text-sm text-ink-2">
          <CommentaryHtml html={entry.summary_html} onJumpToRef={onJumpToRef} />
        </div>
      )}

      {entry.relations.length > 0 && (
        <Section title={e.kind === "place" ? "People and places" : "Family"}>
          <dl className="grid grid-cols-[10rem_1fr] gap-x-3 gap-y-1.5 text-sm">
            {RELATION_GROUPS.map(([label, kinds]) => {
              const rel = entry.relations.filter((r) => kinds.includes(r.kind));
              if (rel.length === 0) return null;
              return (
                <div key={label} className="contents">
                  <dt className="text-ink-3">{label}</dt>
                  <dd className="flex flex-wrap gap-x-2 gap-y-1">
                    {rel.map((r) => (
                      <button key={r.entity.id + r.kind} type="button" className="text-accent hover:underline" onClick={() => onOpen(r.entity.id)} title={describe(r.entity)}>
                        {r.entity.name}
                        {r.qualifier && QUALIFIER[r.qualifier] && <span className="text-ink-4"> ({QUALIFIER[r.qualifier]})</span>}
                      </button>
                    ))}
                  </dd>
                </div>
              );
            })}
          </dl>
        </Section>
      )}

      {atlas && (
        <Section title="On the map">
          <Button size="sm" variant="secondary" icon={MapPin} onClick={(ev) => openContent("atlas", { slug: atlas.slug }, { target: targetFor(ev, "new"), from: paneId })}>
            {atlas.title} in the atlas
          </Button>
        </Section>
      )}

      <Section title={`Every verse · ${entry.verses.length}`}>
        <div className="space-y-1 text-sm">
          {byBook.map(([b, refs]) => (
            <div key={b} className="flex gap-2">
              <span className="w-28 shrink-0 text-ink-3">{bookName(b)}</span>
              <span className="flex flex-wrap gap-x-2">
                {refs.map(([c, v]) => (
                  <button
                    key={`${c}:${v}`}
                    type="button"
                    className="tabular-nums text-accent hover:underline"
                    onClick={(ev) => openPassage({ bookId: b, chapter: c, verse: v }, { target: targetFor(ev), from: paneId })}
                  >
                    {c}:{v}
                  </button>
                ))}
              </span>
            </div>
          ))}
        </div>
      </Section>

      {isbe.map((l, i) => (
        <ArticleSection key={l.slug} kind="isbe" slug={l.slug} title={`Encyclopedia: ${l.title}`} open={i === 0} typography={typography} onJumpToRef={onJumpToRef} paneId={paneId} />
      ))}
      {dictionary.map((l) => (
        <ArticleSection key={l.slug} kind="dictionary" slug={l.slug} title={`Dictionary: ${l.title}`} open={false} typography={typography} onJumpToRef={onJumpToRef} paneId={paneId} />
      ))}

      <CommentaryMentions name={e.name} paneId={paneId} />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h3 className="mb-2 border-b border-line pb-1 text-xs font-semibold uppercase tracking-wide text-ink-3">{title}</h3>
      {children}
    </section>
  );
}

/** An encyclopedia article or dictionary entry, inline and collapsible. */
function ArticleSection({
  kind,
  slug,
  title,
  open: initiallyOpen,
  typography,
  onJumpToRef,
  paneId,
}: {
  kind: "isbe" | "dictionary";
  slug: string;
  title: string;
  open: boolean;
  typography: React.CSSProperties;
  onJumpToRef: (book: string, chapter: number, verse: number, e?: React.MouseEvent) => void;
  paneId: string;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const { data: isbe } = useQuery({ queryKey: ["isbeEntry", slug], queryFn: () => api.getIsbeEntry(slug), enabled: open && kind === "isbe" });
  const { data: dict } = useQuery({ queryKey: ["dictionaryEntry", slug], queryFn: () => api.getDictionaryEntry(slug), enabled: open && kind === "dictionary" });
  return (
    <section className="mb-4">
      <div className="flex items-center justify-between border-b border-line pb-1">
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-ink-3 hover:text-ink">
          <ChevronDown className={cx("h-3.5 w-3.5 transition-transform", !open && "-rotate-90")} aria-hidden="true" />
          {title}
        </button>
        <button
          type="button"
          className="text-xs text-accent hover:underline"
          onClick={(ev) => openContent(kind === "isbe" ? "encyclopedia" : "dictionary", { slug }, { target: targetFor(ev, "new"), from: paneId })}
        >
          Open
        </button>
      </div>
      {open && (
        <div className="mt-2 text-ink" style={typography}>
          {kind === "isbe" && (isbe ? <CommentaryHtml html={isbe.body} onJumpToRef={onJumpToRef} /> : <LoadingState />)}
          {kind === "dictionary" &&
            (dict ? (
              dict.definitions.map((d, i) => (
                <div key={i} className="mb-3">
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-3">{d.source_name}</div>
                  <p className="whitespace-pre-wrap">{d.body}</p>
                </div>
              ))
            ) : (
              <LoadingState />
            ))}
        </div>
      )}
    </section>
  );
}

/** What the commentaries say where they name the person or place. */
function CommentaryMentions({ name, paneId }: { name: string; paneId: string }) {
  const { data: sources } = useCommentarySources();
  const { data: books } = useBooks();
  const ids = useMemo(() => (sources ?? []).map((s) => s.id), [sources]);
  const { data } = useQuery({
    queryKey: ["factbookCommentary", name, ids],
    queryFn: () => api.search(`"${name}"`, [], ids, { wholeWords: true }, 8),
    enabled: ids.length > 0,
    staleTime: Infinity,
  });
  const hits = data?.commentary ?? [];
  if (hits.length === 0) return null;
  return (
    <Section title={`In the commentaries${data && data.commentary_total > hits.length ? ` · ${data.commentary_total}` : ""}`}>
      <ul className="space-y-2 text-sm">
        {hits.map((h) => (
          <li key={h.entry_id}>
            <button
              type="button"
              className="block w-full rounded-md p-1.5 text-left hover:bg-hover"
              onClick={(ev) =>
                h.book_id != null &&
                openContent("commentary", { sourceId: h.source_id, bookId: h.book_id, chapter: h.chapter ?? 1, verse: h.verse }, { target: targetFor(ev, "new"), from: paneId })
              }
            >
              <div className="text-xs text-ink-3">
                {h.source_label} · {books?.find((b) => b.id === h.book_id)?.name} {h.chapter}
                {h.verse ? `:${h.verse}` : ""}
              </div>
              <div className="text-ink-2" dangerouslySetInnerHTML={{ __html: snippetHtml(h.snippet) }} />
            </button>
          </li>
        ))}
      </ul>
    </Section>
  );
}
