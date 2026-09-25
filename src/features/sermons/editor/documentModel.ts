// Reading a saved manuscript without running the editor.
//
// The two custom nodes write plain data attributes (see extensions.ts), so
// the saved HTML is self-describing: the pane derives the sermon's passages
// and sources from it on every save, the outline panel reads its headings,
// and the handout and slide generators read the same markup. Everything
// here is a pure function of the HTML string, which keeps those features
// testable and keeps one definition of what the document means.

import type { PassageRef, SermonPassageInput, SermonSourceInput, SermonSourceKind } from "../../../api/types";

/** Parses a manuscript into a document the browser can walk. The editor's
 * output is well-formed, and DOMParser is what tiptap itself uses. */
export function parseManuscript(html: string): Document {
  return new DOMParser().parseFromString(`<div id="sermon-root">${html ?? ""}</div>`, "text/html");
}

function rootOf(html: string): HTMLElement {
  return parseManuscript(html).getElementById("sermon-root") as HTMLElement;
}

/** A passage block's reference, read from its data attributes. */
export function refOfElement(el: Element): PassageRef | null {
  const bookId = Number(el.getAttribute("data-book-id"));
  const chapter = Number(el.getAttribute("data-chapter"));
  if (!bookId || !chapter) return null;
  const start = Number(el.getAttribute("data-verse-start")) || 1;
  const end = Number(el.getAttribute("data-verse-end")) || start;
  return { book_id: bookId, chapter, verse_start: start, verse_end: Math.max(start, end) };
}

/** Every passage block in the manuscript, in document order. */
export function passageBlocks(html: string): PassageRef[] {
  return Array.from(rootOf(html).querySelectorAll('[data-type="passage"]'))
    .map(refOfElement)
    .filter((r): r is PassageRef => r !== null);
}

/** The passage blocks pinned to a translation of their own (a comparison),
 * with that translation: their words are not the sermon translation's, so
 * every read-only view has to fetch them separately. */
export function pinnedPassageBlocks(html: string): { ref: PassageRef; translationId: number }[] {
  const out: { ref: PassageRef; translationId: number }[] = [];
  for (const el of Array.from(rootOf(html).querySelectorAll('[data-type="passage"][data-translation-id]'))) {
    const ref = refOfElement(el);
    const translationId = Number(el.getAttribute("data-translation-id"));
    if (ref && translationId) out.push({ ref, translationId });
  }
  return out;
}

/** Every citation in the manuscript, in document order. */
export function sourceBlocks(html: string): SermonSourceInput[] {
  return Array.from(rootOf(html).querySelectorAll('[data-type="source"]')).map((el) => ({
    kind: ((el.getAttribute("data-kind") as SermonSourceKind) || "resource") as SermonSourceKind,
    ref_id: el.getAttribute("data-ref-id"),
    label: el.getAttribute("data-label") ?? "",
    excerpt: (el.textContent ?? "").trim().slice(0, 600) || null,
  }));
}

export interface OutlineEntry {
  /** 2 for a point, 3 for a sub-point. */
  level: number;
  text: string;
  /** Index among all headings, which is also the section's index. */
  index: number;
}

/** The h2 points and h3 sub-points, in order -- the sermon's outline, which
 * is the manuscript's own headings and nothing else (Q3). Only the
 * document's own top-level headings count, which is what `sectionsOf` splits
 * on: a heading written inside a quotation is part of the quotation, not a
 * point of the sermon, and counting it here would put this list, the prep
 * track's points, and the printed outline out of step with the sections. */
export function outlineOf(html: string): OutlineEntry[] {
  return Array.from(rootOf(html).querySelectorAll(":scope > h2, :scope > h3")).map((el, index) => ({
    level: el.tagName === "H2" ? 2 : 3,
    text: (el.textContent ?? "").trim(),
    index,
  }));
}

export interface ManuscriptSection {
  heading: OutlineEntry | null;
  /** The section's own HTML, heading included. */
  html: string;
  /** Plain text of the section, passage blocks excluded. */
  text: string;
}

/** The manuscript split at its headings: an opening section with no heading
 * (when the document starts with prose), then one per heading. Preaching
 * mode pages through these, and the slide generator makes one slide a
 * section. */
