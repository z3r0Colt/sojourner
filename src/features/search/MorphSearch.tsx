import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { useBooks } from "../../api/queries";
import { useReaderTranslationId } from "../../state/workspaceStore";
import { LoadingState } from "../../components/ui/EmptyState";
import { Button } from "../../components/ui/Button";
import { cx, inputSmClass, selectSmClass } from "../../components/ui/classes";
import type { MorphQuery } from "../../api/types";

/** The order the fields appear in, and what the form calls them. */
const FIELD_LABELS: [string, string][] = [
  ["part_of_speech", "Part of speech"],
  ["stem", "Stem"],
  ["tense", "Tense"],
  ["voice", "Voice"],
  ["mood", "Mood"],
  ["person", "Person"],
  ["number", "Number"],
  ["gender", "Gender"],
  ["case", "Case"],
  ["state", "State"],
  ["kind", "Kind"],
];

/**
 * Morphology search: every word with a given parsing, asked for with a form
 * rather than code letters -- "every aorist imperative in Ephesians" is
 * Greek, tense aorist, mood imperative, in Ephesians. A word (a Strong's
 * number, or a lemma typed with or without accents) narrows it further.
 */
export function MorphSearch({ onOpenVerse }: { onOpenVerse: (bookId: number, chapter: number, verse: number, newPane: boolean) => void }) {
  const [language, setLanguage] = useState<"greek" | "hebrew">("greek");
  const [word, setWord] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [range, setRange] = useState<string>("");
  const [limit, setLimit] = useState(200);
  const readerTranslationId = useReaderTranslationId();
  const { data: books } = useBooks();
  const { data: values } = useQuery({
    queryKey: ["morphFieldValues", language],
    queryFn: () => api.getMorphFieldValues(language),
    staleTime: Infinity,
  });

  const query: MorphQuery = useMemo(() => {
    const bookId = /^\d+$/.test(range) ? Number(range) : null;
    return {
      language,
      word: word.trim() || null,
      fields,
      book_ids: bookId ? [bookId] : [],
      testament: range === "OT" || range === "NT" ? range : null,
      translation_id: readerTranslationId,
      limit,
    };
  }, [language, word, fields, range, readerTranslationId, limit]);
  const asking = Object.values(fields).some(Boolean) || word.trim().length > 0;
  const { data: page, isFetching, error } = useQuery({
    queryKey: ["morphSearch", query],
    queryFn: () => api.morphSearch(query),
    enabled: asking,
    placeholderData: (prev) => prev,
  });

  const bookName = (id: number) => books?.find((b) => b.id === id)?.name ?? `#${id}`;
  const testamentBooks = books?.filter((b) => (language === "greek" ? b.testament === "NT" : b.testament === "OT")) ?? [];
  const lang = language === "hebrew" ? "he" : "el";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2 border-b border-line px-3 py-2 text-xs text-ink-3">
        <div className="flex flex-wrap items-center gap-2">
          {(["greek", "hebrew"] as const).map((l) => (
            <Button
              key={l}
              size="sm"
              variant="ghost"
              active={language === l}
              onClick={() => {
                setLanguage(l);
                setFields({});
                setRange("");
              }}
              className="capitalize"
            >
              {l === "greek" ? "Greek NT" : "Hebrew OT"}
            </Button>
          ))}
          <input
            value={word}
            onChange={(e) => setWord(e.target.value)}
            placeholder={language === "greek" ? "Word (λόγος, G3056) — optional" : "Word (חסד, H2617) — optional"}
            aria-label="Word"
            className={cx(inputSmClass, "w-56")}
            lang={lang}
          />
          <span>in</span>
          <select value={range} onChange={(e) => setRange(e.target.value)} className={selectSmClass} aria-label="Range">
            <option value="">{language === "greek" ? "the whole New Testament" : "the whole Old Testament"}</option>
            {testamentBooks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {FIELD_LABELS.filter(([k]) => values?.[k]).map(([k, label]) => (
            <select
              key={k}
              aria-label={label}
              value={fields[k] ?? ""}
              onChange={(e) => setFields({ ...fields, [k]: e.target.value })}
              className={cx(selectSmClass, fields[k] && "border-accent text-accent")}
            >
              <option value="">{label}: any</option>
              {values![k].map((v) => (
                <option key={v} value={v}>
                  {label}: {v}
                </option>
              ))}
            </select>
          ))}
          {(Object.values(fields).some(Boolean) || word) && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setFields({});
                setWord("");
              }}
            >
              Clear
            </Button>
          )}
          {isFetching && <LoadingState className="py-0" label="Searching…" />}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {!asking && <p className="p-3 text-sm text-ink-3">Choose a word or any parsing above: for example tense aorist and mood imperative, in Ephesians.</p>}
        {error != null && <p className="p-3 text-sm text-danger">Search failed: {error instanceof Error ? error.message : String(error)}</p>}
        {asking && page && (
          <p className="px-2 pb-2 text-xs text-ink-3">
            {page.description} · {page.word_total.toLocaleString()} word{page.word_total === 1 ? "" : "s"} in {page.verse_total.toLocaleString()} verse
            {page.verse_total === 1 ? "" : "s"}
          </p>
        )}
        <ul aria-label="Morphology results">
          {page?.hits.map((h) => (
            <li key={`${h.book_id}-${h.chapter}-${h.verse}`}>
              <button
                type="button"
                onClick={(e) => onOpenVerse(h.book_id, h.chapter, h.verse, e.ctrlKey || e.metaKey)}
                className="block w-full rounded-md p-2 text-left hover:bg-hover"
              >
                <div className="flex flex-wrap items-baseline gap-x-3 text-xs">
                  <span className="font-medium text-accent">
                    {bookName(h.book_id)} {h.chapter}:{h.verse}
                  </span>
                  {h.words.map((w) => (
                    <span key={w.sort_order} className="text-ink-3">
                      <span className="text-sm text-ink" lang={lang}>
                        {w.original_word}
                      </span>{" "}
                      {w.description}
                    </span>
                  ))}
                </div>
                {h.text && <div className="reading-font text-sm text-ink-2">{h.text}</div>}
              </button>
            </li>
          ))}
        </ul>
        {page && page.verse_total > page.hits.length && (
          <div className="flex items-center justify-between px-3 py-2 text-xs text-ink-3">
            <span>
              Showing {page.hits.length} of {page.verse_total} verses
            </span>
            {limit < 2000 && (
              <Button size="sm" variant="ghost" onClick={() => setLimit(2000)}>
                Show more
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
