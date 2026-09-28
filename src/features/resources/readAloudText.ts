import type { TtsSegment } from "../../state/ttsStore";
import { cleanForSpeech, splitForSpeech, tokenizeWords } from "../tts/textUtils";

/**
 * Read-aloud for a library book, from what the reader actually shows.
 *
 * Until this, a book was read aloud from its extracted text -- the copy kept
 * for searching, with every run of whitespace squeezed to one space. For 260
 * of the 271 books in the library that left no paragraph breaks at all, so a
 * whole book (eight million characters, in the case of Edwards' second
 * volume) went to the voice as one "paragraph": the neural voice's phonemizer
 * gave up on it and took its task down with it, and when it did not, reading
 * began at the book's first word however far in the reader was.
 *
 * So the text now comes from the page. An EPUB section is read block by
 * block (a paragraph, a heading, a list item); a PDF page is rebuilt into
 * lines and paragraphs from pdf.js's text runs; a MOBI's text is cut into
 * the pieces it is displayed as. Every block is then cut into sentence-sized
 * pieces by `splitForSpeech`, and every piece is given an id that says where
 * it came from, so the reader can start anywhere, the page can follow the
 * voice, and a click on a paragraph can move the voice there.
 *
 * Everything here is pure: given a document, a list of rectangles or a list
 * of text runs, it answers without laying anything out. What needs layout
 * (where a block is on screen) is measured by the readers and handed in.
 */

/** Where the reader asked the voice to begin: the page on screen, or the
 * paragraph where their selection starts. */
export type ReadAloudFrom = "page" | "selection";

/** What the reader sidebar can ask the book on screen to do about reading
 * aloud. Each reader (EPUB, PDF, MOBI) fills one in while it is mounted. */
export interface ResourceReadAloudHandle {
  readAloud: (from: ReadAloudFrom) => void;
}

// ---------------------------------------------------------------------------
// Segment ids. A piece's id names its place in the book, so it stays the same
// however the reading was started and whichever order sections loaded in:
//   e:<spine index>:<block>:<piece>   an EPUB section's block
//   p:<page>:<paragraph>:<piece>      a PDF page's paragraph
//   m:<piece>                         a MOBI's text, piece by piece

export type SpeechIdKind = "e" | "p" | "m";

export interface SpeechId {
  kind: SpeechIdKind;
  parts: number[];
}

export function parseSpeechId(id: string | number): SpeechId | null {
  if (typeof id !== "string") return null;
  const [kind, ...rest] = id.split(":");
  if (kind !== "e" && kind !== "p" && kind !== "m") return null;
  const parts = rest.map(Number);
  if (parts.length === 0 || parts.some((n) => !Number.isInteger(n) || n < 0)) return null;
  return { kind, parts };
}

/**
 * Where loading goes on for a reading taken over from the reader before
 * this one: the section (EPUB) or page (PDF) after the last one the reading
 * holds. Sections and pages are handed to a reading whole, so the last one
 * it holds is complete. Null when its last piece is not from this kind of
 * book.
 */
export function nextAfterReading(segments: readonly TtsSegment[], kind: "e" | "p"): number | null {
  const last = parseSpeechId(segments[segments.length - 1]?.id ?? "");
  return last && last.kind === kind ? last.parts[0] + 1 : null;
}

/** Whether two pieces come from the same block (EPUB) or paragraph (PDF). */
export function sameSpeechBlock(a: SpeechId | null, b: SpeechId | null): boolean {
  if (!a || !b || a.kind !== b.kind || a.kind === "m") return false;
  return a.parts[0] === b.parts[0] && a.parts[1] === b.parts[1];
}

// ---------------------------------------------------------------------------
// The blocks of an HTML (or XHTML) document, in reading order.

/** Elements that start a new block of text. A text node belongs to the
 * nearest of these above it; inline elements (em, span, a) run on. */
const BLOCK_TAGS = new Set([
  "address", "article", "aside", "blockquote", "body", "caption", "center", "dd", "details", "dialog", "div", "dl", "dt",
  "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hgroup", "legend",
  "li", "main", "ol", "p", "pre", "section", "summary", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "ul",
]);

/** Elements whose text is never read: code and styling, the book's own table
 * of contents (it is the chapter titles over again), drawings and formulas
 * (a voice reads MathML as a string of letters), and ruby annotations. */
