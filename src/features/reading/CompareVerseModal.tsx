import { useMemo, useState } from "react";
import { useCompareVerse, useTranslations } from "../../api/queries";
import { useReadingTypography } from "../../state/uiStore";
import type { Book, Translation, Verse } from "../../api/types";
import { Modal } from "../../components/ui/Modal";
import { EmptyState, LoadingState } from "../../components/ui/EmptyState";
import { Button } from "../../components/ui/Button";
import { cx, selectSmClass } from "../../components/ui/classes";
import { baseReadingAfter, diffAgainst, readingAfter, type EditionDiff } from "./editionDiff";

/** Lighter-weight single-verse comparison across every installed translation
 * that covers it, opened from a verse's context menu -- distinct from full
 * chapter Parallel mode, which shows a whole chapter in a handful of
 * translations picked ahead of time. In the New Testament it can also set
 * the Greek editions side by side and mark where they differ. */
export function CompareVerseModal({
  book,
  chapter,
  verse,
  onClose,
}: {
  book: Book;
  chapter: number;
  verse: number;
  onClose: () => void;
}) {
  const { data: translations } = useTranslations();
  const { data: results } = useCompareVerse(book.id, chapter, verse);
  const typography = useReadingTypography(0.9);
  const [mode, setMode] = useState<"all" | "editions">("all");

  function translationName(id: number) {
    const t = translations?.find((t) => t.id === id);
    return t?.name ?? t?.code ?? `#${id}`;
  }

  const greek = useMemo(() => {
    const byId = new Map((translations ?? []).map((t) => [t.id, t]));
    return (results ?? []).filter((v) => byId.get(v.translation_id)?.script === "greek" && book.testament === "NT");
  }, [results, translations, book.testament]);

  return (
    <Modal title={`${book.name} ${chapter}:${verse} in every translation`} onClose={onClose} size="lg">
      {greek.length >= 2 && (
        <div className="mb-4 flex gap-1" role="tablist" aria-label="Compare">
          <Button size="sm" variant="ghost" role="tab" aria-selected={mode === "all"} active={mode === "all"} onClick={() => setMode("all")}>
            Every translation
          </Button>
          <Button size="sm" variant="ghost" role="tab" aria-selected={mode === "editions"} active={mode === "editions"} onClick={() => setMode("editions")}>
            Greek editions: differences
          </Button>
        </div>
      )}
      {!results && <LoadingState />}
      {results?.length === 0 && <EmptyState compact title="No translation has this verse" />}
      {mode === "editions" && greek.length >= 2 ? (
        <EditionDiffView editions={greek} translations={translations ?? []} typography={typography} />
      ) : (
        <div className="space-y-4">
          {results?.map((v) => {
            const t = translations?.find((x) => x.id === v.translation_id);
            return (
              <div key={v.translation_id}>
                <div className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-ink-3">{translationName(v.translation_id)}</div>
                <p className={cx("reading-font text-ink", t && t.script !== "latin" && "text-original")} dir={t?.direction ?? "ltr"} style={typography}>
                  {v.text}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

/** The Greek editions against one of them, differences marked. */
function EditionDiffView({ editions, translations, typography }: { editions: Verse[]; translations: Translation[]; typography: React.CSSProperties }) {
  const code = (id: number) => translations.find((t) => t.id === id)?.code ?? `#${id}`;
  const name = (id: number) => translations.find((t) => t.id === id)?.name ?? code(id);
  const defaultBase = editions.find((v) => code(v.translation_id) === "TR") ?? editions[0];
  const [baseId, setBaseId] = useState(defaultBase.translation_id);
  const [picked, setPicked] = useState<number | null>(null);
  const base = editions.find((v) => v.translation_id === baseId) ?? defaultBase;
  const baseWords = base.text.split(/\s+/).filter(Boolean);
  const diffs = useMemo(
    () =>
      new Map<number, EditionDiff>(
        editions.filter((v) => v.translation_id !== base.translation_id).map((v) => [v.translation_id, diffAgainst(baseWords, v.text.split(/\s+/).filter(Boolean))]),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editions, base.translation_id],
  );
  // Every base word some edition lacks, for marking the base line.
  const lackedSomewhere = new Set([...diffs.values()].flatMap((d) => d.missing));

  return (
    <div className="space-y-4">
      <p className="text-xs text-ink-3">
        A comparison of printed editions, not a manuscript apparatus. Marked words are where an edition reads differently from{" "}
        <select className={selectSmClass} aria-label="Compare against" value={baseId} onChange={(e) => setBaseId(Number(e.target.value))}>
          {editions.map((v) => (
            <option key={v.translation_id} value={v.translation_id}>
              {name(v.translation_id)}
            </option>
          ))}
        </select>
        ; click one to see that place in every edition. Accents and punctuation are not counted as differences.
      </p>
      <div>
        <div className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-ink-3">{name(base.translation_id)}</div>
        <p className="reading-font text-original text-ink" style={typography}>
          {baseWords.map((w, i) => (
            <span key={i}>
              {i > 0 && " "}
              <span className={cx(lackedSomewhere.has(i) && "rounded bg-warn-soft px-0.5 text-warn underline decoration-dotted underline-offset-4")}>{w}</span>
            </span>
          ))}
        </p>
      </div>
      {[...diffs.entries()].map(([tid, d]) => (
        <div key={tid}>
          <div className="mb-0.5 flex items-baseline gap-2 text-xs font-semibold uppercase tracking-wide text-ink-3">
            {name(tid)}
            {d.missing.length > 0 && (
              <span className="font-normal normal-case tracking-normal text-ink-4">
                lacks {d.missing.length} word{d.missing.length === 1 ? "" : "s"} of {code(base.translation_id)}
              </span>
            )}
          </div>
          <p className="reading-font text-original text-ink" style={typography}>
            {d.words.map((w, i) => (
              <span key={i}>
                {i > 0 && " "}
                {w.differs ? (
                  <button
                    type="button"
                    onClick={() => setPicked(w.anchor)}
                    className="rounded bg-accent-soft px-0.5 text-accent hover:underline"
                    title="See this place in every edition"
                  >
                    {w.text}
                  </button>
                ) : (
                  w.text
                )}
              </span>
            ))}
            {d.missing.length > 0 && (
              <>
                {" "}
                <button type="button" className="text-xs text-ink-3 hover:underline" onClick={() => setPicked(d.missing[0] - 1)}>
                  (see what it lacks)
                </button>
              </>
            )}
          </p>
        </div>
      ))}
      {picked != null && (
        <div className="rounded-lg border border-line bg-surface-2 p-3" role="region" aria-label="This place in every edition">
          <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-ink-3">
            <span>After “{picked >= 0 ? baseWords[picked] : "the start"}” in {code(base.translation_id)}</span>
            <Button size="sm" variant="ghost" onClick={() => setPicked(null)}>
              Close
            </Button>
          </div>
          <dl className="space-y-1 text-sm">
            {editions.map((v) => {
              let reading: string;
              if (v.translation_id === base.translation_id) {
                // The base's own words there: whatever some edition lacks.
                const runs = [...diffs.values()].map((d) => baseReadingAfter(baseWords, d, picked)).filter(Boolean);
                reading = runs.sort((a, b) => b.length - a.length)[0] ?? "";
              } else {
                reading = readingAfter(diffs.get(v.translation_id)!, picked);
                const lacks = baseReadingAfter(baseWords, diffs.get(v.translation_id)!, picked);
                if (!reading && lacks) reading = "(omits)";
              }
              return (
                <div key={v.translation_id} className="flex gap-3">
                  <dt className="w-20 shrink-0 text-xs text-ink-3">{code(v.translation_id)}</dt>
                  <dd className="text-original text-ink">{reading || <span className="text-ink-4">as {code(base.translation_id)}</span>}</dd>
                </div>
              );
            })}
          </dl>
        </div>
      )}
    </div>
  );
}
