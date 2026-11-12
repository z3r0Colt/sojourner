import type Book from "epubjs/types/book";
import type Contents from "epubjs/types/contents";
import type Rendition from "epubjs/types/rendition";
import type { NavItem } from "epubjs/types/navigation";
import { type TtsSegment } from "../../state/ttsStore";
import { flatten, printedAt } from "./findPrinted";
import { collectSpeechBlocks, epubSegments } from "./readAloudText";

// What the EPUB reader asks of a book, apart from drawing it: its table of
// contents, its sections' text for reading aloud and for finding a printed
// passage, and how far through it a place is. EpubReader.tsx is the reader.

/** One entry of a book's table of contents, flattened with its depth. */
export interface EpubTocItem {
  id: string;
  href: string;
  label: string;
  depth: number;
}

export function flattenToc(items: NavItem[] | undefined, depth = 0, out: EpubTocItem[] = []): EpubTocItem[] {
  for (const item of items ?? []) {
    const label = (item.label ?? "").trim();
    if (label) out.push({ id: item.id ?? item.href, href: item.href, label, depth });
    flattenToc(item.subitems, depth + 1, out);
  }
  return out;
}

/** The contents entry a section belongs to, so the reader can say where in
 * the book it is. Fragments are ignored: several entries can point into
 * one file, and the first of them names the file well enough. */
export function labelForHref(toc: EpubTocItem[], href: string): string | null {
  const path = href.split("#")[0];
  return toc.find((item) => item.href.split("#")[0] === path)?.label ?? null;
}

/** epub.js types `getContents` as a single Contents; it returns one per
 * rendered section. */
export function contentsOf(rendition: Rendition): Contents[] {
  const contents = rendition.getContents() as unknown;
  return Array.isArray(contents) ? (contents as Contents[]) : contents ? [contents as Contents] : [];
}

/**
 * Re-measures the frame against its container. epub.js types both
 * arguments as required, but omitting them is what asks it to measure.
 *
 * Only once the view manager has been rendered, and never after the book is
 * closed. `rendition.resize` hands straight on to the manager with no check
 * of its own, and there are three moments when there is nothing to hand on
 * to:
 *
 * - The book is still opening. epub.js creates the manager only when the
 *   rendition starts, which waits for the book's package to be read; until
 *   then there is no manager at all. A pane resized (or zoomed) while a big
 *   book was opening threw "Cannot read properties of undefined (reading
 *   'resize')" -- by far the most common entry in the error log, over and
 *   over.
 * - The manager exists but has not been attached to the page yet, so has no
 *   stage (the element it measures), and reading the stage's size threw
 *   "... (reading 'size')".
 * - The book has been closed: `destroy` pulls the stage out of the page and
 *   marks the manager unrendered, and the zoom's settle timer could still
 *   fire just after the pane closed.
 *
 * A resize at any of those moments has nothing to measure anyway.
 */
export function resizeToContainer(rendition: Rendition): void {
  const manager = (rendition as unknown as { manager?: { stage?: unknown; isRendered?: () => boolean } }).manager;
  if (!manager?.stage || manager.isRendered?.() === false) return;
  try {
    (rendition as unknown as { resize: (width?: number, height?: number) => void }).resize();
  } catch {
    // One of the same races by a route not checked for above; the next
    // settled resize measures again.
  }
}

/**
 * Takes out of the reading order every section whose file the book does not
 * have. Thirteen of the shipped books list a "cover" page in their spine
 * with no such item in the manifest; epub.js gives that section no url, and
 * showing it -- the first page, so every time the book opened -- threw
 * inside epub.js and left the pane on "Opening book..." for good. Marked
 * non-linear rather than removed: epub.js pages and places CFIs by spine
 * index, and removing an entry would shift every one after it. Non-linear
 * sections are already passed over by the first page shown, Previous and
 * Next, the locations and the reading voice.
 */
export function skipSectionsWithNoFile(book: Book) {
  book.spine.each((item: unknown) => {
    const section = item as { url?: string; linear?: boolean };
    if (!section.url) section.linear = false;
  });
}

/** How many sections past a page with nothing to read (a cover, a picture,
 * the end of a chapter) a reading looks for somewhere to begin. */
export const MAX_SILENT_SECTIONS = 12;

/**
 * The document a section's `load` resolved with. epub.js resolves it with
 * the document's root element, and that -- not `section.document` read
 * afterwards -- is what to take: the section objects are shared, and the
 * locations being generated and a citation being looked for load and
 * unload the same sections at the same time. One of them unloading a
 * section between its load finishing and this code running left
 * `section.document` empty, and the whole section was skipped without a
 * word said about it.
 */
export async function loadSectionDocument(section: SpineSection, book: Book): Promise<Document | null> {
  const root = (await section.load(book.load.bind(book))) as Node | null | undefined;
  return root?.ownerDocument ?? section.document ?? null;
}