const SKIP_TAGS = new Set([
  "script", "style", "noscript", "template", "head", "title", "nav", "svg", "math", "rt", "rp",
  "object", "embed", "iframe", "video", "audio", "canvas", "select", "button", "textarea", "input",
]);

/** A note marker: "12", "[12]", "*", "†". Read aloud in the middle of a
 * sentence it is a number said for no reason ("the grace of God twelve"). */
const NOTE_MARKER = /^[[(]?[\d*†‡§¶]{1,4}[\])]?$/;
const BRACKETED_MARKER = /^(\[\d{1,4}\]|\(\d{1,4}\)|[*†‡§¶]{1,3})$/;

function tagOf(element: Element): string {
  return element.localName.toLowerCase();
}

/** A book's own note: CCEL's `div.mnote`, or one its markup names a footnote
 * or an endnote. */
function isNote(element: Element): boolean {
  if (/(^|\s)mnote(\s|$)/.test(element.getAttribute("class") ?? "")) return true;
  const types = `${element.getAttribute("epub:type") ?? ""} ${element.getAttribute("role") ?? ""}`;
  return /(^|\s)(doc-)?(footnote|endnote|rearnote)s?(\s|$)/.test(types);
}

/** A Scripture reference as a note prints one -- "Psalm lxiii. 18.", "Isa.
 * lxvi. 23, 24.", "1 Cor. 15:22" -- and the words notes join them with. */
const NOTE_REFERENCE =
  /(?:\b(?:[1-3]|I{1,3})\s*)?\b[A-Z][a-z]{0,11}\.?\s+(?:[ivxlc]{1,8}|\d{1,3})(?:[.:,]\s?\d{1,3}(?:\s?[-–]\s?\d{1,3})?(?:,\s?\d{1,3}(?:\s?[-–]\s?\d{1,3})?)*)?\.?/g;
const NOTE_CONNECTIVES = /\b(?:see|cf|comp|compare|also|and|ver|verse|verses|ch|chap)\b\.?/gi;

/**
 * Whether a note is nothing but a Scripture reference or a few. A CCEL book
 * prints the text of every verse a sermon quotes as a note at the end of the
 * section, and read aloud they came after the sermon's last words as a run of
 * bare references -- "Psalm 63, verse 18. Psalm 73, verses 18 to 19. John 3,
 * verse 18..." -- fourteen of them after "Sinners in the Hands", with nothing
 * to say what they belonged to. A note with something to say ("Preached at
 * Enfield, July 8th, 1741...") is still read.
 */
function isReferenceNote(element: Element): boolean {
  if (!isNote(element)) return false;
  let rest = element.textContent ?? "";
  for (const ref of Array.from(element.querySelectorAll(".scripRef"))) rest = rest.replace(ref.textContent ?? "", " ");
  return !/[A-Za-z]{2,}/.test(rest.replace(NOTE_REFERENCE, " ").replace(NOTE_CONNECTIVES, " "));
}

/**
 * Whether an element's text is left out of the reading. Only what the
 * markup itself says counts -- a tag, a `hidden` attribute, an inline
 * `display: none` -- never the computed style: a section is read both from
 * the page on screen and, for the sections after it, from a copy loaded in
 * the background with no styles applied, and the two must agree on which
 * block is which.
 *
 * A superscript that is only a number or a dagger is a note marker, as is a
 * link to a note printed as "[3]"; a plain linked number is not, because in
 * a CCEL book that is how a verse number in a Scripture reference is
 * printed, and "Rom. viii." without its 28 would be worse than a stray
 * number.
 */
function isSkipped(element: Element): boolean {
  const tag = tagOf(element);
  if (SKIP_TAGS.has(tag)) return true;
  if (element.hasAttribute("hidden") || element.getAttribute("aria-hidden") === "true") return true;
  const style = element.getAttribute("style");
  if (style && /(display\s*:\s*none|visibility\s*:\s*hidden)/i.test(style)) return true;
  const types = `${element.getAttribute("epub:type") ?? ""} ${element.getAttribute("role") ?? ""}`;
  if (/(^|\s)(doc-)?(noteref|pagebreak)(\s|$)/.test(types)) return true;
  if (tag === "sup" && NOTE_MARKER.test((element.textContent ?? "").trim())) return true;
  if (tag === "a" && (element.getAttribute("href") ?? "").includes("#") && BRACKETED_MARKER.test((element.textContent ?? "").trim())) return true;
  if (isReferenceNote(element)) return true;
  return false;
}

