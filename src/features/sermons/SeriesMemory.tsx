import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useBooks, usePassages, useSermons } from "../../api/queries";
import type { Book, PassageRef, Sermon, SermonSeries } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { cx, inputSmClass } from "../../components/ui/classes";
import { toast } from "../../components/ui/toast";
import { useSetting } from "../../hooks/useSetting";
import { parseReference, useBookLookup } from "../../hooks/useReferenceParser";
import { refKey } from "../../lib/passage";
import { useAddToMemory } from "../memory/useAddToMemory";
import { memoryWords } from "../memory/memoryText";
import { formatPreachDate } from "./sermonFormat";

/**
 * A verse to memorize for each sermon of a series (the church's side of the
 * Memory page): the pastor picks them, adds them to their own deck as a set
 * named for the series, and prints a sheet of cards to hand out -- one per
 * Sunday, cut apart along the dashes. The choices are kept per series.
 */

/** A sermon's text as a verse to learn: the text itself when it is short,
 * else its first verse. */
export function defaultMemoryVerse(sermon: Sermon, books: Book[] | undefined): string | null {
  const text = sermon.passages.find((p) => p.role === "text");
  if (!text) return null;
  const book = books?.find((b) => b.id === text.book_id);
  if (!book) return null;
  const start = text.verse_start ?? 1;
  const end = text.verse_end ?? start;
  return end - start <= 2 && text.verse_start != null ? `${book.name} ${text.chapter}:${start}${end !== start ? `-${end}` : ""}` : `${book.name} ${text.chapter}:${start}`;
}

function inOrder(sermons: Sermon[] | undefined): Sermon[] {
  return [...(sermons ?? [])].sort(
    (a, b) => (a.series_order ?? 999) - (b.series_order ?? 999) || (a.preach_date ?? "").localeCompare(b.preach_date ?? ""),
  );
}

export function SeriesMemoryModal({ series, onClose }: { series: SermonSeries; onClose: () => void }) {
  const { data: books } = useBooks();
  const lookup = useBookLookup();
  const { data: sermons } = useSermons({ series_id: series.id, sort: "date" });
  const [saved, setSaved, { isLoaded }] = useSetting<Record<string, string>>(`series_memory_${series.id}`, {});
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const add = useAddToMemory();
  const [adding, setAdding] = useState(false);
  const [printing, setPrinting] = useState(false);

  const ordered = inOrder(sermons);
  // What each sermon's verse is: typed here, saved before, or its text.
  const verseFor = (s: Sermon) => chosen[s.id] ?? saved[s.id] ?? defaultMemoryVerse(s, books) ?? "";
  const rows = ordered.map((s) => {
    const ref = verseFor(s);
    const parsed = ref.trim() ? parseReference(ref, lookup) : null;
    return { sermon: s, ref, valid: !ref.trim() || (parsed != null && parsed.verse != null) };
  });
  const setName = `Series: ${series.title}`;

  function save() {
    const next = { ...saved };
    for (const r of rows) next[r.sermon.id] = r.ref.trim();
    setSaved(next);
  }

  async function addAll() {
    save();
    setAdding(true);
    let added = 0;
    for (const r of rows) {
      if (!r.ref.trim() || !r.valid) continue;
      const result = await add(r.ref, { setName, asPassage: false });
      if (result.ok) added++;
    }
    setAdding(false);
    toast.success(added ? `Added ${added} verse${added === 1 ? "" : "s"} to your Memory deck, in the set “${setName}”` : "They are all in your Memory deck already.");
  }

  return (
    <Modal
      title={`Memory verses for “${series.title}”`}
      onClose={onClose}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button
            disabled={!isLoaded || rows.every((r) => !r.ref.trim())}
            onClick={() => {
              save();
              setPrinting(true);
            }}
          >
            Print cards for the congregation
          </Button>
          <Button variant="primary" disabled={!isLoaded || adding || rows.some((r) => !r.valid)} onClick={() => void addAll()}>
            {adding ? "Adding…" : "Add them to my Memory deck"}
          </Button>
        </>
      }
    >
      {ordered.length === 0 ? (
        <p className="text-sm text-ink-2">This series has no sermons yet.</p>
      ) : (
        <>
          <p className="mb-3 text-sm text-ink-2">
            A verse a week, learned by the church as the series goes. Each starts as the sermon's text (or its first verse, for a long text); change
            any of them. Printing makes a sheet of cards, one per Sunday, to cut apart and hand out.
          </p>
          <ol className="space-y-2">
            {rows.map(({ sermon, ref, valid }, i) => (
              <li key={sermon.id} className="grid grid-cols-[1.5rem_1fr] items-center gap-x-2 gap-y-1 sm:grid-cols-[1.5rem_1fr_14rem]">
                <span className="text-xs tabular-nums text-ink-4">{i + 1}.</span>
                <span className="min-w-0 text-sm text-ink">
                  {sermon.title}
                  <span className="ml-2 text-xs text-ink-3">{formatPreachDate(sermon.preach_date, { month: "short", day: "numeric" })}</span>
                </span>
                <input
                  value={ref}
                  onChange={(e) => setChosen((c) => ({ ...c, [sermon.id]: e.target.value }))}
                  onBlur={save}
                  placeholder="No verse"
                  aria-label={`Memory verse for ${sermon.title}`}
                  className={cx(inputSmClass, "col-start-2 w-full sm:col-start-3", !valid && "border-danger")}
                />
              </li>
            ))}
          </ol>
          {rows.some((r) => !r.valid) && <p className="mt-2 text-xs text-danger">A verse is needed, like “Romans 8:28”.</p>}
        </>
      )}
      {printing && (
        <SeriesMemoryCards
          title={series.title}
          rows={rows.filter((r) => r.ref.trim() && r.valid).map((r) => ({ sermon: r.sermon, ref: r.ref }))}
          onDone={() => setPrinting(false)}
        />
      )}
    </Modal>
  );
}

