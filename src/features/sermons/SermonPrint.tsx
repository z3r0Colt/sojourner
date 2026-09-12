import { useMemo } from "react";
import { useBooks, usePassagesIn } from "../../api/queries";
import { ManuscriptView } from "./ManuscriptView";
import { outlineOf, passageBlocks, sectionsOf } from "./editor/documentModel";
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

export function SermonPrintRegion({ sermon, shape }: { sermon: Sermon; shape: PrintShape }) {
  const { data: books } = useBooks();
  const refs = useMemo(() => passageBlocks(sermon.body), [sermon.body]);
  const { byKey } = usePassagesIn(sermon.translation_id, refs);

  return (
    <div className="print-root print-only sermon-print" aria-hidden="true">
      <SermonPrintHeader sermon={sermon} books={books} />
      {shape === "manuscript" && <ManuscriptView html={sermon.body} passages={byKey} />}
      {shape === "outline" && <OutlinePrint sermon={sermon} books={books} />}
      {(shape === "handout" || shape === "handout-key") && (
        <HandoutPrint sermon={sermon} passages={byKey} answerKey={shape === "handout-key"} />
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
        const firstLine = section.text.split(/(?<=[.?!])\s/)[0] ?? "";
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

/** The fill-in handout (SB4.3): the points with every blanked word replaced
 * by a rule, passages by reference, the discussion questions if the sermon
 * has any, and lines to write on. */
function HandoutPrint({ sermon, passages, answerKey }: { sermon: Sermon; passages: Map<string, Passage>; answerKey: boolean }) {
  const { data: books } = useBooks();
  const sections = useMemo(() => sectionsOf(sermon.body), [sermon.body]);
  const discussion = sections.find((s) => /discussion/i.test(s.heading?.text ?? ""));

  return (
    <div className="sermon-handout">
      {sections.map((section, i) => {
        if (section === discussion) return null;
        const refs = passageBlocks(section.html);
        return (
          <section key={i} className="handout-section">
            {section.heading && (
              <h2 className={section.heading.level === 3 ? "sub" : undefined}>{section.heading.text}</h2>
            )}
            {refs.length > 0 && (
              <p className="handout-refs">
                {refs.map((r) => passageLabel(books, { book_id: r.book_id, chapter: r.chapter, verse_start: r.verse_start, verse_end: r.verse_end })).join("; ")}
              </p>
            )}
            <HandoutBody html={section.html} passages={passages} answerKey={answerKey} />
            <div className="handout-lines" aria-hidden="true">
              <span />
              <span />
            </div>
          </section>
        );
      })}

      {discussion && (
        <section className="handout-section handout-discussion">
          <h2>{discussion.heading?.text}</h2>
          <HandoutBody html={discussion.html} passages={passages} answerKey={answerKey} />
          <div className="handout-lines" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </div>
        </section>
      )}
    </div>
  );
}

/** A section's prose with its blanks drawn as rules (or, for the preacher's
 * own copy, as the answer key) and its passage blocks left to their
 * reference, which the header above already names. */
function HandoutBody({ html, passages, answerKey }: { html: string; passages: Map<string, Passage>; answerKey: boolean }) {
  const withoutHeading = useMemo(() => html.replace(/^<h[23][^>]*>.*?<\/h[23]>/i, ""), [html]);
  const withoutPassages = useMemo(
    () => withoutHeading.replace(/<div data-type="passage"[^>]*><\/div>/g, ""),
    [withoutHeading],
  );
  return <ManuscriptView html={withoutPassages} passages={passages} blanksAs={answerKey ? "key" : "rule"} />;
}