/** The block a node's text belongs to: the nearest block element at or
 * above it, or null outside any. */
export function nearestBlockElement(node: Node): Element | null {
  let element: Element | null = node.nodeType === 1 ? (node as Element) : node.parentElement;
  while (element) {
    if (BLOCK_TAGS.has(tagOf(element))) return element;
    element = element.parentElement;
  }
  return null;
}

/** One block of text as the voice reads it. `element` is where it is shown
 * (and what is marked while it is read); `nodes` are its text nodes, in
 * order, from which its place on screen is measured. */
export interface SpeechBlock {
  element: Element;
  nodes: Text[];
  text: string;
}

/**
 * The blocks of a document (or of an element within one), in reading order.
 *
 * A block is a run of text that shares its nearest block element: a
 * paragraph with its italics and links, a heading, a list item, a table
 * cell. Nested blocks are not counted twice -- a blockquote's paragraphs are
 * blocks of their own and the blockquote only holds whatever text sits
 * directly in it -- and a div with text on either side of a paragraph gives
 * two blocks, before and after, so the reading stays in page order.
 *
 * A line break (`<br>`) reads as a space, as does whitespace between inline
 * elements; text nodes are otherwise joined as they stand, which is how
 * "<i>Deus</i>ne" stays one word.
 *
 * Nodes are tested by `nodeType`, not `instanceof`: a section's document
 * lives in its own frame, with its own `Text` and `Element`.
 */
export function collectSpeechBlocks(root: Document | Element): SpeechBlock[] {
  const start: Element | null = root.nodeType === 9 ? ((root as Document).body ?? (root as Document).documentElement) : (root as Element);
  if (!start) return [];
  const doc = start.ownerDocument;
  const blocks: SpeechBlock[] = [];
  const blockOf = new Map<Element, Element | null>();
  const nearest = (parent: Element | null): Element | null => {
    if (!parent) return null;
    let found = blockOf.get(parent);
    if (found === undefined) {
      found = nearestBlockElement(parent);
      blockOf.set(parent, found);
    }
    return found;
  };
  // NodeFilter's values, spelled out: the constants live on the window, and
  // a document loaded in the background may have none.
  const SHOW_ELEMENT = 0x1;
  const SHOW_TEXT = 0x4;
  const FILTER_ACCEPT = 1;
  const FILTER_REJECT = 2;
  const walker = doc.createTreeWalker(start, SHOW_ELEMENT | SHOW_TEXT, {
    acceptNode: (node: Node) => (node.nodeType === 1 && isSkipped(node as Element) ? FILTER_REJECT : FILTER_ACCEPT),
  });
  let current: SpeechBlock | null = null;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === 1) {
      if (tagOf(node as Element) === "br" && current && nearest(node.parentElement) === current.element) current.text += " ";
      continue;
    }
    const text = node as Text;
    const block = nearest(text.parentElement);
    if (!block) continue;
    if (!/\S/.test(text.data)) {
      if (current && current.element === block) current.text += " ";
      continue;
    }
    if (current && current.element === block) {
      current.text += text.data;
      current.nodes.push(text);
    } else {
      current = { element: block, nodes: [text], text: text.data };
      blocks.push(current);
    }
  }
  return blocks;
}

/** A range over a block's text, for measuring where it is on screen. */
export function rangeOfBlock(block: SpeechBlock): Range {
  const range = block.element.ownerDocument.createRange();
  const last = block.nodes[block.nodes.length - 1];
  range.setStart(block.nodes[0], 0);
  range.setEnd(last, last.data.length);
  return range;
}

/**
 * The block a node is in: the block holding a text node, or the block an
 * element is part of (a click lands on an element). -1 when the node is in
 * no block of the list -- the page's margin, a picture, a skipped note
 * marker -- so that a stray click moves nothing.
 */
export function blockIndexAt(blocks: readonly SpeechBlock[], node: Node): number {
  if (node.nodeType === 3) {
    const i = blocks.findIndex((b) => b.nodes.includes(node as Text));
    if (i >= 0) return i;
  }
  const block = nearestBlockElement(node);
  if (!block) return -1;
  return blocks.findIndex((b) => b.element === block);
}

/** The first block that starts at or after `node` in the document: where a
 * selection begins when it begins between paragraphs, or on a picture. */
