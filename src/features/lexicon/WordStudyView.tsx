import { useId, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { BookA, ChevronRight, X } from "lucide-react";
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
import { strongsText } from "./strongsText";
import { useHebrewDisplay } from "./originalText";
import { ParsingTerms } from "./ParsingSection";
import { codedAsNote, parsingSentence } from "./parsingDisplay";
import { occurrenceParsing, parsingLine, parsingsByCode } from "./wordStudyParsing";
import type { MorphParsing, WordOccurrence, WordStudy } from "../../api/types";

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
  return `${ws.entry.original_word} (${ws.entry.transliteration ?? ws.entry.id}), ${ws.entry.id}: ${ws.entry.short_definition ?? strongsText(ws.entry).definition}. Occurs ${ws.occurrences} times in ${ws.verses} verses${books ? `, most in ${books}` : ""}. KJV renders it ${top}.`;
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
  const hebrew = useHebrewDisplay();
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
  const byCode = useMemo(() => parsingsByCode(ws?.forms ?? []), [ws]);

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
            <span className="text-4xl text-ink" lang={lang} dir="auto">
              {hebrew(ws.entry.original_word)}
            </span>
            {ws.entry.transliteration && <span className="text-lg italic text-ink-3">{ws.entry.transliteration}</span>}
          </div>
          <p className="mb-1 text-ink" style={typography}>
            {ws.entry.short_definition ?? strongsText(ws.entry).definition}
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
            {/* One grid for the whole list, each row a subgrid of it, so the
                parsing labels start in one column however wide the form
                before them: ἀγάπη and ἀγάπαις, or a Hebrew form with its
                prefixes. The form's column is as wide as the widest form, up
                to two-fifths of the pane, and the label wraps beside it. */}
            <ul className="grid grid-cols-[fit-content(40%)_minmax(0,1fr)_auto] gap-x-3 text-sm">
              {ws.forms.map((f) => (
                <FormRow key={`${f.form}-${f.morph_code}`} form={f} lang={lang} />
              ))}
            </ul>
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
                    <span className="text-ink" lang={lang} dir="auto">
                      {hebrew(r.original_word)}
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
            <OccurrenceList
              // A new filter is a new list: the parsing opened under the
              // tenth verse of the last one is closed.
              key={`${gloss ?? ""}|${bookFilter ?? ""}`}
              occurrences={shown}
              parsingOf={(o) => occurrenceParsing(byCode, o)}
              lang={lang}
              bookName={bookName}
              typography={typography}
            />
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

/**
 * The parsing of a form or an occurrence as a disclosure: its line in plain
 * words on a button, which opens to the whole parsing in a sentence and the
 * Strong's card's row for each term, each of those opening in turn to what
 * the glossary says of it. Everything starts closed: a form list of fifty
 * rows, or a verse list of thousands, is read down by its labels.
 */
function ParsingToggle({
  label,
  description,
  open,
  onToggle,
  controls,
}: {
  label: string;
  description: string | null;
  open: boolean;
  onToggle: () => void;
  controls: string;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={controls}
      title={description ? `${description} — click for what each term means` : "Click for what each term means"}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className="inline-flex min-w-0 items-start gap-0.5 rounded px-0.5 text-left text-ink-2 hover:bg-hover hover:text-ink"
    >
      <ChevronRight className={cx("mt-[3px] h-3 w-3 shrink-0 text-ink-3 transition-transform", open && "rotate-90")} aria-hidden="true" />
      <span className="min-w-0">{label}</span>
    </button>
  );
}

/** What opens under a form or occurrence: the whole parsing in a sentence
 *  with its code, the note on a word read otherwise than its code, and the
 *  Strong's card's term rows. */
function ParsingPanel({ id, parsing, code, word }: { id: string; parsing: MorphParsing; code: string | null; word: string | null }) {
  const note = code ? codedAsNote(parsing) : null;
  return (
    <div
      id={id}
      // Inside an occurrence the row opens its verse; the panel's own clicks
      // open its terms and nothing else.
      onClick={(e) => e.stopPropagation()}
      className="mb-1 mt-1 cursor-auto rounded-md border border-line bg-surface-2 px-2 py-1.5 text-left"
    >
      <p className="mb-1 text-sm leading-snug text-ink-2">
        {parsingSentence(parsing)}
        {code && (
          <span className="ml-2 whitespace-nowrap font-mono text-[11px] text-ink-3" title="The parsing code in the tagged text">
            {code}
          </span>
        )}
      </p>
      {note && <p className="mb-1 text-[11px] leading-snug text-ink-3">{note}</p>}
      <ParsingTerms parsing={parsing} word={word} />
    </div>
  );
}

/** A form in the text: the form, its parsing in plain words, how often it
 *  occurs, and the whole parsing under it when asked for. */
function FormRow({ form: f, lang }: { form: WordStudy["forms"][number]; lang: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const line = parsingLine(f.parsing, f.description, f.morph_code);
  return (
    <li className="col-span-3 grid grid-cols-subgrid items-baseline border-b border-line py-1 last:border-0">
      {/* The form as its occurrences spell it, every letter and point;
          a Hebrew form without the cantillation, which is each
          occurrence's own and not the form's (word_study.rs). */}
      <span className="text-base text-ink" lang={lang} dir="auto">
        {f.form}
      </span>
      <span className="min-w-0">
        {f.parsing ? (
          <ParsingToggle label={line} description={f.description || null} open={open} onToggle={() => setOpen((v) => !v)} controls={id} />
        ) : (
          <span className="text-ink-2">{line}</span>
        )}
      </span>
      <span className="text-right tabular-nums text-ink-3">{f.count}</span>
      {open && f.parsing && (
        <div className="col-span-3 min-w-0">
          <ParsingPanel id={id} parsing={f.parsing} code={f.morph_code || null} word={f.form} />
        </div>
      )}
    </li>
  );
}

function OccurrenceList({
  occurrences,
  parsingOf,
  lang,
  bookName,
  typography,
}: {
  occurrences: WordOccurrence[];
  parsingOf: (o: WordOccurrence) => MorphParsing | null;
  lang: string;
  bookName: (id: number) => string;
  typography: React.CSSProperties;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const hebrew = useHebrewDisplay();
  // One occurrence's parsing open at a time, by its place in the list: kept
  // here, not in the row, so it stays open when the row scrolls out of the
  // virtual window and back.
  const [openAt, setOpenAt] = useState<number | null>(null);
  const idBase = useId();
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
          const parsing = parsingOf(o);
          const open = openAt === item.index && !!parsing;
          const panelId = `${idBase}-${item.index}`;
          const go = (ev: React.MouseEvent) => openPassage({ bookId: o.book_id, chapter: o.chapter, verse: o.verse }, { target: targetFor(ev) });
          // The row was one button, opening the verse. It holds a second
          // now, the parsing, and a button cannot hold a button: the
          // reference is the verse's button, for the keyboard, and a click
          // anywhere else on the row but the parsing opens the verse too.
          return (
            <div
              key={item.index}
              ref={virtualizer.measureElement}
              data-index={item.index}
              style={{ position: "absolute", top: 0, left: 0, right: 0, transform: `translateY(${item.start}px)` }}
              className="block w-full cursor-pointer rounded-md p-2 text-left hover:bg-hover"
              onClick={go}
            >
              <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
                <button
                  type="button"
                  className="font-medium text-accent hover:underline"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    go(ev);
                  }}
                >
                  {bookName(o.book_id)} {o.chapter}:{o.verse}
                </button>
                <span className="text-sm text-ink" lang={lang} dir="auto">
                  {hebrew(o.original_word)}
                </span>
                {parsing ? (
                  <ParsingToggle
                    label={parsingLine(parsing, o.description, o.morph_code)}
                    description={o.description}
                    open={open}
                    onToggle={() => setOpenAt(open ? null : item.index)}
                    controls={panelId}
                  />
                ) : (
                  <span className="truncate text-ink-3">{o.description}</span>
                )}
              </div>
              {open && parsing && <ParsingPanel id={panelId} parsing={parsing} code={o.morph_code} word={o.original_word} />}
              {o.text && (
                <div className="reading-font text-ink-2" style={typography} dangerouslySetInnerHTML={{ __html: markedVerse(o.text, o.renderings) }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
