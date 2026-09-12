import { parseManuscript, sectionsOf } from "./editor/documentModel";
import { passageLabel } from "./sermonFormat";
import type { Book, Passage, PassageRef, Sermon } from "../../api/types";

/**
 * Slides (SB4.4), generated rather than hand-built.
 *
 * A preacher who has to build slides by hand builds them badly and late.
 * The manuscript already says everything a deck needs: the title slide is
 * the header, each point is a slide with its sub-points as bullets, each
 * passage block is a slide of Scripture, and a short quotation or
 * illustration is worth a slide of its own. Long passages are split so the
 * words never shrink past reading size on a screen at the back of a room.
 *
 * A pure function, so the in-app show and the .pptx exporter consume the
 * same list and can never drift apart.
 */

/** Past this many words a passage is split across slides. */
const PASSAGE_WORDS_PER_SLIDE = 90;
/** A citation longer than this is left in the manuscript, not projected. */
const MAX_QUOTE_WORDS = 70;

export type SlideKind = "title" | "point" | "passage" | "quote";

export interface Slide {
  kind: SlideKind;
  /** The large line: the sermon's title, the point, or the reference. */
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
    for (const slide of passageSlides(section.html, options)) slides.push(slide);
    for (const slide of quoteSlides(section.html)) slides.push(slide);
  }

  return slides;
}

/** The h3s that belong to the h2 at `index`, in document order. */
function subPointsAfter(body: string, index: number): string[] {
  const root = parseManuscript(body).getElementById("sermon-root");
  if (!root) return [];
  const headings = Array.from(root.querySelectorAll("h2, h3"));
  const out: string[] = [];
  for (let i = index + 1; i < headings.length; i++) {
    if (headings[i].tagName === "H2") break;
    const text = (headings[i].textContent ?? "").trim();
    if (text) out.push(text);
  }
  return out;
}

function passageSlides(html: string, options: SlideOptions): Slide[] {
  const root = parseManuscript(html).getElementById("sermon-root");
  if (!root) return [];
  const out: Slide[] = [];
  for (const block of Array.from(root.querySelectorAll('[data-type="passage"]'))) {
    const ref = refOf(block);
    if (!ref) continue;
    const label = passageLabel(options.books, {
      book_id: ref.book_id,
      chapter: ref.chapter,
      verse_start: ref.verse_start,
      verse_end: ref.verse_end,
    });
    const text = options.passages?.get(`${ref.book_id}:${ref.chapter}:${ref.verse_start}:${ref.verse_end}`)?.text ?? "";
    const parts = splitForSlides(text, PASSAGE_WORDS_PER_SLIDE);
    if (parts.length === 0) {
      out.push({ kind: "passage", heading: label });
      continue;
    }
    parts.forEach((part, i) =>
      out.push({
        kind: "passage",
        heading: label,
        body: part,
        part: parts.length > 1 ? { index: i + 1, total: parts.length } : undefined,
      }),
    );
  }
  return out;
}

function quoteSlides(html: string): Slide[] {
  const root = parseManuscript(html).getElementById("sermon-root");
  if (!root) return [];
  const out: Slide[] = [];
  for (const block of Array.from(root.querySelectorAll('[data-type="source"]'))) {
    const body = (block.textContent ?? "").replace(/\s+/g, " ").trim();
    // Only what a congregation could actually read off a screen.
    if (!body || countWords(body) > MAX_QUOTE_WORDS) continue;
    out.push({ kind: "quote", heading: body, subheading: block.getAttribute("data-label") ?? undefined });
  }
  return out;
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