export function blockIndexFrom(blocks: readonly SpeechBlock[], node: Node): number {
  const exact = blockIndexAt(blocks, node);
  if (exact >= 0) return exact;
  const FOLLOWING = 0x04;
  const CONTAINED_BY = 0x10;
  return blocks.findIndex((b) => b.nodes[0] === node || (node.compareDocumentPosition(b.nodes[0]) & (FOLLOWING | CONTAINED_BY)) !== 0);
}

// ---------------------------------------------------------------------------
// Segments.

/**
 * An EPUB section's blocks as segments: each block cut into pieces, each
 * piece with an id naming section, block and piece, and a label the player
 * shows ("Chapter III, paragraph 4"). Paragraphs are counted among the
 * blocks that have something to say, as a reader would count them; blocks
 * with nothing to say keep their place in the ids all the same.
 *
 * `skip` leaves out blocks the page on screen does not show (hidden by the
 * book's own stylesheet); their numbers are not reused.
 */
export function epubSegments(
  blocks: readonly { text: string }[],
  spineIndex: number,
  chapter: string | null,
  skip?: (block: number) => boolean,
): TtsSegment[] {
  const out: TtsSegment[] = [];
  // A contents entry often ends in a full stop ("Sinners in the Hands of an
  // angry God."), which would leave the label reading "God., paragraph 12".
  const name = chapter?.trim().replace(/[.,;:]+$/, "") || `Section ${spineIndex + 1}`;
  let paragraph = 0;
  blocks.forEach((block, b) => {
    if (skip?.(b)) return;
    const pieces = splitForSpeech(block.text);
    if (pieces.length === 0) return;
    paragraph += 1;
    const label = `${name}, paragraph ${paragraph}`;
    pieces.forEach((text, p) => out.push({ id: `e:${spineIndex}:${b}:${p}`, text, label }));
  });
  return out;
}

/**
 * The words at the top of a PDF page that finish the sentence left open at
 * the foot of the page before -- "pleasure of God." after "...according to
 * the good" -- or "" when there are none: the page before ended its sentence,
 * or this one does not carry on with it (it opens with a capital, a heading,
 * a number). Up to the first sentence end in the page's first paragraph, or
 * the whole of it when it has none.
 *
 * A page is read as its own passages, so a sentence over a page break was two
 * of them, and its last words were said on their own after the pause between
 * passages. Those words are read with the page before instead, where the
 * sentence began, and the next page starts where a sentence does. Both pages
 * are asked the same question of the same two paragraphs, so what one page
 * gives up the other always takes.
 */
