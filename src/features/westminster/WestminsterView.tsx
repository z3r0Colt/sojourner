import { useEffect, useMemo, useRef, useState } from "react";
import { snippetHtml } from "../../lib/snippet";
import { useQuery } from "@tanstack/react-query";
import { BookA, ChevronDown, ChevronLeft, ChevronRight, ListTree, Search } from "lucide-react";
import { api } from "../../api/client";
import {
  useWestminsterDocuments,
  useWestminsterSections,
  useWestminsterSection,
  useBooks,
  useWestminsterCommentarySources,
  useWestminsterCommentary,
  useDoctrineTopics,
  useSuggestedResourcesForTopic,
  useDictionaryEntryByTerm,
} from "../../api/queries";
import { usePaneNavigate, usePaneParams } from "../../workspace/PaneContext";
import { PaneLink as Link } from "../../workspace/PaneLink";
import { openPassage, targetFor } from "../../workspace/openContent";
import { useReadingTypography } from "../../state/uiStore";
import { refAttrs } from "../../lib/refAttr";
import { toPassageRef } from "../../lib/passage";
import type { WestminsterProofRef, DoctrineTopic } from "../../api/types";
import { Tabs } from "../../components/ui/Tabs";
import { EmptyState, LoadingState } from "../../components/ui/EmptyState";
import { cx, inputSmClass, selectSmClass } from "../../components/ui/classes";
import { StudyActions } from "../sermons/StudyActions";
import { westminsterRef } from "../sermons/sourceIdentity";
import { htmlToText, selectionWithin } from "../sermons/excerpt";

/** The order these categories are presented in the Topics sidebar tab --
 * traditional systematic-theology order, matching the sequence
 * import::reference::doctrine_topics seeds them in. */
const CATEGORY_ORDER = [
  "Scripture & the Knowledge of God",
  "God, the Trinity & His Decrees",
  "Creation & Providence",
  "The Fall, Sin & the Covenant",
  "Christ the Mediator",
  "The Application of Salvation",
  "The Law & the Christian Life",
  "The Church & the Means of Grace",
  "Church Order & Prayer",
  "Last Things",
];

// WCF section headings are formatted "Chapter N, M" by the confession importer.
function parseChapterHeading(heading: string): { chapter: number; section: number } | null {
  const m = heading.match(/^Chapter (\d+),\s*(\d+)$/);
  return m ? { chapter: Number(m[1]), section: Number(m[2]) } : null;
}

// WLC/WSC section headings are formatted "Question N" by the same importer.
function parseQuestionHeading(heading: string): { chapter: number; section: number } | null {
  const m = heading.match(/^Question (\d+)$/);
  return m ? { chapter: Number(m[1]), section: -1 } : null;
}

const sidebarItemClass = "block w-full border-b border-line px-3 py-2 text-left text-sm hover:bg-hover";