/** The sheet of cards, mounted only for the print pass; prints itself once
 * the verses' words are in. */
function SeriesMemoryCards({ title, rows, onDone }: { title: string; rows: { sermon: Sermon; ref: string }[]; onDone: () => void }) {
  const lookup = useBookLookup();
  const refs = useMemo(
    () =>
      rows.map(({ ref }) => {
        const p = parseReference(ref, lookup);
        return p ? ({ book_id: p.book.id, chapter: p.chapter, verse_start: p.verse ?? 1, verse_end: p.verseEnd ?? p.verse ?? 1 } as PassageRef) : null;
      }),
    [rows, lookup],
  );
  const { byKey } = usePassages(refs.filter((r): r is PassageRef => r != null));
  const texts = refs.map((r) => (r ? byKey.get(refKey(r))?.verses.map((v) => memoryWords(v.text)).join(" ") : undefined));
  const ready = texts.every((t) => t != null);

  useEffect(() => {
    if (!ready) return;
    const id = requestAnimationFrame(() => {
      window.print();
      onDone();
    });
    return () => cancelAnimationFrame(id);
  }, [ready, onDone]);

  return createPortal(
    <div className="print-root print-only" aria-hidden="true">
      <div style={{ fontFamily: "Georgia, serif", padding: "0.4in", color: "#000", fontSize: "11pt", lineHeight: 1.35 }}>
        <h1 style={{ fontSize: "16pt", margin: "0 0 10pt" }}>{title}: memory verses</h1>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0" }}>
          {rows.map(({ sermon, ref }, i) => (
            <div key={sermon.id} style={{ border: "1px dashed #999", padding: "12pt", breakInside: "avoid", minHeight: "1.6in" }}>
              <div style={{ fontSize: "8.5pt", color: "#555", marginBottom: "4pt" }}>
                {formatPreachDate(sermon.preach_date, { month: "long", day: "numeric" })}
                {sermon.preach_date ? " · " : ""}
                {sermon.title}
              </div>
              <div style={{ fontWeight: "bold", marginBottom: "4pt" }}>{ref}</div>
              <div>{texts[i]}</div>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
