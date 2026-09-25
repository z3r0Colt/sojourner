import { parseManuscript, sectionsOf } from "./editor/documentModel";
import { passageLabel } from "./sermonFormat";
import type { Book, Passage, PassageRef, Sermon } from "../../api/types";

/**
 * Slides (SB4.4), generated rather than hand-built.
 *
 * A preacher who has to build slides by hand builds them badly and late.
 * The manuscript already says everything a deck needs: the title slide is
 * the header, each point is a slide with its sub-points as bullets, each
 * passage block is a slide of Scripture, a short quotation or illustration
 * is worth a slide of its own, and words the writer marked for the screen
 * (Ctrl+Shift+L) are a slide where they fall. Long passages are split so the
 * words never shrink past reading size on a screen at the back of a room.
 *
 * A pure function, so the in-app show and the .pptx exporter consume the
 * same list and can never drift apart.
 */

/** Past this many words a passage is split across slides. */
const PASSAGE_WORDS_PER_SLIDE = 90;
/** A citation longer than this is left in the manuscript, not projected. */
const MAX_QUOTE_WORDS = 70;

export type SlideKind = "title" | "point" | "passage" | "quote" | "line";

export interface Slide {
  kind: SlideKind;
  /** The large line: the sermon's title, the point, the reference, the
   * quotation, or the marked words. */
  heading: string;
  /** The smaller line under it: the big idea, the text, the source. */
  subheading?: string;
  /** Bullets, for a point's sub-points. */
  bullets?: string[];
  /** Running text, for a passage or a quotation. */
  body?: string;
  /** "2 of 3", when one passage runs across several slides. */
  part?: { index: number; total: number };
}

export interface SlideOptions {
  books?: Book[];
  /** Rendered passages by `refKey`, so a passage slide holds the words. */
  passages?: Map<string, Passage>;
  /** The date and church, for the title slide. */
  includeDetails?: boolean;
}

export function buildSlides(sermon: Sermon, options: SlideOptions = {}): Slide[] {
  const slides: Slide[] = [];
  const texts = sermon.passages
    .filter((p) => p.role === "text")
    .map((p) => passageLabel(options.books, p))
    .join("; ");

  slides.push({
    kind: "title",
    heading: sermon.title,
    subheading: sermon.big_idea?.trim() || texts || undefined,
    bullets: [texts && sermon.big_idea ? texts : "", options.includeDetails !== false ? [sermon.preach_date, sermon.venue].filter(Boolean).join(" · ") : ""].filter(
      Boolean,
    ) as string[],
  });

  for (const section of sectionsOf(sermon.body)) {
    // A point becomes a slide; its sub-points are its bullets, so a
    // three-point sermon projects as three slides and not thirty.
    if (section.heading?.level === 2) {
      slides.push({ kind: "point", heading: section.heading.text, bullets: subPointsAfter(sermon.body, section.heading.index) });
    }
    for (const slide of sectionBodySlides(section.html, options)) slides.push(slide);
  }

  return slides;
}

/** The h3s that belong to the h2 at `index`, in document order. Only the
 * manuscript's own top-level headings count, as in `sectionsOf`, whose
 * numbering `index` is: a heading inside a quotation is not a sub-point. */
function subPointsAfter(body: string, index: number): string[] {
  const root = parseManuscript(body).getElementById("sermon-root");
  if (!root) return [];
  const headings = Array.from(root.querySelectorAll(":scope > h2, :scope > h3"));
  const out: string[] = [];
  for (let i = index + 1; i < headings.length; i++) {
    if (headings[i].tagName === "H2") break;
    const text = (headings[i].textContent ?? "").trim();
    if (text) out.push(text);
  }
  return out;
}

/**
 * A section's passages, quotations, and marked words, as slides in the
 * order they come in the manuscript -- so a line marked just before a
 * passage is shown before it, as it will be said.
 */
