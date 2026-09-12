import { useMemo } from "react";
import { useBooks, usePassagesIn } from "../../api/queries";
import { ManuscriptView } from "./ManuscriptView";
import { outlineOf, passageBlocks, sectionsOf } from "./editor/documentModel";
import { buildHandout } from "./handout";
import { cx } from "../../components/ui/classes";
import { formatPreachDate, passageLabel, sermonTextLabel } from "./sermonFormat";
import type { Passage, Sermon } from "../../api/types";

/**
 * Everything a sermon prints (SB4.2, SB4.3), rendered into a
 * `.print-root.print-only` region the way the prayer list's printable copy
 * is: on screen it is hidden, and `window.print()` shows it alone.
 *
 * Three shapes: the manuscript (the whole thing, passages as set-apart
 * quotes), the outline (headings, their passages, and the first line of
 * each section), and the handout (SB4.3).
 */

export type PrintShape = "manuscript" | "outline" | "handout" | "handout-key";

/** What the reader has chosen for the sheet (SermonActionsMenu holds these,
 * stored with the data). */
export interface HandoutPrintOptions {
  /** Ruled lines after each point; the discussion section gets two more. */
  noteLines: number;
  /** Print the verses themselves under each reference, not the reference alone. */
  includePassageText: boolean;
}

const HANDOUT_DEFAULTS: HandoutPrintOptions = { noteLines: 2, includePassageText: false };

export function SermonPrintRegion({
  sermon,
  shape,
  handout = HANDOUT_DEFAULTS,
}: {
  sermon: Sermon;
  shape: PrintShape;
  handout?: HandoutPrintOptions;
}) {
  const { data: books } = useBooks();
  const refs = useMemo(() => passageBlocks(sermon.body), [sermon.body]);
  const { byKey } = usePassagesIn(sermon.translation_id, refs);

  return (
    <div className="print-root print-only sermon-print" aria-hidden="true">
      <SermonPrintHeader sermon={sermon} books={books} />
      {shape === "manuscript" && <ManuscriptView html={sermon.body} passages={byKey} />}
      {shape === "outline" && <OutlinePrint sermon={sermon} books={books} />}
      {(shape === "handout" || shape === "handout-key") && (
        <HandoutPrint sermon={sermon} passages={byKey} answerKey={shape === "handout-key"} options={handout} />
      )}
    </div>
  );
}

function SermonPrintHeader({ sermon, books }: { sermon: Sermon; books: ReturnType<typeof useBooks>["data"] }) {
  const text = sermonTextLabel(books, sermon);
  const line = [formatPreachDate(sermon.preach_date), sermon.venue, sermon.preacher].filter(Boolean).join(" · ");
  return (
    <header className="sermon-print-header">
      <h1>{sermon.title}</h1>
      {sermon.big_idea && <p className="sermon-print-idea">{sermon.big_idea}</p>}
      {text && <p className="sermon-print-text">{text}</p>}
      {line && <p className="sermon-print-line">{line}</p>}
    </header>
  );
}

/** The outline on paper: each point, the passages inside it, and the first
 * line of what it says -- the sheet a preacher takes up with him when the
 * manuscript stays in the study. */
function OutlinePrint({ sermon, books }: { sermon: Sermon; books: ReturnType<typeof useBooks>["data"] }) {
  const sections = useMemo(() => sectionsOf(sermon.body), [sermon.body]);
  const headings = useMemo(() => outlineOf(sermon.body), [sermon.body]);
  if (headings.length === 0) return <p>This sermon has no points yet.</p>;

  return (
    <ol className="sermon-print-outline">
      {sections.map((section, i) => {
        if (!section.heading) return null;
        const refs = passageBlocks(section.html);
        // `section.text` opens with the heading's own words, which the row
        // already prints; the first line is what comes after it.
        const heading = section.heading.text;
        const prose = section.text.startsWith(heading) ? section.text.slice(heading.length).trim() : section.text;
        const firstLine = prose.split(/(?<=[.?!])\s/)[0] ?? "";
        return (
          <li key={i} className={section.heading.level === 3 ? "sub" : undefined}>
            <span className="heading">{section.heading.text || "Untitled point"}</span>
            {refs.length > 0 && (
              <span className="refs">
                {refs.map((r) => passageLabel(books, { book_id: r.book_id, chapter: r.chapter, verse_start: r.verse_start, verse_end: r.verse_end })).join("; ")}
              </span>
            )}
            {firstLine && <span className="first-line">{firstLine}</span>}
          </li>
        );
      })}
    </ol>
  );
}

/** The fill-in handout (SB4.3). The sheet itself is a pure function of the
 * saved manuscript (handout.ts); this only lays out what comes back. */
function HandoutPrint({
  sermon,
  passages,
  answerKey,
  options,
}: {
  sermon: Sermon;
  passages: Map<string, Passage>;
  answerKey: boolean;
  options: HandoutPrintOptions;
}) {
  const { data: books } = useBooks();
  const passageText = useMemo(() => {
    const map = new Map<string, string>();
    for (const [key, passage] of passages) map.set(key, passage.text);
    return map;
  }, [passages]);
  const handout = useMemo(
    () =>
      buildHandout(sermon, {
        answerKey,
        books,
        passageText,
        noteLines: options.noteLines,
        includePassageText: options.includePassageText,
      }),
    [sermon, answerKey, books, passageText, options.noteLines, options.includePassageText],
  );

  return (
    <div className="sermon-handout">
      {handout.sections.map((section, i) => (
        <section key={i} className={cx("handout-section", section.isDiscussion && "handout-discussion")}>
          {section.heading && (
            <h2 className={section.level === 3 ? "sub" : undefined}>{section.heading}</h2>
          )}
          {section.references.length > 0 && <p className="handout-refs">{section.references.join("; ")}</p>}
          <div className="sermon-html" dangerouslySetInnerHTML={{ __html: section.html }} />
          <div className="handout-lines" aria-hidden="true">
            {Array.from({ length: section.noteLines }, (_, n) => (
              <span key={n} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