export function pdfCarriedBack(lastOfPage: string | undefined, firstOfNext: string | undefined): string {
  const last = lastOfPage?.trim() ?? "";
  const first = firstOfNext?.trim() ?? "";
  if (!last || !first || SENTENCE_END.test(last) || !/^\p{Ll}/u.test(first)) return "";
  const end = first.match(/[.!?]["'’”)\]]*(?=\s)/);
  return end?.index != null ? first.slice(0, end.index + end[0].length) : first;
}

/** Two pieces of a sentence broken across a line or a page, put back
 * together: a word hyphenated over the break is one word again. */
function joinBroken(before: string, after: string): string {
  return /\p{L}[-­]$/u.test(before) && /^\p{Ll}/u.test(after) ? before.slice(0, -1) + after : `${before} ${after}`;
}

/**
 * A PDF page's paragraphs as segments, labelled with the page number.
 * `neighbours` are the last paragraph of the page before and the first of the
 * page after, for a sentence that runs over either break (see
 * `pdfCarriedBack`); a paragraph whose words all went to the page before has
 * no segments, and keeps its number all the same.
 */
export function pdfSegments(
  paragraphs: readonly string[],
  page: number,
  neighbours?: { lastOfPrevious?: string; firstOfNext?: string },
): TtsSegment[] {
  const texts = [...paragraphs];
  const given = pdfCarriedBack(neighbours?.lastOfPrevious, texts[0]);
  if (given) texts[0] = texts[0].trim().slice(given.length).trim();
  const taken = texts.length > 0 ? pdfCarriedBack(texts[texts.length - 1], neighbours?.firstOfNext) : "";
  if (taken) texts[texts.length - 1] = joinBroken(texts[texts.length - 1].trim(), taken);
  const out: TtsSegment[] = [];
  texts.forEach((paragraph, i) => {
    splitForSpeech(paragraph).forEach((text, p) => out.push({ id: `p:${page}:${i}:${p}`, text, label: `p. ${page}` }));
  });
  return out;
}

/**
 * The first piece of block (or paragraph) `block` of `section`, or of the
 * first one after it with something to say; -1 when the reading holds
 * nothing of that section from there on.
 */
export function segmentIndexAtBlock(segments: readonly TtsSegment[], kind: "e" | "p", section: number, block: number): number {
  return segments.findIndex((segment) => {
    const id = parseSpeechId(segment.id);
    return id != null && id.kind === kind && id.parts[0] === section && id.parts[1] >= block;
  });
}

/**
 * Where in a reading a block of the page on screen is, found by its text as
 * well as its number.
 *
 * The page on screen and the copy of a section loaded in the background are
 * the same file parsed twice -- once as HTML inside the reader's frame, once
 * as XML -- and a book's markup is not always kind to that: a self-closing
 * `<a id="p5"/>` is an empty anchor to one and an open one to the other. So
 * a block's number can differ by one or two between the two, and its first
 * piece's text settles which one it is. Without text, or when nothing
 * matches, the number alone decides.
 */
export function segmentIndexForBlock(
  segments: readonly TtsSegment[],
  kind: "e" | "p",
  section: number,
  block: number,
  firstPiece?: string | null,
): number {
  if (firstPiece) {
    let best = -1;
    let distance = Infinity;
    segments.forEach((segment, i) => {
      const id = parseSpeechId(segment.id);
      if (!id || id.kind !== kind || id.parts[0] !== section || id.parts[2] !== 0 || segment.text !== firstPiece) return;
      const d = Math.abs(id.parts[1] - block);
      if (d < distance) {
        best = i;
        distance = d;
      }
    });
    if (best >= 0) return best;
  }
  return segmentIndexAtBlock(segments, kind, section, block);
}

/**
 * Which block on the page holds a piece being read: block `block` when its
 * text holds the piece, otherwise the nearest block that does (see
 * `segmentIndexForBlock` for why the numbers can drift), otherwise -1.
 * `blockTexts` are the blocks' texts as `cleanForSpeech` leaves them, which
 * is what a piece is cut from.
 */
export function blockIndexForPiece(blockTexts: readonly string[], block: number, piece: string): number {
  const probe = piece.slice(0, 80);
  if (!probe) return -1;
  if (blockTexts[block]?.includes(probe)) return block;
  for (let d = 1; d <= 40; d++) {
    if (blockTexts[block - d]?.includes(probe)) return block - d;
    if (blockTexts[block + d]?.includes(probe)) return block + d;
  }
  return -1;
}

/** A block's text as the pieces cut from it see it. */
export function speechTextOf(block: { text: string }): string {
  return cleanForSpeech(block.text);
}

/**
 * How far through its block the piece at `index` begins, from 0 to 1, by
 * characters. A block taller than the pane is followed through, rather than
 * held at its top while the voice reads its end.
 */
export function fractionThroughBlock(segments: readonly TtsSegment[], index: number): number {
  const here = parseSpeechId(segments[index]?.id ?? "");
  if (!here) return 0;
  let before = 0;
  let total = segments[index].text.length;
  for (let i = index - 1; i >= 0 && sameSpeechBlock(parseSpeechId(segments[i].id), here); i--) before += segments[i].text.length;
  for (let i = index + 1; i < segments.length && sameSpeechBlock(parseSpeechId(segments[i].id), here); i++) total += segments[i].text.length;
  total += before;
  return total > 0 ? before / total : 0;
}

// ---------------------------------------------------------------------------
// The page on screen.

export interface VerticalRect {
  top: number;
  bottom: number;
}

/** A block within this many pixels of the pane's top edge is "at" it: the
 * descender of a line scrolled just out of sight is not a paragraph on
 * screen. */
const EDGE_PX = 4;

/**
 * Which of a list of blocks, in reading order, the page on screen starts
 * with. `rects` and the view are in the same coordinates, y growing down.
 *
 * The first block that begins on screen, usually. A paragraph cut by the
 * top edge is chosen instead when most of what is on screen is that
 * paragraph (a long one, or a pane zoomed in on it) -- starting after it
 * would skip what the reader is looking at. A block that is not laid out
 * (height 0: hidden, or empty) is never chosen. When every block is above
 * the view, the answer is `rects.length`: nothing on this page, so start
 * with whatever comes next.
 */
export function startIndexForView(rects: readonly VerticalRect[], viewTop: number, viewBottom: number): number {
  const viewHeight = Math.max(1, viewBottom - viewTop);
  let straddling = -1;
  for (let i = 0; i < rects.length; i++) {
    const { top, bottom } = rects[i];
    if (bottom - top <= 0) continue;
    if (bottom <= viewTop + EDGE_PX) continue;
    if (top >= viewTop - EDGE_PX) {
      if (straddling >= 0) {
        const shown = Math.min(rects[straddling].bottom, viewBottom) - viewTop;
        if (shown >= viewHeight * 0.4 || top >= viewBottom) return straddling;
      }
      return i;
    }
    if (straddling < 0) straddling = i;
  }
  return straddling >= 0 ? straddling : rects.length;
}

/**
 * How far to scroll so the block being read is in view: 0 when it already
 * is. A block that fits is centred; one taller than most of the pane is
 * followed by `fraction` (how far through it the voice is), keeping the
 * words being read in the upper part of the pane rather than the block's
 * top in the middle of it.
 */
export function revealOffset(target: VerticalRect, view: VerticalRect, fraction = 0): number {
  const viewHeight = view.bottom - view.top;
  if (viewHeight <= 0) return 0;
  const height = target.bottom - target.top;
  if (height <= viewHeight * 0.8) {
    if (target.top >= view.top && target.bottom <= view.bottom) return 0;
    return target.top + height / 2 - (view.top + viewHeight / 2);
  }
  const y = target.top + height * Math.min(1, Math.max(0, fraction));
  if (y >= view.top + viewHeight * 0.1 && y <= view.bottom - viewHeight * 0.35) return 0;
  return y - (view.top + viewHeight * 0.25);
}

// ---------------------------------------------------------------------------
// PDF pages. pdf.js hands over a page's text as runs -- a word, a line, a
// few letters -- each with where it was drawn. Lines and paragraphs are
// rebuilt from where they sit.

/** One text run of a PDF page, in PDF units (y grows up), as pdf.js gives
 * it: `x`/`y` is where the baseline starts, `height` about the font size. */
export interface PdfTextRun {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  hasEOL: boolean;
}

/** A paragraph of a PDF page with the box it covers, in PDF units. */
export interface PdfParagraph {
  text: string;
  left: number;
  right: number;
  bottom: number;
  top: number;
}

interface PdfLine {
  text: string;
  left: number;
  right: number;
  y: number;
  size: number;
}

/** A page number on a line of its own: "12", "- 12 -", "xiv". Upper-case
 * numerals are left alone -- "IV" alone on a line is more often a chapter.
 *
 * A lower-case numeral has to be a well-formed one, up to cccxcix. Any run
 * of the letters i, v, x, l and c would do as a pattern, and so would
 * "civil", "ill" and "lilac" -- real words that, carried over onto a line of
 * their own at the top or bottom of a page, were dropped as page numbers and
 * never read. */
const PAGE_NUMBER = /^[-–—([]*\s*(\d{1,4}|(?=[ivxlc])c{0,3}(?:xc|xl|l?x{0,3})(?:ix|iv|v?i{0,3}))\s*[-–—)\]]*$/;
const SENTENCE_END = /[.!?:;]["'’”)\]]*$/;

function pdfLines(runs: readonly PdfTextRun[]): PdfLine[] {
  const lines: PdfLine[] = [];
  const finish = (line: PdfLine | null) => {
    if (!line) return;
    const text = line.text.replace(/\s+/g, " ").trim();
    if (text) lines.push({ ...line, text });
  };
  let line: PdfLine | null = null;
  for (const run of runs) {
    const size = run.height > 0 ? run.height : 10;
    if (/\S/.test(run.str)) {
      // A run well above or below the line is a new line, whether or not
      // pdf.js marked the end of the last one. A superscript sits only part
      // of a line higher and stays.
      if (line !== null && Math.abs(run.y - line.y) > Math.max(line.size, size) * 0.6) {
        finish(line);
        line = null;
      }
      if (line === null) {
        line = { text: run.str, left: run.x, right: run.x + run.width, y: run.y, size };
      } else {
        const gap = run.x - line.right;
        const spaced = /\s$/.test(line.text) || /^\s/.test(run.str);
        // Words drawn as separate runs carry no space between them; a gap
        // wider than a thin space is one.
        line.text += !spaced && gap > Math.min(line.size, size) * 0.15 ? ` ${run.str}` : run.str;
        line.left = Math.min(line.left, run.x);
        line.right = Math.max(line.right, run.x + run.width);
        line.size = Math.max(line.size, size);
      }
    } else if (run.str && line !== null) {
      line.text += " ";
    }
    if (run.hasEOL) {
      finish(line);
      line = null;
    }
  }
  finish(line);
  return lines;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  // The lower middle: on a page of two line advances, one of them the gap
  // after a paragraph, the ordinary one is the smaller.
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

/**
 * A PDF page's text as paragraphs.
 *
 * Runs are joined into lines (a run marked as ending its line, or one that
 * sits on a different baseline, starts the next), a lone page number at the
 * top or bottom of the page is dropped, and lines are joined into
 * paragraphs. A new paragraph starts where the space between lines opens
 * up, where a line that ends a sentence stops well short of the right
 * margin (the last line of a paragraph), where the next line is indented
 * (the first line of one), and where the text jumps back up the page after
 * a sentence ends (the next column). A word hyphenated across a line break
 * is joined back together.
 */
export function pdfParagraphs(runs: readonly PdfTextRun[]): PdfParagraph[] {
  const lines = pdfLines(runs);
  if (lines.length > 1 && PAGE_NUMBER.test(lines[lines.length - 1].text)) lines.pop();
  if (lines.length > 1 && PAGE_NUMBER.test(lines[0].text)) lines.shift();
  if (lines.length === 1 && PAGE_NUMBER.test(lines[0].text)) return [];
  if (lines.length === 0) return [];

  const advances: number[] = [];
  for (let i = 1; i < lines.length; i++) {
    const drop = lines[i - 1].y - lines[i].y;
    if (drop > 0 && drop < 3 * Math.max(lines[i].size, lines[i - 1].size)) advances.push(drop);
  }
  const typical = median(advances);
  const minLeft = Math.min(...lines.map((l) => l.left));
  const maxRight = Math.max(...lines.map((l) => l.right));

  const paragraphs: PdfParagraph[] = [];
  const box = (l: PdfLine) => ({ left: l.left, right: l.right, bottom: l.y - l.size * 0.25, top: l.y + l.size * 0.85 });
  let current: PdfParagraph = { text: lines[0].text, ...box(lines[0]) };
  for (let i = 1; i < lines.length; i++) {
    const prev = lines[i - 1];
    const line = lines[i];
    const drop = prev.y - line.y;
    const size = Math.max(prev.size, line.size);
    const endsSentence = SENTENCE_END.test(prev.text);
    let breaks: boolean;
    if (drop <= -size) breaks = endsSentence;
    else if (typical != null && drop > typical * 1.45) breaks = true;
    else if (typical == null && drop > 2 * size) breaks = true;
    else if (endsSentence && prev.right < maxRight - 2.5 * prev.size) breaks = true;
    else breaks = endsSentence && line.left > minLeft + 0.8 * line.size && prev.left < minLeft + 0.5 * prev.size;
    if (breaks) {
      paragraphs.push(current);
      current = { text: line.text, ...box(line) };
      continue;
    }
    current.text = joinBroken(current.text, line.text);
    const b = box(line);
    current.left = Math.min(current.left, b.left);
    current.right = Math.max(current.right, b.right);
    current.bottom = Math.min(current.bottom, b.bottom);
    current.top = Math.max(current.top, b.top);
  }
  paragraphs.push(current);
  return paragraphs;
}

/** The paragraph drawn at a point of the page (PDF units), or -1 for the
 * margin and the space between paragraphs. */
export function paragraphAt(paragraphs: readonly PdfParagraph[], x: number, y: number): number {
  const slack = 3;
  return paragraphs.findIndex((p) => x >= p.left - slack && x <= p.right + slack && y >= p.bottom - slack && y <= p.top + slack);
}

// ---------------------------------------------------------------------------
// MOBI text: shown as extracted text, so what is shown and what is read can
// be cut at the same places.

/** A stretch of a paragraph as shown: a piece the voice reads (its number
 * across the whole book), or text between pieces it has nothing to say for
 * (a line of Greek, say, or a "* * *" between scenes), shown but not read. */
export interface ShownRun {
  text: string;
  piece: number | null;
}

/**
 * Where the characters of text made for the voice stand in the text on the
 * page it was made from.
 *
 * `cleanForSpeech` only ever takes characters out of a text -- a soft
 * hyphen, a rule, the "——" of a name left blank -- or turns a run of them
 * into one space. So every other character of the spoken text is found in
 * the shown one in turn, the first match after the last; a space stands
 * wherever the page had got to. (A kept character that also appears in a
 * run that was taken out, as the "-" of "---- -b" does, can be matched a
 * little early; that moves where a piece's mark begins by a character or
 * two, and never loses or repeats any text.)
 *
 * The answer is a function asked for offsets in order, never going back --
 * which is how a paragraph is walked piece by piece and a piece word by
 * word -- so it costs one pass over both texts, whatever their length: a
 * MOBI's one "paragraph" can be the whole book. It answers -1 from the
 * first character it cannot find on (text not made from this page).
 */
export function spokenToShown(spoken: string, shown: string): (offset: number) => number {
  let next = 0;
  let from = 0;
  let placed = -1;
  let lost = false;
  return (offset) => {
    while (!lost && next <= offset) {
      if (next >= spoken.length) return -1;
      const c = spoken[next];
      if (c === " ") {
        placed = from;
      } else {
        while (from < shown.length && shown[from] !== c) from += 1;
        if (from < shown.length) placed = from++;
        else lost = true;
      }
      next += 1;
    }
    return lost ? -1 : placed;
  };
}

/**
 * The words of a piece as the page shows them: for each word the voice is
 * given (as `tokenizeWords` counts them, which is how the player counts the
 * word being said), the stretch of the shown text it stands for. "Mr. B——
 * said ____ to him" is said as "Mr. B said to him": its second word is
 * "B——" on the page, its third is "said", and the blank is no word at all.
 */
export function shownWordRanges(shown: string, spoken: string): { start: number; end: number }[] {
  const place = spokenToShown(spoken, shown);
  const ranges: { start: number; end: number }[] = [];
  for (const word of tokenizeWords(spoken)) {
    const start = place(word.start);
    const last = place(word.end - 1);
    if (start < 0 || last < start) break;
    ranges.push({ start, end: last + 1 });
  }
  return ranges;
}

/**
 * A MOBI's paragraphs cut into the pieces the voice reads, as the reader
 * shows them, and the segments to read.
 *
 * Each paragraph is shown exactly as it was given -- extracted text, its
 * whitespace already made plain -- and each piece is marked on it where it
 * stands, found through `spokenToShown`. What the voice leaves out stays on
 * the page: a scene break between pieces is shown between them, and a blank
 * or a rule inside a sentence stays in the piece around it. (Shown as the
 * voice was given it, "Mr. B—— said ____ to him" came out "Mr. B said to
 * him", and "* * *" as an empty line.) A piece that cannot be placed, which
 * should not happen, is read all the same; its words are still on the page,
 * only not marked. A piece's number is its index in `segments`.
 */
export function mobiReadAloud(paragraphs: readonly string[]): { paragraphs: ShownRun[][]; segments: TtsSegment[] } {
  const segments: TtsSegment[] = [];
  const shown = paragraphs.map((paragraph, p) => {
    const clean = cleanForSpeech(paragraph);
    const place = spokenToShown(clean, paragraph);
    const runs: ShownRun[] = [];
    let searchFrom = 0;
    let shownTo = 0;
    // A sentence at a time, so "Read aloud" starts at the sentence cut by the
    // top of the view rather than a sentence or two above it.
    for (const piece of splitForSpeech(paragraph, undefined, { bySentence: true })) {
      const index = segments.length;
      segments.push({ id: `m:${index}`, text: piece, label: paragraphs.length > 1 ? `paragraph ${p + 1}` : undefined });
      const at = clean.indexOf(piece, searchFrom);
      if (at < 0) continue;
      const start = place(at);
      const end = place(at + piece.length - 1) + 1;
      if (start < shownTo || end <= start) continue;
      if (start > shownTo) runs.push({ text: paragraph.slice(shownTo, start), piece: null });
      runs.push({ text: paragraph.slice(start, end), piece: index });
      searchFrom = at + piece.length;
      shownTo = end;
    }
    if (shownTo < paragraph.length) runs.push({ text: paragraph.slice(shownTo), piece: null });
    return runs;
  });
  return { paragraphs: shown, segments };
}