export function sectionsOf(html: string): ManuscriptSection[] {
  const root = rootOf(html);
  const sections: ManuscriptSection[] = [];
  let current: { heading: OutlineEntry | null; nodes: Element[] } = { heading: null, nodes: [] };
  let headingIndex = 0;

  const flush = () => {
    if (!current.heading && current.nodes.length === 0) return;
    const holder = root.ownerDocument.createElement("div");
    for (const node of current.nodes) holder.appendChild(node.cloneNode(true));
    sections.push({
      heading: current.heading,
      html: holder.innerHTML,
      text: plainTextOf(holder),
    });
  };

  for (const child of Array.from(root.children)) {
    if (child.tagName === "H2" || child.tagName === "H3") {
      flush();
      const heading: OutlineEntry = {
        level: child.tagName === "H2" ? 2 : 3,
        text: (child.textContent ?? "").trim(),
        index: headingIndex++,
      };
      current = { heading, nodes: [child] };
    } else {
      current.nodes.push(child);
    }
  }
  flush();
  return sections;
}

/** Text of an element with the passage blocks left out -- they hold no words
 * of their own, so counting or reading them here would count nothing. */
function plainTextOf(el: Element): string {
  const clone = el.cloneNode(true) as Element;
  for (const passage of Array.from(clone.querySelectorAll('[data-type="passage"]'))) passage.remove();
  return (clone.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** The manuscript's own words: everything the writer typed, with passage
 * blocks excluded (SB1.7 adds their rendered length separately). */
export function manuscriptText(html: string): string {
  return plainTextOf(rootOf(html));
}

/** Words in a run of text, counted the way a preacher would: anything with a
 * letter or digit in it. */
export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/** Every word or phrase marked as a blank (SB4.3), in document order. */
export function blanksOf(html: string): string[] {
  return Array.from(rootOf(html).querySelectorAll("span[data-blank]"))
    .map((el) => (el.textContent ?? "").trim())
    .filter(Boolean);
}

/** The HTML of one passage block, as the editor writes it -- used by "Send
 * to sermon" and the templates, which build markup rather than commands. */
export function passageBlockHtml(ref: PassageRef): string {
  return (
    `<div data-type="passage" data-book-id="${ref.book_id}" data-chapter="${ref.chapter}"` +
    ` data-verse-start="${ref.verse_start}" data-verse-end="${ref.verse_end}"></div>`
  );
}

/** The passages a sermon should store, given its text passages (from the
 * header) and its body: the header's as `text`, the body's blocks as
 * `supporting`, and references typed in prose as `mentioned`, with anything
 * already covered by a stronger role left out so a sermon is never listed
 * twice for one chapter. */
export function derivePassages(
  html: string,
  textRefs: PassageRef[],
  mentioned: PassageRef[],
): SermonPassageInput[] {
  const out: SermonPassageInput[] = [];
  const seen = new Set<string>();
  const add = (role: SermonPassageInput["role"], ref: PassageRef, keyOf: (r: PassageRef) => string) => {
    const key = keyOf(ref);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      role,
      book_id: ref.book_id,
      chapter: ref.chapter,
      verse_start: ref.verse_start,
      verse_end: ref.verse_end,
    });
  };
  const exact = (r: PassageRef) => `${r.book_id}:${r.chapter}:${r.verse_start}:${r.verse_end}`;

  for (const ref of textRefs) add("text", ref, exact);
  for (const ref of passageBlocks(html)) add("supporting", ref, exact);
  for (const ref of mentioned) add("mentioned", ref, exact);
  return out;
}

// --- Moving a point ---------------------------------------------------------
//
// The outline is the headings (Q3), so moving a point is moving blocks of the
// manuscript itself: the heading and everything under it, up to the next
// heading of the same rank or higher. These functions work on the top-level
// blocks as a list of heading levels, so they can be tested without an
// editor; editor/moveSection.ts applies what they return as one transaction.

/** A top-level block: 2 or 3 for a point or sub-point, null for anything else. */
export type BlockLevel = 2 | 3 | null;

/** Where to drop a section, relative to the heading it is dropped on. */
export type DropSide = "before" | "after";

export interface SectionMove {
  /** The moving blocks, as `[start, end)` block indexes. */
  start: number;
  end: number;
  /** The block index it goes in front of, counted before anything moves. */
  insertAt: number;
}

/** The manuscript's top-level blocks as heading levels, the list the
 * functions below take. */