/** A section, loaded in the background, as the voice would read it. A
 * non-linear section (a footnote file, a pop-up) is not part of the
 * reading order and gives nothing; so does one that will not load. */
export async function loadSectionSegments(book: Book, index: number, chapter: string | null): Promise<TtsSegment[]> {
  const item = book.spine.get(index) as unknown as (SpineSection & { linear?: boolean }) | null;
  if (!item || item.linear === false) return [];
  try {
    const doc = await loadSectionDocument(item, book);
    return doc ? epubSegments(collectSpeechBlocks(doc), index, chapter) : [];
  } catch {
    return [];
  } finally {
    try {
      item.unload();
    } catch {
      // Nothing was loaded to let go of.
    }
  }
}

/**
 * Finds the `occurrence`-th printing of `find.text` in the book, section by
 * section, and shows it marked. Falls back to `find.fallback` when the words
 * as printed are not found (the extracted text a citation was found in and
 * the rendered page can differ in spacing), and to the start when neither is.
 */
export type SpineSection = {
  load: (loader: unknown) => Promise<unknown>;
  unload: () => void;
  document?: Document;
  cfiFromRange: (range: Range) => string;
};

/**
 * Every place `text` is printed in a section, as a whole and counted the way
 * the citation index counts it (see findPrinted.ts). epub.js's own `find`
 * matches any substring in any case and within one text node, which throws
 * off which occurrence is which.
 */
export function exactHits(section: SpineSection, doc: Document | null, text: string): { cfi: string }[] {
  if (!doc?.body) return [];
  const nodes: Text[] = [];
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node as Text);
  const flat = flatten(nodes.map((n) => n.data));
  const length = text.replace(/[\s ]+/g, " ").trim().length;
  const hits: { cfi: string }[] = [];
  for (const pos of printedAt(flat.text, text)) {
    const [startNode, startOffset] = flat.at[pos];
    const [endNode, endOffset] = flat.at[pos + length - 1];
    const range = doc.createRange();
    range.setStart(nodes[startNode], startOffset);
    range.setEnd(nodes[endNode], endOffset + 1);
    try {
      hits.push({ cfi: section.cfiFromRange(range) });
    } catch {
      // A range epub.js cannot name is one it could not show either.
    }
  }
  return hits;
}

export async function findAndShow(book: Book, rendition: Rendition, find: { text: string; occurrence: number; fallback?: string }, disposed: () => boolean): Promise<void> {
  const search = async (text: string, occurrence: number): Promise<string | null> => {
    let seen = 0;
    const items: SpineSection[] = [];
    book.spine.each((item: unknown) => {
      items.push(item as SpineSection);
    });
    for (const item of items) {
      if (disposed()) return null;
      try {
        // The document as loaded, for the reason `loadSectionDocument` gives.
        const hits = exactHits(item, await loadSectionDocument(item, book), text);
        item.unload();
        if (seen + hits.length > occurrence) return hits[occurrence - seen].cfi;
        seen += hits.length;
      } catch {
        // A section that will not load is skipped, not fatal.
      }
    }
    return null;
  };
  let cfi = await search(find.text, find.occurrence);
  if (!cfi && find.fallback) cfi = await search(find.fallback, 0);
  if (disposed()) return;
  if (!cfi) {
    await rendition.display();
    return;
  }
  await rendition.display(cfi);
  try {
    rendition.annotations.highlight(cfi, {}, () => {}, "epub-find-hit", { fill: "var(--color-accent)", "fill-opacity": "0.25" });
  } catch {
    // Marking it is a courtesy; the page is already there.
  }
  // In the scrolled flow, display(cfi) lands short when the section's layout
  // settles after it (images, fonts): bring the mark itself into view, once
  // now and once when things have settled.
  const container = (rendition as unknown as { manager?: { container?: HTMLElement } }).manager?.container;
  const reveal = () => {
    if (disposed()) return;
    container?.querySelector("g.epub-find-hit")?.scrollIntoView({ block: "center" });
  };
  setTimeout(reveal, 150);
  setTimeout(reveal, 1200);
}

/** Books whose locations have all been generated. */
export const measuredBooks = new WeakSet<Book>();

/** How far through the book a CFI sits, or null before the locations that
 * answer that have all been generated. Not just some: epub.js fills its list
 * section by section but sets the total only at the end, so a book part-way
 * measured put every place at 0%, and the bar, scrubbed, went to the start. */
export function percentOf(book: Book, cfi: string): number | null {
  try {
    if (!measuredBooks.has(book) || book.locations.length() === 0) return null;
    const value = book.locations.percentageFromCfi(cfi);
    return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : null;
  } catch {
    return null;
  }
}