function sectionBodySlides(html: string, options: SlideOptions): Slide[] {
  const root = parseManuscript(html).getElementById("sermon-root");
  if (!root) return [];
  const found: { at: Node; slides: Slide[] }[] = [];

  for (const block of Array.from(root.querySelectorAll('[data-type="passage"]'))) {
    found.push({ at: block, slides: passageSlides(block, options) });
  }
  const projectedQuotes = new Set<Element>();
  for (const block of Array.from(root.querySelectorAll('[data-type="source"]'))) {
    const slide = quoteSlide(block);
    if (!slide) continue;
    projectedQuotes.add(block);
    found.push({ at: block, slides: [slide] });
  }
  for (const run of markedRuns(root)) {
    // A quotation already on the screen whole needs no second slide for a
    // part of it.
    const quote = run.first.parentElement?.closest('[data-type="source"]');
    if (quote && projectedQuotes.has(quote)) continue;
    found.push({ at: run.first, slides: splitForSlides(run.text, MAX_QUOTE_WORDS).map((part) => ({ kind: "line" as const, heading: part })) });
  }

  found.sort((a, b) => (a.at === b.at ? 0 : a.at.compareDocumentPosition(b.at) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  return found.flatMap((f) => f.slides);
}

function passageSlides(block: Element, options: SlideOptions): Slide[] {
  const ref = refOf(block);
  if (!ref) return [];
  const label = passageLabel(options.books, {
    book_id: ref.book_id,
    chapter: ref.chapter,
    verse_start: ref.verse_start,
    verse_end: ref.verse_end,
  });
  const text = options.passages?.get(`${ref.book_id}:${ref.chapter}:${ref.verse_start}:${ref.verse_end}`)?.text ?? "";
  const parts = splitForSlides(text, PASSAGE_WORDS_PER_SLIDE);
  if (parts.length === 0) return [{ kind: "passage", heading: label }];
  return parts.map((part, i) => ({
    kind: "passage",
    heading: label,
    body: part,
    part: parts.length > 1 ? { index: i + 1, total: parts.length } : undefined,
  }));
}

function quoteSlide(block: Element): Slide | null {
  const body = (block.textContent ?? "").replace(/\s+/g, " ").trim();
  // Only what a congregation could actually read off a screen.
  if (!body || countWords(body) > MAX_QUOTE_WORDS) return null;
  return { kind: "quote", heading: body, subheading: block.getAttribute("data-label") ?? undefined };
}

/** The blocks a run of marked words cannot cross: two marked sentences in
 * one paragraph with plain words between them are two slides, and a mark
 * that ends one paragraph and starts the next is two as well. */
const TEXT_BLOCK = "p, li, h1, h2, h3, h4, h5, h6, pre";

/**
 * The runs of words marked for the screen, in document order.
 *
 * A run is not one `<span data-slide>`: the editor splits a mark wherever
 * another one starts or stops, so "Look <b>up</b>" marked as a whole saves
 * as two spans. Walking the text instead joins every marked piece up to the
 * first unmarked word or the end of the paragraph.
 */
export function markedRuns(root: Element): { first: Node; text: string }[] {
  const runs: { first: Node; text: string }[] = [];
  let current: { first: Node; text: string; block: Element | null } | null = null;
  const flush = () => {
    const text = current?.text.replace(/\s+/g, " ").trim();
    if (current && text) runs.push({ first: current.first, text });
    current = null;
  };

  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      // A line break inside a run is a space on the slide, not a join.
      if ((node as Element).tagName === "BR" && current) current.text += " ";
      continue;
    }
    const parent = node.parentElement;
    const marked = parent?.closest("[data-slide]") != null;
    const block = parent?.closest(TEXT_BLOCK) ?? null;
    const blank = !(node.textContent ?? "").trim();
    if (current && block !== current.block) flush();
    if (marked) {
      if (current) current.text += node.textContent ?? "";
      else current = { first: node, text: node.textContent ?? "", block };
    } else if (!blank) {
      flush();
    } else if (current) {
      current.text += node.textContent ?? "";
    }
  }
  flush();
  return runs;
}

/** Splits running text at sentence ends into runs of at most `max` words. */
export function splitForSlides(text: string, max: number): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  if (countWords(clean) <= max) return [clean];
  const sentences = clean.split(/(?<=[.?!])\s+/);
  const out: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (current && countWords(candidate) > max) {
      out.push(current);
      current = sentence;
    } else {
      current = candidate;
    }
  }
  if (current) out.push(current);
  // One sentence longer than a whole slide still has to break somewhere.
  return out.flatMap((part) => (countWords(part) <= max * 1.5 ? [part] : chunkWords(part, max)));
}

function chunkWords(text: string, max: number): string[] {
  const words = text.split(/\s+/);
  const out: string[] = [];
  for (let i = 0; i < words.length; i += max) out.push(words.slice(i, i + max).join(" "));
  return out;
}

function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function refOf(el: Element): PassageRef | null {
  const bookId = Number(el.getAttribute("data-book-id"));
  const chapter = Number(el.getAttribute("data-chapter"));
  if (!bookId || !chapter) return null;
  const start = Number(el.getAttribute("data-verse-start")) || 1;
  const end = Number(el.getAttribute("data-verse-end")) || start;
  return { book_id: bookId, chapter, verse_start: start, verse_end: Math.max(start, end) };
}
