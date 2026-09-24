import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { BookA, X } from "lucide-react";
import { api } from "../../api/client";
import { useBooks, useTranslations } from "../../api/queries";
import { usePane, usePaneParams } from "../../workspace/PaneContext";
import { openContent, openPassage, targetFor } from "../../workspace/openContent";
import { useReaderTranslationId } from "../../state/workspaceStore";
import { useReadingTypography } from "../../state/uiStore";
import { EmptyState, LoadingState } from "../../components/ui/EmptyState";
import { Button } from "../../components/ui/Button";
import { cx, inputSmClass, selectSmClass } from "../../components/ui/classes";
import { StudyActions } from "../sermons/StudyActions";
import { strongsRef } from "../sermons/sourceIdentity";
import type { WordOccurrence, WordStudy } from "../../api/types";

/** Marks the KJV's words for the studied word in a verse, case-insensitively,
 * as whole words; the text is escaped first. */
function markedVerse(text: string, words: string[]): string {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const phrases = words
    .map((w) => w.replace(/[.,;:!?()'"]/g, "").trim())
    .filter((w) => w.length > 1)
    .sort((a, b) => b.length - a.length)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (phrases.length === 0) return esc;
  const re = new RegExp(`\\b(${phrases.join("|")})\\b`, "gi");
  return esc.replace(re, "<mark class='rounded bg-accent-soft px-0.5 text-accent'>$1</mark>");
}

/** A short prose summary of a study, for sending to the sermon. */
function summary(ws: WordStudy, bookName: (id: number) => string): string {
  const top = ws.renderings.slice(0, 5).map((r) => `“${r.gloss}” ${r.count}`).join(", ");
  const books = [...ws.by_book].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id, n]) => `${bookName(id)} ${n}`).join(", ");
  return `${ws.entry.original_word} (${ws.entry.transliteration ?? ws.entry.id}), ${ws.entry.id}: ${ws.entry.short_definition ?? ws.entry.definition}. Occurs ${ws.occurrences} times in ${ws.verses} verses${books ? `, most in ${books}` : ""}. KJV renders it ${top}.`;
}

/**
 * The Bible Word Study: one Strong's number, with how often and where the
 * word is used, how the KJV renders it, the forms it takes in the text with
 * their parsing, the words it comes from and that come from it, and every
 * occurrence in the translation being read.
 */