export function blockLevels(html: string): BlockLevel[] {
  return Array.from(rootOf(html).children).map((el) => (el.tagName === "H2" ? 2 : el.tagName === "H3" ? 3 : null));
}

/**
 * Where a move's drop line belongs in the Outline: before the heading the
 * section will land in front of, or after the last heading when it lands at
 * the end. Drawn from the move rather than the pointer, because a point
 * dropped on the lower half of another point's row lands after that point's
 * sub-points, not under its heading.
 */
export function dropLineFor(blocks: readonly BlockLevel[], move: SectionMove): { index: number; side: DropSide } {
  let headingIndex = 0;
  let last = -1;
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i] == null) continue;
    if (i >= move.insertAt) return { index: headingIndex, side: "before" };
    last = headingIndex;
    headingIndex += 1;
  }
  return { index: last, side: "after" };
}

/** Block index of the `headingIndex`-th heading, or -1. */
function blockOfHeading(blocks: readonly BlockLevel[], headingIndex: number): number {
  let seen = -1;
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i] != null && ++seen === headingIndex) return i;
  }
  return -1;
}

/** The end (exclusive) of the section starting at block `at`: the next
 * heading at `stopLevel` or higher rank, or the end of the document. */
function sectionEnd(blocks: readonly BlockLevel[], at: number, stopLevel: 2 | 3): number {
  for (let i = at + 1; i < blocks.length; i++) {
    const level = blocks[i];
    if (level != null && level <= stopLevel) return i;
  }
  return blocks.length;
}

/**
 * The move that puts heading `from`'s section before or after heading
 * `target`, or null when it would change nothing or cannot be done (a
 * section dropped inside itself).
 *
 * A point only moves among points: dropped on a sub-point, it lands before
 * or after the point that sub-point belongs to, so it can never split
 * another point's sub-points off from it. A sub-point may go anywhere; after
 * a point, it becomes that point's first sub-point, which is where the drop
 * line is drawn.
 */
export function sectionMove(blocks: readonly BlockLevel[], from: number, target: number, side: DropSide): SectionMove | null {
  const start = blockOfHeading(blocks, from);
  let targetBlock = blockOfHeading(blocks, target);
  if (start < 0 || targetBlock < 0) return null;
  const level = blocks[start] as 2 | 3;
  const end = sectionEnd(blocks, start, level);

  if (level === 2 && blocks[targetBlock] === 3) {
    // The sub-point's own point, when it has one.
    for (let i = targetBlock - 1; i >= 0; i--) {
      if (blocks[i] === 2) {
        targetBlock = i;
        break;
      }
    }
  }
  const targetLevel = blocks[targetBlock] as 2 | 3;
  const insertAt = side === "before" ? targetBlock : sectionEnd(blocks, targetBlock, Math.max(targetLevel, level) as 2 | 3);
  if (insertAt >= start && insertAt <= end) return null;
  return { start, end, insertAt };
}

/**
 * Where "move up" or "move down" takes heading `from`: past the neighboring
 * section of the same rank, for a point; past the neighboring heading of any
 * rank, for a sub-point -- so a sub-point steps through its own point's
 * sub-points and then over into the next point. Null at either end.
 */
export function neighborMove(blocks: readonly BlockLevel[], from: number, direction: -1 | 1): SectionMove | null {
  const start = blockOfHeading(blocks, from);
  if (start < 0) return null;
  const level = blocks[start] as 2 | 3;
  const headings = blocks.flatMap((l, i) => (l == null ? [] : [{ level: l, block: i }]));
  let at = from + direction;
  // A point skips over sub-points to the next point.
  while (level === 2 && at >= 0 && at < headings.length && headings[at].level !== 2) at += direction;
  if (at < 0 || at >= headings.length) return null;
  // Moving down means going after the next section, not merely after its
  // heading: for a point that is the next point's whole section.
  return sectionMove(blocks, from, at, direction < 0 ? "before" : "after");
}

/** Applies a move to a list, for tests and for anything that holds the
 * blocks as an array. */
export function applySectionMove<T>(items: readonly T[], move: SectionMove): T[] {
  const moving = items.slice(move.start, move.end);
  const rest = [...items.slice(0, move.start), ...items.slice(move.end)];
  const at = move.insertAt > move.start ? move.insertAt - (move.end - move.start) : move.insertAt;
  return [...rest.slice(0, at), ...moving, ...rest.slice(at)];
}