export function WestminsterView() {
  const [params] = usePaneParams("westminster");
  const docCode = params.docCode ?? undefined;
  const sectionIdParam = params.sectionId;
  const navigate = usePaneNavigate();
  const { data: documents } = useWestminsterDocuments();
  const { data: books } = useBooks();
  const doc = documents?.find((d) => d.code === docCode) ?? documents?.[0];
  const { data: sections } = useWestminsterSections(doc?.id ?? null);
  const sectionId = sectionIdParam ?? sections?.[0]?.id ?? null;
  const { data: section } = useWestminsterSection(sectionId);
  const typography = useReadingTypography(0.95);
  // "Send to sermon" quotes the reader's selection when there is one.
  const bodyRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [sidebarMode, setSidebarMode] = useState<"sections" | "topics">("sections");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);
  const { data: searchResults } = useQuery({
    queryKey: ["westminsterSearch", debounced],
    queryFn: () => api.searchWestminster(debounced, 100),
    enabled: debounced.trim().length > 1,
  });

  const { data: topics } = useDoctrineTopics();
  const topicsByCategory = useMemo(() => {
    const map = new Map<string, DoctrineTopic[]>();
    for (const t of topics ?? []) {
      const arr = map.get(t.category) ?? [];
      arr.push(t);
      map.set(t.category, arr);
    }
    return map;
  }, [topics]);

  function bookName(id: number) {
    return books?.find((b) => b.id === id)?.name ?? `#${id}`;
  }

  const proofsByMarker = useMemo(() => {
    const map = new Map<number, WestminsterProofRef[]>();
    if (!section) return map;
    for (const p of section.proofs) {
      const arr = map.get(p.marker) ?? [];
      arr.push(p);
      map.set(p.marker, arr);
    }
    return map;
  }, [section]);

  const idx = sections?.findIndex((s) => s.id === sectionId) ?? -1;
  const prev = idx > 0 ? sections?.[idx - 1] : null;
  const next = sections && idx >= 0 && idx < sections.length - 1 ? sections[idx + 1] : null;

  const chapterRef =
    section && doc?.code === "wcf"
      ? parseChapterHeading(section.heading)
      : section && (doc?.code === "wsc" || doc?.code === "wlc")
        ? parseQuestionHeading(section.heading)
        : null;

  // Which curated topic (if any) the currently-viewed paragraph/question
  // belongs to -- matched by chapter/question number rather than exact
  // section id, so viewing WCF 11.3 still resolves to the "Justification"
  // topic anchored at 11.1.
  const currentTopic = useMemo(() => {
    if (!chapterRef || !doc || !topics) return null;
    return (
      topics.find((t) => {
        if (t.document_code !== doc.code) return false;
        const topicRef = doc.code === "wcf" ? parseChapterHeading(t.heading) : parseQuestionHeading(t.heading);
        return topicRef?.chapter === chapterRef.chapter;
      }) ?? null
    );
  }, [chapterRef, doc, topics]);
  const { data: relatedResources } = useSuggestedResourcesForTopic(currentTopic?.id ?? null);

  const topicKeyword = currentTopic?.name.replace(/^Of the |^Of /, "") ?? null;
  const { data: glossaryEntry } = useDictionaryEntryByTerm(topicKeyword);

  const { data: allCommentarySources } = useWestminsterCommentarySources();
  const commentarySources = useMemo(
    () => allCommentarySources?.filter((s) => s.document_code === doc?.code) ?? [],
    [allCommentarySources, doc?.code],
  );
  const [commentarySourceId, setCommentarySourceId] = useState<number | null>(null);
  useEffect(() => {
    setCommentarySourceId(commentarySources.length > 0 ? commentarySources[0].id : null);
  }, [commentarySources]);

  function renderBody(text: string) {
    const parts = text.split(/(\[\d+\])/g);
    return parts.map((part, i) => {
      const m = part.match(/^\[(\d+)\]$/);
      if (!m) return <span key={i}>{part}</span>;
      const marker = Number(m[1]);
      const refs = proofsByMarker.get(marker);
      const first = refs?.[0];
      return (
        <sup key={i}>
          <button
            type="button"
            className="text-accent hover:underline"
            title={refs?.map((r) => `${bookName(r.book_id)} ${r.chapter}:${r.verse_start}`).join("; ")}
            onClick={(e) => {
              if (first) openPassage({ bookId: first.book_id, chapter: first.chapter, verse: first.verse_start }, { target: targetFor(e) });
            }}
            onAuxClick={(e) => {
              if (first && e.button === 1) openPassage({ bookId: first.book_id, chapter: first.chapter, verse: first.verse_start }, { target: "new" });
            }}
            {...(first ? refAttrs(toPassageRef(first.book_id, first.chapter, first.verse_start, first.verse_end)) : {})}
          >
            [{marker}]
          </button>
        </sup>
      );
    });
  }

  return (
    <div className="flex h-full">
      <aside className="flex w-72 shrink-0 flex-col border-r border-line bg-surface-2/60">
        <Tabs
          size="sm"
          stretch
          items={[
            { key: "sections" as const, label: "Contents", icon: ListTree },
            { key: "topics" as const, label: "By topic", icon: BookA },
          ]}
          value={sidebarMode}
          onChange={setSidebarMode}
        />
        {sidebarMode === "sections" && (
          <>
            <div className="space-y-2 border-b border-line p-3">
              <select aria-label="Document" className={cx(selectSmClass, "w-full")} value={doc?.code ?? ""} onChange={(e) => navigate(`/westminster/${e.target.value}`)}>
                {documents?.map((d) => (
                  <option key={d.id} value={d.code}>
                    {d.title}
                  </option>
                ))}
              </select>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-4" aria-hidden="true" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search all documents…" className={cx(inputSmClass, "w-full pl-7")} />
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {debounced.trim().length > 1
                ? searchResults?.map((r) => (
                    <button
                      key={r.section_id}
                      type="button"
                      onClick={(e) => {
                        const targetDoc = documents?.find((d) => d.id === r.document_id);
                        if (targetDoc) navigate(`/westminster/${targetDoc.code}/${r.section_id}`, e);
                      }}
                      className={sidebarItemClass}
                    >
                      <div className="font-medium text-ink">{r.heading}</div>
                      {r.prompt && <div className="text-xs text-ink-2">{r.prompt}</div>}
                      <div
                        className="text-xs text-ink-3"
                        dangerouslySetInnerHTML={{ __html: snippetHtml(r.snippet) }}
                      />
                    </button>
                  ))
                : sections?.map((s) => (
                    <Link
                      key={s.id}
                      to={`/westminster/${doc?.code}/${s.id}`}
                      className={cx(sidebarItemClass, s.id === sectionId ? "bg-accent-soft font-medium text-accent" : "text-ink-2")}
                    >
                      {s.heading}
                    </Link>
                  ))}
            </div>
          </>
        )}
        {sidebarMode === "topics" && (
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            <p className="mb-2 px-1 text-xs text-ink-3">
              A topical index of the Standards: every Confession chapter, plus Shorter Catechism questions on doctrines the chapter list alone doesn't surface.
            </p>
            {CATEGORY_ORDER.filter((c) => (topicsByCategory.get(c)?.length ?? 0) > 0).map((category) => (
              <div key={category} className="mb-3">
                <h3 className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-ink-3">{category}</h3>
                <ul>
                  {topicsByCategory.get(category)!.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={(e) => navigate(`/westminster/${t.document_code}/${t.westminster_section_id}`, e)}
                        className={cx(
                          "flex w-full items-baseline justify-between rounded-md px-2 py-1 text-left text-sm hover:bg-hover",
                          currentTopic?.id === t.id ? "bg-accent-soft font-medium text-accent" : "text-ink-2",
                        )}
                      >
                        <span>{t.name}</span>
                        <span className="ml-1.5 text-xs uppercase text-ink-4">{t.document_code}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </aside>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        {!section && sections && sections.length === 0 && <EmptyState title="Nothing to show" />}
        {!section && (!sections || sections.length > 0) && <LoadingState />}
        {section && (
          <div className="mx-auto w-full max-w-[70ch]">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-3">{doc?.title}</div>
            <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="reading-font text-2xl font-semibold text-ink">{section.heading}</h1>
              <StudyActions
                what={section.heading}
                item={() => ({
                  kind: "confession",
                  refId: westminsterRef(doc?.code ?? docCode ?? "wcf", section.id),
                  label: `${(doc?.code ?? docCode ?? "").toUpperCase()} ${section.heading}`.trim(),
                  excerpt: selectionWithin(bodyRef.current) ?? ([section.prompt, htmlToText(section.body ?? "")].filter(Boolean).join(" — ") || null),
                })}
              />
              {glossaryEntry && (
                <Link to={`/dictionary/${glossaryEntry.slug}`} className="text-sm text-accent hover:underline" title={`Dictionary definition of "${glossaryEntry.term}"`}>
                  What does “{glossaryEntry.term}” mean?
                </Link>
              )}
            </div>
            {section.prompt && (
              <p className="reading-font mb-3 font-medium italic text-ink" style={typography}>
                {section.prompt}
              </p>
            )}
            <div ref={bodyRef} className="reading-font mb-6 text-ink" style={typography}>
              {renderBody(section.body_with_proofs)}
            </div>

            {section.proofs.length > 0 && (
              <div className="mb-6 border-t border-line pt-3 text-sm">
                <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-3">Scripture proofs</h3>
                <ul className="space-y-0.5">
                  {Array.from(proofsByMarker.entries()).map(([marker, refs]) => (
                    <li key={marker} className="text-ink-2">
                      <span className="mr-1.5 font-mono text-xs text-ink-3">[{marker}]</span>
                      {refs.map((r, i) => (
                        <button
                          key={i}
                          type="button"
                          className="mr-2 text-accent hover:underline"
                          onClick={(e) => openPassage({ bookId: r.book_id, chapter: r.chapter, verse: r.verse_start }, { target: targetFor(e) })}
                          onAuxClick={(e) => e.button === 1 && openPassage({ bookId: r.book_id, chapter: r.chapter, verse: r.verse_start }, { target: "new" })}
                          {...refAttrs(toPassageRef(r.book_id, r.chapter, r.verse_start, r.verse_end))}
                        >
                          {bookName(r.book_id)} {r.chapter}:{r.verse_start}
                          {r.verse_end !== r.verse_start ? `-${r.verse_end}` : ""}
                        </button>
                      ))}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {chapterRef && commentarySources && commentarySources.length > 0 && (
              <CommentaryPanel
                chapter={chapterRef.chapter}
                currentSection={chapterRef.section}
                sources={commentarySources}
                sourceId={commentarySourceId}
                onSourceChange={setCommentarySourceId}
              />
            )}

            {currentTopic && relatedResources && relatedResources.length > 0 && (
              <div className="mb-6 border-t border-line pt-3">
                <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-3">Resources on “{currentTopic.name}”</h3>
                <ul className="space-y-1">
                  {relatedResources.map((r) => (
                    <li key={r.id}>
                      <Link to={`/resources/${r.id}`} className="text-sm text-accent hover:underline">
                        {r.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-between gap-4 border-t border-line pt-4 text-sm">
              {prev ? (
                <Link to={`/westminster/${doc?.code}/${prev.id}`} className="inline-flex items-center gap-1 text-accent hover:underline">
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" /> {prev.heading}
                </Link>
              ) : (
                <span />
              )}
              {next && (
                <Link to={`/westminster/${doc?.code}/${next.id}`} className="inline-flex items-center gap-1 text-right text-accent hover:underline">
                  {next.heading} <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CommentaryPanel({
  chapter,
  currentSection,
  sources,
  sourceId,
  onSourceChange,
}: {
  chapter: number;
  currentSection: number;
  sources: { id: number; code: string; title: string; author: string | null }[];
  sourceId: number | null;
  onSourceChange: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const { data: entries } = useWestminsterCommentary(open ? sourceId : null, chapter);
  const source = sources.find((s) => s.id === sourceId);
  const typography = useReadingTypography(0.9);

  return (
    <div className="mb-6 border-t border-line pt-3">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-ink-3 hover:text-ink"
        >
          <ChevronDown className={cx("h-3.5 w-3.5 transition-transform", !open && "-rotate-90")} aria-hidden="true" />
          Commentary on chapter {chapter}
        </button>
        <select
          aria-label="Commentary source"
          value={sourceId ?? ""}
          onChange={(e) => {
            onSourceChange(Number(e.target.value));
            setOpen(true);
          }}
          className={selectSmClass}
        >
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.author ?? s.title}
            </option>
          ))}
        </select>
      </div>

      {open && (
        <div className="reading-font mt-3 space-y-4 text-ink-2" style={typography}>
          {!entries && <LoadingState />}
          {entries?.length === 0 && <p className="text-sm text-ink-3">No commentary on this chapter.</p>}
          {entries?.map((e) => (
            <div key={e.id} className={cx(e.section === currentSection && "-mx-3 rounded-md bg-amber-50 px-3 py-2 ring-1 ring-amber-200 dark:bg-amber-950/30 dark:ring-amber-900")}>
              {e.section != null && <div className="mb-1 font-sans text-xs font-semibold text-ink-3">Section {e.section}</div>}
              {e.body.split(/\n\s*\n/).map((para, i) => (
                <p key={i} className="mb-3 whitespace-pre-line">
                  {para}
                </p>
              ))}
            </div>
          ))}
          {source && (
            <p className="border-t border-line pt-2 font-sans text-xs text-ink-3">
              {source.title}
              {source.author ? ` · ${source.author}` : ""}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