export function WordStudyView() {
  const { id: paneId } = usePane();
  const [params, setParams] = usePaneParams("wordstudy");
  const strongsId = params.id;
  const [input, setInput] = useState(strongsId ?? "");
  const [gloss, setGloss] = useState<string | null>(null);
  const [bookFilter, setBookFilter] = useState<number | null>(null);
  const readerTranslationId = useReaderTranslationId();
  const [translationId, setTranslationId] = useState<number | null>(null);
  const effectiveTranslation = translationId ?? readerTranslationId;
  const { data: translations } = useTranslations();
  const { data: books } = useBooks();
  const typography = useReadingTypography(0.92);
  const bookName = (id: number) => books?.find((b) => b.id === id)?.name ?? `#${id}`;

  const { data: ws, isLoading } = useQuery({
    queryKey: ["wordStudy", strongsId],
    queryFn: () => api.getWordStudy(strongsId!),
    enabled: !!strongsId,
    staleTime: Infinity,
  });
  const { data: occurrences } = useQuery({
    queryKey: ["wordStudyOccurrences", strongsId, effectiveTranslation, gloss],
    queryFn: () => api.getWordStudyOccurrences(strongsId!, effectiveTranslation, gloss),
    enabled: !!strongsId,
    placeholderData: (prev) => prev,
  });
  const { data: shelf } = useQuery({
    queryKey: ["lexiconsForStrongs", strongsId],
    queryFn: () => api.lexiconsForStrongs(strongsId!),
    enabled: !!strongsId,
    staleTime: Infinity,
  });
  const brief = shelf?.find(([code]) => code === "TBESG" || code === "TBESH");
  const { data: briefEntry } = useQuery({
    queryKey: ["lexiconEntry", brief?.[2]],
    queryFn: () => api.getLexiconEntry(brief![2]),
    enabled: !!brief,
    staleTime: Infinity,
  });
  const briefGloss = briefEntry ? /<p><b>([^<]*)<\/b><\/p>/.exec(briefEntry.html)?.[1] ?? null : null;
  const shown = useMemo(
    () => (occurrences ?? []).filter((o) => bookFilter == null || o.book_id === bookFilter),
    [occurrences, bookFilter],
  );

  const open = (id: string) => {
    setParams({ id });
    setInput(id);
    setGloss(null);
    setBookFilter(null);
  };

  const header = (
    <form
      className="flex items-center gap-2 border-b border-line px-4 py-2"
      onSubmit={(e) => {
        e.preventDefault();
        const id = input.trim().replace(/\s+/g, "").toUpperCase();
        if (/^[GH]\d+$/.test(id)) open(id.replace(/^([GH])0+/, "$1"));
        else openContent("lexicon", { id: null, query: input.trim() }, { target: "new", from: paneId });
      }}
    >
      <BookA className="h-4 w-4 text-ink-3" aria-hidden="true" />
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Strong's number (G3056, H2617) or a word to look up"
        aria-label="Word to study"
        className={cx(inputSmClass, "w-72")}
      />
      <Button size="sm" type="submit">
        Study
      </Button>
    </form>
  );

  if (!strongsId) {
    return (
      <div className="flex h-full flex-col">
        {header}
        <EmptyState icon={BookA} title="Bible word study" description="Choose Word study from a Strong's popup or a lexicon entry, or type a Strong's number above." />
      </div>
    );
  }
  if (isLoading) return <LoadingState />;
  if (!ws) {
    return (
      <div className="flex h-full flex-col">
        {header}
        <EmptyState icon={BookA} title={`No entry for ${strongsId}`} />
      </div>
    );
  }

  const maxBook = Math.max(1, ...ws.by_book.map(([, n]) => n));
  const lang = ws.entry.language === "hebrew" ? "he" : "el";
  const totalRenderings = ws.renderings.reduce((a, r) => a + r.count, 0);

  return (
    <div className="flex h-full flex-col">
      {header}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[78ch] px-6 py-5">
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-3">
            <span>
              Word study · {ws.entry.id} · {ws.entry.language}
            </span>
            <StudyActions
              what={`the word study of ${ws.entry.id}`}
              item={() => ({
                kind: "strongs",
                refId: strongsRef(ws.entry.id),
                label: `Word study: ${ws.entry.original_word} (${ws.entry.transliteration ?? ws.entry.id}), ${ws.entry.id}`,
                excerpt: summary(ws, bookName),
              })}
            />
          </div>
          <div className="mb-1 flex items-baseline gap-3">
            <span className="text-4xl text-ink" lang={lang}>
              {ws.entry.original_word}
            </span>
            {ws.entry.transliteration && <span className="text-lg italic text-ink-3">{ws.entry.transliteration}</span>}
          </div>
          <p className="mb-1 text-ink" style={typography}>
            {ws.entry.short_definition ?? ws.entry.definition}
          </p>
          {briefGloss && (
            <p className="mb-1 text-sm text-ink-2">
              <span className="text-ink-3">Brief lexicon:</span> {briefGloss}
            </p>
          )}
          {shelf && shelf.length > 0 && (
            <p className="mb-1 flex flex-wrap items-center gap-1 text-xs">
              <span className="text-ink-3">Full entries:</span>
              {shelf.map(([code, name]) => (
                <button
                  key={code}
                  type="button"
                  className="rounded-full border border-line-2 px-2 py-0.5 text-ink-2 hover:bg-hover"
                  onClick={(e) => openContent("lexicon", { id: ws.entry.id, source: code }, { target: targetFor(e, "new"), from: paneId })}
                >
                  {name}
                </button>
              ))}
            </p>
          )}
          <p className="mb-5 text-sm text-ink-3">
            {ws.occurrences.toLocaleString()} occurrence{ws.occurrences === 1 ? "" : "s"} in {ws.verses.toLocaleString()} verse
            {ws.verses === 1 ? "" : "s"} of the {ws.entry.language === "hebrew" ? "Hebrew Old Testament" : "Greek New Testament (Textus Receptus)"}.{" "}
            <button type="button" className="text-accent hover:underline" onClick={(e) => openContent("lexicon", { id: ws.entry.id }, { target: targetFor(e, "new"), from: paneId })}>
              Full lexicon entry
            </button>
          </p>

          <Section title="How the KJV renders it">
            <div className="flex flex-wrap gap-1.5">
              {ws.renderings.slice(0, 40).map((r) => (
                <button
                  key={r.gloss}
                  type="button"
                  aria-pressed={gloss === r.gloss}
                  onClick={() => setGloss(gloss === r.gloss ? null : r.gloss)}
                  title={`${Math.round((r.count / Math.max(1, totalRenderings)) * 100)}% — click to list only these`}
                  className={cx(
                    "rounded-full border px-2.5 py-0.5 text-sm",
                    gloss === r.gloss ? "border-accent bg-accent-soft text-accent" : "border-line-2 text-ink-2 hover:bg-hover",
                  )}
                >
                  {r.gloss} <span className="tabular-nums text-ink-4">{r.count}</span>
                </button>
              ))}
              {ws.renderings.length === 0 && <span className="text-sm text-ink-3">The interlinear does not tag this word.</span>}
            </div>
          </Section>

          <Section title="Where it occurs">
            <div className="flex h-20 items-end gap-px" role="list" aria-label="Occurrences by book">
              {ws.by_book.map(([id, n]) => (
                <button
                  key={id}
                  type="button"
                  role="listitem"
                  onClick={() => setBookFilter(bookFilter === id ? null : id)}
                  title={`${bookName(id)}: ${n}`}
                  aria-label={`${bookName(id)}, ${n}`}
                  aria-pressed={bookFilter === id}
                  className={cx("min-w-[6px] flex-1 rounded-t", bookFilter === id ? "bg-accent" : "bg-accent/40 hover:bg-accent/70")}
                  style={{ height: `${Math.max(6, (n / maxBook) * 100)}%` }}
                />
              ))}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-3">
              {[...ws.by_book]
                .sort((a, b) => b[1] - a[1])
                .slice(0, 8)
                .map(([id, n]) => (
                  <button key={id} type="button" className="hover:text-ink" onClick={() => setBookFilter(bookFilter === id ? null : id)}>
                    {bookName(id)} <span className="tabular-nums">{n}</span>
                  </button>
                ))}
            </div>
          </Section>

          <Section title="Forms in the text">
            <table className="w-full text-sm">
              <tbody>
                {ws.forms.map((f) => (
                  <tr key={`${f.form}-${f.morph_code}`} className="border-b border-line last:border-0">
                    <td className="py-1 pr-3 text-base text-ink" lang={lang}>
                      {f.form}
                    </td>
                    <td className="py-1 pr-3 text-ink-2">{f.description || f.morph_code}</td>
                    <td className="py-1 text-right tabular-nums text-ink-3">{f.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          {ws.related.length > 0 && (
            <Section title="Related words">
              <ul className="space-y-1 text-sm">
                {ws.related.map((r) => (
                  <li key={r.id} className="flex items-baseline gap-2">
                    <span className="w-16 shrink-0 text-xs text-ink-3">{r.relation === "root" ? "from" : "gives"}</span>
                    <button type="button" className="font-mono text-xs text-accent hover:underline" onClick={() => open(r.id)}>
                      {r.id}
                    </button>
                    <span className="text-ink" lang={lang}>
                      {r.original_word}
                    </span>
                    {r.transliteration && <span className="italic text-ink-3">{r.transliteration}</span>}
                    <span className="truncate text-ink-3">{r.short_definition}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section
            title={`Every occurrence${gloss ? ` rendered “${gloss}”` : ""}${bookFilter ? ` in ${bookName(bookFilter)}` : ""} · ${shown.length}`}
            aside={
              <span className="flex items-center gap-2">
                {(gloss || bookFilter) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={X}
                    onClick={() => {
                      setGloss(null);
                      setBookFilter(null);
                    }}
                  >
                    Clear
                  </Button>
                )}
                <select
                  aria-label="Translation for the verses"
                  className={selectSmClass}
                  value={effectiveTranslation ?? ""}
                  onChange={(e) => setTranslationId(Number(e.target.value))}
                >
                  {translations?.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.code}
                    </option>
                  ))}
                </select>
              </span>
            }
          >
            <OccurrenceList occurrences={shown} lang={lang} bookName={bookName} typography={typography} />
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center justify-between gap-2 border-b border-line pb-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-3">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function OccurrenceList({
  occurrences,
  lang,
  bookName,
  typography,
}: {
  occurrences: WordOccurrence[];
  lang: string;
  bookName: (id: number) => string;
  typography: React.CSSProperties;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: occurrences.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 72,
    overscan: 8,
  });
  return (
    <div ref={listRef} className="max-h-[32rem] overflow-y-auto">
      <div style={{ position: "relative", height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((item) => {
          const o = occurrences[item.index];
          return (
            <button
              key={item.index}
              type="button"
              ref={virtualizer.measureElement}
              data-index={item.index}
              style={{ position: "absolute", top: 0, left: 0, right: 0, transform: `translateY(${item.start}px)` }}
              className="block w-full rounded-md p-2 text-left hover:bg-hover"
              onClick={(ev) => openPassage({ bookId: o.book_id, chapter: o.chapter, verse: o.verse }, { target: targetFor(ev) })}
            >
              <div className="flex items-baseline gap-2 text-xs">
                <span className="font-medium text-accent">
                  {bookName(o.book_id)} {o.chapter}:{o.verse}
                </span>
                <span className="text-sm text-ink" lang={lang}>
                  {o.original_word}
                </span>
                <span className="truncate text-ink-3">{o.description}</span>
              </div>
              {o.text && (
                <div className="reading-font text-ink-2" style={typography} dangerouslySetInnerHTML={{ __html: markedVerse(o.text, o.renderings) }} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
