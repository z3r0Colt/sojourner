import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { convertFileSrc } from "../../lib/platform";
import ePub from "epubjs";
import type Book from "epubjs/types/book";
import type Contents from "epubjs/types/contents";
import type Rendition from "epubjs/types/rendition";
import type { NavItem } from "epubjs/types/navigation";
import { ChevronLeft, ChevronRight, Minus, MoveHorizontal, Plus, Type, ZoomIn, ZoomOut } from "lucide-react";
import { Button, IconButton } from "../../components/ui/Button";
import { Popover } from "../../components/ui/Popover";
import { LoadingState } from "../../components/ui/EmptyState";
import { checkboxClass, cx, selectSmClass } from "../../components/ui/classes";
import { toast } from "../../components/ui/toast";
import { useTtsStore, type TtsSegment } from "../../state/ttsStore";
import { usePaneOptional } from "../../workspace/PaneContext";
import { splitForSpeech } from "../tts/textUtils";
import { flatten, printedAt } from "./findPrinted";
import { ReadAloudControls } from "./ReadAloudControls";
import { endLoading, isReadingHere, letGoOfLoading, takeOverLoading, whenMoreWanted } from "./readAloudLoading";
import {
  blockIndexAt,
  blockIndexForPiece,
  blockIndexFrom,
  collectSpeechBlocks,
  epubSegments,
  fractionThroughBlock,
  nextAfterReading,
  parseSpeechId,
  rangeOfBlock,
  revealOffset,
  segmentIndexAtBlock,
  segmentIndexForBlock,
  speechTextOf,
  startIndexForView,
  type ReadAloudFrom,
  type ResourceReadAloudHandle,
  type SpeechBlock,
} from "./readAloudText";
import {
  EPUB_WIDTH_OPTIONS,
  EPUB_ZOOM_MAX,
  EPUB_ZOOM_MIN,
  EPUB_ZOOM_STEP,
  READING_FONT_OPTIONS,
  useUiStore,
  type EpubWidth,
  type LineSpacing,
  type ReadingFont,
} from "../../state/uiStore";
import {
  DESK_MARGIN_PX,
  EPUB_STYLE_KEY,
  addRunOut,
  buildEpubCss,
  fitScannedPage,
  isScannedPage,
  markScannedPage,
  padSheetToHeight,
  pinInvisibleText,
  routeExternalLinks,
  SPEAKING_ATTR,
  SPEAKING_HIGHLIGHT,
  sheetWidthPx,
  unstackPositionedElements,
} from "./epubStyles";

/** One entry of a book's table of contents, flattened with its depth. */
export interface EpubTocItem {
  id: string;
  href: string;
  label: string;
  depth: number;
}

/** What the reader sidebar can ask the book to do. */
export interface EpubController {
  /** Show a section by its contents href. */
  display: (href: string) => void;
}

export interface EpubLocation {
  cfi: string;
  href: string;
}

const FONT_SIZE_MIN = 12;
const FONT_SIZE_MAX = 32;
/** Roughly a paragraph's worth of text per generated location. */
const LOCATION_CHARS = 1200;
/** Long enough that dragging a pane divider re-renders the book once, at
 * the end, rather than on every frame. */
const RESIZE_SETTLE_MS = 150;
/** Locations are generated after the book is on screen, not before it. */
const LOCATIONS_DELAY_MS = 1200;
/** How much of the visible height a page-down moves, keeping a couple of
 * lines of overlap so the eye can pick up where it left off. */
const PAGE_OVERLAP_PX = 56;

const LINE_SPACING_OPTIONS: { value: LineSpacing; label: string }[] = [
  { value: "compact", label: "Compact" },
  { value: "normal", label: "Normal" },
  { value: "relaxed", label: "Relaxed" },
];

function flattenToc(items: NavItem[] | undefined, depth = 0, out: EpubTocItem[] = []): EpubTocItem[] {
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
function labelForHref(toc: EpubTocItem[], href: string): string | null {
  const path = href.split("#")[0];
  return toc.find((item) => item.href.split("#")[0] === path)?.label ?? null;
}

/** epub.js types `getContents` as a single Contents; it returns one per
 * rendered section. */
function contentsOf(rendition: Rendition): Contents[] {
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
function resizeToContainer(rendition: Rendition): void {
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
function skipSectionsWithNoFile(book: Book) {
  book.spine.each((item: unknown) => {
    const section = item as { url?: string; linear?: boolean };
    if (!section.url) section.linear = false;
  });
}

/** How many sections past a page with nothing to read (a cover, a picture,
 * the end of a chapter) a reading looks for somewhere to begin. */
const MAX_SILENT_SECTIONS = 12;

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
async function loadSectionDocument(section: SpineSection, book: Book): Promise<Document | null> {
  const root = (await section.load(book.load.bind(book))) as Node | null | undefined;
  return root?.ownerDocument ?? section.document ?? null;
}

/** A section, loaded in the background, as the voice would read it. A
 * non-linear section (a footnote file, a pop-up) is not part of the
 * reading order and gives nothing; so does one that will not load. */
async function loadSectionSegments(book: Book, index: number, chapter: string | null): Promise<TtsSegment[]> {
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
 * A counter that changes whenever the app's theme or accent does, so the
 * stylesheet inside the book's frame can be rebuilt from the current
 * tokens. Both are written onto `<html>` -- the theme as an attribute, the
 * accent as inline custom properties -- so one observer catches both.
 */
function useThemeVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const observer = new MutationObserver(() => setVersion((v) => v + 1));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "style"] });
    return () => observer.disconnect();
  }, []);
  return version;
}

interface Progress {
  /** Index of the section on screen within the spine. */
  index: number;
  total: number;
  /** How far through the whole book, once locations have been generated. */
  percent: number | null;
}

const NO_PROGRESS: Progress = { index: 0, total: 0, percent: null };

export function EpubReader({
  filePath,
  initialCfi,
  onLocation,
  onToc,
  onSelect,
  controllerRef,
  find,
  readAloudTitle,
  readAloudRef,
}: {
  filePath: string;
  /** The book's title, which reading it aloud goes by: the read-aloud
   * button knows the reading is this book's by it. Without it the book has
   * no read-aloud controls. */
  readAloudTitle?: string;
  /** Filled in with this book's read-aloud, for the reader sidebar. */
  readAloudRef?: MutableRefObject<ResourceReadAloudHandle | null>;
  /** Open at these words instead of where the reader left off -- a
   * citation's reference, found in the book and marked. Read once, on open. */
  find?: { text: string; occurrence: number; fallback?: string } | null;
  /** Where to open: the CFI saved last time (F3.4). Read once, on open. */
  initialCfi?: string;
  /** Reported whenever the visible location settles (after each scroll or jump). */
  onLocation?: (loc: EpubLocation) => void;
  /** The book's table of contents, once it has loaded. */
  onToc?: (toc: EpubTocItem[]) => void;
  /** The words the reader has selected inside the book, with the CFI range
   * they sit at -- what "Send to sermon" quotes (SB1.4). Cleared with an
   * empty string when the selection goes away. */
  onSelect?: (text: string, cfi: string | null) => void;
  controllerRef?: MutableRefObject<EpubController | null>;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const tocRef = useRef<EpubTocItem[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [chapter, setChapter] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress>(NO_PROGRESS);
  /** Where the reader is dragging the progress slider to, before letting go. */
  const [scrub, setScrub] = useState<number | null>(null);

  const fontSize = useUiStore((s) => s.fontSize);
  const setFontSize = useUiStore((s) => s.setFontSize);
  const lineSpacing = useUiStore((s) => s.lineSpacing);
  const setLineSpacing = useUiStore((s) => s.setLineSpacing);
  const readingFont = useUiStore((s) => s.readingFont);
  const setReadingFont = useUiStore((s) => s.setReadingFont);
  const epubWidth = useUiStore((s) => s.epubWidth);
  const setEpubWidth = useUiStore((s) => s.setEpubWidth);
  const useBookStyles = useUiStore((s) => s.epubUseBookStyles);
  const setUseBookStyles = useUiStore((s) => s.setEpubUseBookStyles);
  const zoom = useUiStore((s) => s.epubZoom);
  const setZoom = useUiStore((s) => s.setEpubZoom);
  const themeVersion = useThemeVersion();
  const speakingColor = useTtsStore((s) => s.highlightColor);
  /** Words are selected in the section on screen. */
  const [hasSelection, setHasSelection] = useState(false);
  const hasSelectionRef = useRef(false);
  const paneId = usePaneOptional()?.id ?? null;
  /** The title and pane a reading of this book goes by, for code that runs
   * long after the render that started it (the loader, the frame's clicks). */
  const readingRef = useRef({ title: readAloudTitle ?? "", paneId });
  readingRef.current = { title: readAloudTitle ?? "", paneId };
  /** Bumped by every reading this reader starts; a loader from an earlier
   * one sees it has been replaced and stops. */
  const readGenRef = useRef(0);
  /** How many sections the book has, once it is open. */
  const spineCountRef = useRef(0);
  /** Each section document's blocks, collected once: the frame's DOM does
   * not change after the content hook has run. */
  const blocksCache = useRef(new WeakMap<Document, { blocks: SpeechBlock[]; texts: string[] }>());

  const css = useMemo(() => {
    // themeVersion carries no value of its own; changing is its whole
    // purpose, because the colours are read from the theme's tokens.
    void themeVersion;
    return buildEpubCss({ fontSize, lineSpacing, readingFont, width: epubWidth, useBookStyles, zoom, speakingColor });
  }, [fontSize, lineSpacing, readingFont, epubWidth, useBookStyles, zoom, speakingColor, themeVersion]);

  // Callbacks, the stylesheet and the opening CFI are reached through refs
  // so the book is opened once per file, not once per parent render or
  // once per change of type size.
  const cssRef = useRef(css);
  cssRef.current = css;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  const zoomBy = useCallback(
    (direction: 1 | -1) => setZoom(zoomRef.current + direction * EPUB_ZOOM_STEP),
    [setZoom],
  );
  /** The zoom at which the sheet spans the pane. */
  const fitWidth = useCallback(() => {
    const host = hostRef.current;
    const sheet = sheetWidthPx(epubWidth);
    if (!host || sheet == null) {
      setZoom(100);
      return;
    }
    const scrollbar = 18;
    setZoom(((host.clientWidth - DESK_MARGIN_PX * 2 - scrollbar) / sheet) * 100);
  }, [epubWidth, setZoom]);
  const fitWidthRef = useRef(fitWidth);
  fitWidthRef.current = fitWidth;
  const onLocationRef = useRef(onLocation);
  onLocationRef.current = onLocation;
  const onTocRef = useRef(onToc);
  onTocRef.current = onToc;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const initialCfiRef = useRef(initialCfi);
  const findRef = useRef(find ?? null);

  useEffect(() => {
    if (!controllerRef) return;
    controllerRef.current = { display: (href) => void renditionRef.current?.display(href) };
    return () => {
      controllerRef.current = null;
    };
  }, [controllerRef]);

  const scrollerEl = useCallback(() => containerRef.current?.querySelector<HTMLElement>(".epub-container") ?? null, []);

  // ---------------------------------------------------------------------
  // Read aloud. The voice reads what the page shows: the section on screen
  // block by block, starting at the first one in view, and the sections
  // after it as it gets to them (see readAloudText.ts for why not the
  // book's extracted text). Pieces are named "e:<section>:<block>:<piece>".

  const blocksOf = (doc: Document) => {
    let entry = blocksCache.current.get(doc);
    if (!entry) {
      const blocks = collectSpeechBlocks(doc);
      entry = { blocks, texts: blocks.map(speechTextOf) };
      blocksCache.current.set(doc, entry);
    }
    return entry;
  };

  /** The chapter a section belongs to: its own contents entry, or the last
   * one before it -- a long chapter is often split across several files and
   * only the first is in the contents. */
  const chapterOf = (book: Book, index: number): string | null => {
    for (let i = index; i >= 0; i--) {
      const href = book.spine.get(i)?.href;
      const label = href ? labelForHref(tocRef.current, href) : null;
      if (label) return label;
    }
    return null;
  };

  /** Where the section on screen's blocks are, in the frame's coordinates,
   * and the part of the frame the pane shows; null before it is laid out. */
  const measureBlocks = (contents: Contents) => {
    const frame = contents.document.defaultView?.frameElement;
    const scroller = scrollerEl();
    if (!frame || !scroller) return null;
    const frameTop = frame.getBoundingClientRect().top;
    const view = scroller.getBoundingClientRect();
    const rects = blocksOf(contents.document).blocks.map((block) => {
      const rect = rangeOfBlock(block).getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, shown: rect.width > 0 || rect.height > 0 };
    });
    return { rects, viewTop: view.top - frameTop, viewBottom: view.bottom - frameTop };
  };

  /** Hands the sections after `from` to the reading as the voice nears the
   * end of what it has, until the book ends or the reading is no longer
   * this one. */
  const keepLoading = async (book: Book, gen: number, from: number) => {
    const { title, paneId: pane } = readingRef.current;
    const ours = (s: ReturnType<typeof useTtsStore.getState>) =>
      bookRef.current === book && readGenRef.current === gen && s.sourceKind === "resource" && s.title === title && s.paneId === pane && s.segments.length > 0;
    const total = spineCountRef.current;
    for (let next = from; next < total; next++) {
      if (!(await whenMoreWanted(ours))) return;
      const segments = await loadSectionSegments(book, next, chapterOf(book, next));
      if (!ours(useTtsStore.getState())) return;
      const done = next + 1 >= total;
      if (segments.length > 0 || done) useTtsStore.getState().appendSegments(title, pane, segments, { done });
    }
  };

  /**
   * Carries on loading a reading of this book that the reader before this
   * one was loading: the pane showed the book a moment ago and has opened it
   * afresh, at a citation say (see `takeOverLoading`). The voice is somewhere
   * in what that reader handed over, and loading goes on from the section
   * after it as the voice nears the end.
   */
  const carryOnLoading = (book: Book) => {
    const { title, paneId: pane } = readingRef.current;
    const from = nextAfterReading(useTtsStore.getState().segments, "e");
    if (from == null || from >= spineCountRef.current) {
      endLoading(title, pane);
      return;
    }
    void keepLoading(book, ++readGenRef.current, from);
  };
  const carryOnRef = useRef(carryOnLoading);
  carryOnRef.current = carryOnLoading;

  /**
   * Starts a fresh reading of the section on screen, at block `from` or at
   * the first block in view: the whole section is the reading's opening (so
   * Previous can go back up the page), the voice begins at that block, and
   * the sections after it load as they are wanted. Blocks the page does not
   * show at all (hidden by the book's stylesheet) are left out. A page with
   * nothing to say from there on -- a cover, a picture, the last line of a
   * chapter -- begins at the next section that has something.
   */
  const startReading = async (book: Book, contents: Contents, from: number | "view") => {
    const gen = ++readGenRef.current;
    const { title, paneId: pane } = readingRef.current;
    const section = contents.sectionIndex;
    const total = spineCountRef.current;
    const { blocks } = blocksOf(contents.document);
    const layout = measureBlocks(contents);
    const block = from !== "view" ? from : layout ? startIndexForView(layout.rects, layout.viewTop, layout.viewBottom) : 0;
    const hidden = layout ? (b: number) => !layout.rects[b]?.shown : undefined;
    let segments = epubSegments(blocks, section, chapterOf(book, section), hidden);
    let startIndex = segmentIndexAtBlock(segments, "e", section, block);
    let next = section + 1;
    for (let tries = 0; startIndex < 0 && next < total && tries < MAX_SILENT_SECTIONS; tries++) {
      const more = await loadSectionSegments(book, next, chapterOf(book, next));
      next += 1;
      if (bookRef.current !== book || readGenRef.current !== gen) return;
      if (more.length > 0) {
        startIndex = segments.length;
        segments = segments.concat(more);
      }
    }
    if (startIndex < 0) {
      toast.info("There is nothing from here on that the voice can read aloud.");
      return;
    }
    useTtsStore.getState().start(title, "resource", segments, { startIndex, paneId: pane, more: next < total });
    // Begun past the page on screen: show where the voice is.
    const first = parseSpeechId(segments[startIndex].id);
    const rendition = renditionRef.current;
    if (first && first.parts[0] !== section && rendition) {
      const href = book.spine.get(first.parts[0])?.href;
      if (href) void rendition.display(href).catch(() => {});
    }
    if (next < total) void keepLoading(book, gen, next);
  };

  /** Read from block `block` of a section on screen: a move within the
   * reading when it already holds that block, a fresh reading otherwise. */
  const readFromBlock = (contents: Contents, block: number) => {
    const book = bookRef.current;
    if (!book) return;
    const s = useTtsStore.getState();
    const { title, paneId: pane } = readingRef.current;
    if (isReadingHere(s, title, pane)) {
      const { blocks } = blocksOf(contents.document);
      // The block's first piece identifies it in the reading; a block with
      // nothing to say hands over to the next one that has something.
      let from = block;
      while (from < blocks.length && splitForSpeech(blocks[from].text).length === 0) from += 1;
      const firstPiece = from < blocks.length ? splitForSpeech(blocks[from].text)[0] : null;
      const at = segmentIndexForBlock(s.segments, "e", contents.sectionIndex, from, firstPiece);
      if (at >= 0) {
        s.readFrom(title, "resource", s.segments, at, { paneId: pane, more: s.more });
        return;
      }
    }
    void startReading(book, contents, block);
  };

  /** Read from where the selection in the book begins; false when there is
   * no selection to read from. */
  const readFromSelection = (): boolean => {
    const rendition = renditionRef.current;
    if (!rendition) return false;
    for (const contents of contentsOf(rendition)) {
      const selection = contents.window.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) continue;
      const range = selection.getRangeAt(0);
      const container = range.startContainer;
      const node = container.nodeType === 1 ? (container.childNodes[range.startOffset] ?? container) : container;
      const block = blockIndexFrom(blocksOf(contents.document).blocks, node);
      if (block < 0) continue;
      readFromBlock(contents, block);
      return true;
    }
    return false;
  };

  const readAloud = (from: ReadAloudFrom) => {
    const rendition = renditionRef.current;
    const book = bookRef.current;
    const contents = rendition ? contentsOf(rendition)[0] : undefined;
    if (!book || !contents) {
      toast.info("The book is still opening.");
      return;
    }
    if (from === "selection" && readFromSelection()) return;
    void startReading(book, contents, "view");
  };
  const readAloudFnRef = useRef(readAloud);
  readAloudFnRef.current = readAloud;

  useEffect(() => {
    if (!readAloudRef) return;
    readAloudRef.current = { readAloud: (from) => readAloudFnRef.current(from) };
    return () => {
      readAloudRef.current = null;
    };
  }, [readAloudRef]);

  /** While this pane is reading the book, a click on a paragraph (not a
   * link, and not the end of a drag that selected words) reads from there. */
  const onBookClick = (event: MouseEvent, contents: Contents) => {
    if (event.button !== 0 || event.defaultPrevented) return;
    const target = event.target as Element | null;
    if (!target || target.nodeType !== 1 || target.closest("a[href]")) return;
    const selection = contents.window.getSelection();
    if (selection && !selection.isCollapsed) return;
    const { title, paneId: pane } = readingRef.current;
    if (!isReadingHere(useTtsStore.getState(), title, pane)) return;
    const block = blockIndexAt(blocksOf(contents.document).blocks, target);
    if (block >= 0) readFromBlock(contents, block);
  };
  const onBookClickRef = useRef(onBookClick);
  onBookClickRef.current = onBookClick;

  /**
   * Following the voice: the block being read is marked on the page and,
   * with auto-scroll on, kept in view. When the voice moves on into the next
   * section, the page goes with it -- if the reader was following, that is:
   * the section on screen was the one just being read. A reader who had gone
   * elsewhere to look something up is left where they are.
   *
   * Called on every change of the passage being read, and again (forced)
   * whenever a section's page is rebuilt, since the mark lived in the frame
   * that was thrown away. The scroll waits for epub.js to have sized the new
   * frame; before that, where a block sits is not yet known.
   */
  const followRef = useRef<(opts?: { force?: boolean; scroll?: boolean }) => void>(() => {});
  useEffect(() => {
    let key = "";
    let lastSection: number | null = null;
    let marked: Element | null = null;
    /** Loose text being read, marked as a range rather than by its element
     * (see `markBlock`). */
    let markedRange: { registry: HighlightRegistry; block: SpeechBlock } | null = null;
    const unmark = () => {
      marked?.removeAttribute(SPEAKING_ATTR);
      marked = null;
      markedRange?.registry.delete(SPEAKING_HIGHLIGHT);
      markedRange = null;
    };
    /**
     * Marks the block being read. Usually that is its element, a paragraph or
     * a heading. But a block can be loose text in an element that holds other
     * blocks too -- CCEL's front matter is `<div class="footer"><h4>Copyright
     * ...</h4> All rights reserved...</div>` -- and marking that element
     * marked the heading read before it as well. Such text is marked as a
     * range of its own, where the frame can do that.
     */
    const markBlock = (blocks: readonly SpeechBlock[], at: number) => {
      const block = blocks[at];
      const loose = blocks.some((other, i) => i !== at && block.element.contains(other.element));
      const view = block.element.ownerDocument.defaultView as (Window & typeof globalThis) | null;
      const registry = loose ? view?.CSS?.highlights : undefined;
      if (registry && view?.Highlight) {
        if (markedRange?.block === block && !marked) return;
        unmark();
        registry.set(SPEAKING_HIGHLIGHT, new view.Highlight(rangeOfBlock(block)));
        markedRange = { registry, block };
        return;
      }
      if (block.element === marked && marked.isConnected && !markedRange) return;
      unmark();
      block.element.setAttribute(SPEAKING_ATTR, "");
      marked = block.element;
    };
    const follow = ({ force = false, scroll = true }: { force?: boolean; scroll?: boolean } = {}) => {
      const rendition = renditionRef.current;
      const book = bookRef.current;
      const s = useTtsStore.getState();
      const { title, paneId: pane } = readingRef.current;
      const index = s.currentSegmentIndex;
      const segment = s.isPlaying && s.sourceKind === "resource" && s.title === title && s.paneId === pane ? s.segments[index] : undefined;
      const id = segment ? parseSpeechId(segment.id) : null;
      const nextKey = segment && id?.kind === "e" ? String(segment.id) : "";
      if (!force && nextKey === key) return;
      key = nextKey;
      if (!rendition || !book || !segment || !id || id.kind !== "e") {
        unmark();
        lastSection = null;
        return;
      }
      const section = id.parts[0];
      const shown = contentsOf(rendition)[0];
      const shownSection = shown?.sectionIndex ?? null;
      const previous = lastSection;
      lastSection = section;
      if (!shown || shownSection !== section) {
        unmark();
        if (previous != null && previous !== section && previous === shownSection) {
          const href = book.spine.get(section)?.href;
          if (href) void rendition.display(href).catch(() => {});
        }
        return;
      }
      const { blocks, texts } = blocksOf(shown.document);
      const at = blockIndexForPiece(texts, id.parts[1], segment.text);
      if (at >= 0) markBlock(blocks, at);
      else unmark();
      if (at < 0 || !scroll || !s.autoScroll) return;
      const frame = shown.document.defaultView?.frameElement;
      const scroller = scrollerEl();
      if (!frame || !scroller) return;
      const rect = rangeOfBlock(blocks[at]).getBoundingClientRect();
      if (rect.height <= 0) return;
      const frameTop = frame.getBoundingClientRect().top;
      const view = scroller.getBoundingClientRect();
      const delta = revealOffset(
        { top: frameTop + rect.top, bottom: frameTop + rect.bottom },
        { top: view.top, bottom: view.bottom },
        fractionThroughBlock(s.segments, index),
      );
      if (Math.abs(delta) > 1) scroller.scrollBy({ top: delta, behavior: "smooth" });
    };
    followRef.current = follow;
    const unsubscribe = useTtsStore.subscribe(() => follow());
    follow({ force: true });
    return () => {
      unsubscribe();
      unmark();
      followRef.current = () => {};
    };
  }, [scrollerEl]);

  /** A page down (or up) that runs on into the next section at the end of
   * this one, so a book can be read on the space bar alone. */
  const pageBy = useCallback(
    (direction: 1 | -1) => {
      const el = scrollerEl();
      const rendition = renditionRef.current;
      if (!el || !rendition) return;
      const atEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
      const atStart = el.scrollTop <= 2;
      if (direction > 0 && atEnd) {
        void rendition.next();
      } else if (direction < 0 && atStart) {
        void rendition.prev();
      } else {
        el.scrollBy({ top: direction * Math.max(120, el.clientHeight - PAGE_OVERLAP_PX), behavior: "smooth" });
      }
    },
    [scrollerEl],
  );

  const handleKey = useCallback(
    (event: { key: string; altKey: boolean; ctrlKey: boolean; metaKey: boolean; target: EventTarget | null; preventDefault: () => void }) => {
      // Ctrl and = / - / 0 zoom the page here, in place of the app's text
      // size: a book has its own zoom, and this is where it is being read.
      if ((event.ctrlKey || event.metaKey) && !event.altKey) {
        if (event.key === "=" || event.key === "+") zoomBy(1);
        else if (event.key === "-" || event.key === "_") zoomBy(-1);
        else if (event.key === "0") setZoom(100);
        else return;
        event.preventDefault();
        return;
      }
      if (event.altKey) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName ?? "";
      if (target?.isContentEditable || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON") return;
      const el = scrollerEl();
      switch (event.key) {
        case " ":
        case "PageDown":
          pageBy(1);
          break;
        case "PageUp":
          pageBy(-1);
          break;
        case "ArrowRight":
          void renditionRef.current?.next();
          break;
        case "ArrowLeft":
          void renditionRef.current?.prev();
          break;
        case "ArrowDown":
          el?.scrollBy({ top: 80 });
          break;
        case "ArrowUp":
          el?.scrollBy({ top: -80 });
          break;
        case "Home":
          el?.scrollTo({ top: 0, behavior: "smooth" });
          break;
        case "End":
          el?.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
          break;
        default:
          return;
      }
      event.preventDefault();
    },
    [pageBy, scrollerEl, zoomBy, setZoom],
  );
  // Keys pressed inside the book land in its iframe rather than in this
  // document, so the rendition forwards them to the same handler.
  const handleKeyRef = useRef(handleKey);
  handleKeyRef.current = handleKey;

  /** Ctrl+wheel zooms the page, wherever in the reader the pointer is. */
  const handleWheel = useCallback(
    (event: { ctrlKey: boolean; deltaY: number; preventDefault: () => void }) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      if (event.deltaY !== 0) zoomBy(event.deltaY < 0 ? 1 : -1);
    },
    [zoomBy],
  );
  const handleWheelRef = useRef(handleWheel);
  handleWheelRef.current = handleWheel;

  /**
   * epub.js's paginated flow (CSS multi-column) computes its column track
   * from the container's pixel size and is fragile against a book's own
   * stylesheet: the title page would show, then every "page" after it
   * landed on empty horizontal space. Scrolled flow sidesteps that whole
   * class of bug, at the cost of paging between sections rather than
   * columns.
   *
   * The manager is the plain one rather than "continuous": the continuous
   * manager keeps neighbouring sections rendered and, as it drops the ones
   * that scroll out of view, subtracts their height from the scroll
   * position to compensate -- which is exactly the jerk and jump you feel
   * while reading. One section at a time scrolls natively and smoothly.
   */
  useEffect(() => {
    const host = containerRef.current;
    if (!host) return;
    setStatus("loading");
    setChapter(null);
    setProgress(NO_PROGRESS);
    setScrub(null);
    tocRef.current = [];

    const book = ePub(convertFileSrc(filePath));
    bookRef.current = book;
    let disposed = false;
    let resizeTimer: number | null = null;
    let locationsTimer: number | null = null;
    // A reading of this book that the reader before this one, in this pane,
    // was still loading is this one's to carry on with once the book is
    // open. It is claimed now, in the same pass that closed that reader, or
    // the reading would be told nothing more is coming.
    const reading = readingRef.current;
    let takingOver = reading.title !== "" && takeOverLoading(reading.title, reading.paneId);

    const rendition = book.renderTo(host, {
      width: "100%",
      height: "100%",
      flow: "scrolled-doc",
      manager: "default",
      allowScriptedContent: false,
      // A book that declares itself fixed-layout is read here as a
      // reflowable one. epub.js honours "pre-paginated" by shrinking each
      // page to fit the pane in both directions, which is the whole page
      // visible and none of it readable -- and for a scanned book, which
      // is what fixed layout nearly always means here, unreadable is the
      // only thing that matters. Reflowed, the page runs the width of the
      // pane and scrolls like any other.
      layout: "reflowable",
      // "scroll" rather than the default "auto", which gives epub.js's
      // scroller `overflow-y: scroll; overflow-x: hidden`. Both halves
      // matter: a vertical scrollbar that comes and goes with the length
      // of a chapter would narrow the page each time it appeared, and the
      // width epub.js measured before it appeared is what leaves a
      // scrollbar's worth of sideways scroll under the text.
      overflow: "scroll",
    });
    renditionRef.current = rendition;

    rendition.on("keydown", (event: KeyboardEvent) => handleKeyRef.current(event));

    // On a touch screen a quick sideways swipe turns to the next section or
    // back, as Next and Previous do; an up-and-down one scrolls, as ever.
    let swipe: { x: number; y: number; at: number } | null = null;
    rendition.on("touchstart", (event: TouchEvent) => {
      const t = event.touches[0];
      swipe = event.touches.length === 1 && t ? { x: t.screenX, y: t.screenY, at: Date.now() } : null;
    });
    rendition.on("touchend", (event: TouchEvent) => {
      const t = event.changedTouches[0];
      const from = swipe;
      swipe = null;
      if (!from || !t || Date.now() - from.at > 600) return;
      const dx = t.screenX - from.x;
      const dy = t.screenY - from.y;
      if (Math.abs(dx) < 60 || Math.abs(dx) < 2 * Math.abs(dy)) return;
      void (dx < 0 ? rendition.next() : rendition.prev());
    });

    rendition.hooks.content.register((contents: Contents) => {
      const doc = contents.document;
      // Both of these read the book's own styling, so they run before the
      // reader's stylesheet replaces it.
      const invisible = pinInvisibleText(doc);
      const scan = markScannedPage(doc, invisible);
      void contents.addStylesheetCss(cssRef.current, EPUB_STYLE_KEY);
      if (scan) {
        fitScannedPage(doc, zoomRef.current / 100);
        // A scan's width is only final once the image has arrived.
        for (const image of doc.images) {
          if (!image.complete) image.addEventListener("load", () => fitScannedPage(doc, zoomRef.current / 100), { once: true });
        }
      } else {
        unstackPositionedElements(doc, invisible);
      }
      addRunOut(doc);
      // The sheet fills the pane's height; images that arrive later push
      // the text down, so the padding is redone as each one loads.
      const pad = () => padSheetToHeight(doc, (hostRef.current?.clientHeight ?? 0) - DESK_MARGIN_PX);
      pad();
      for (const image of doc.images) {
        if (!image.complete) image.addEventListener("load", pad, { once: true });
      }
      routeExternalLinks(doc);
      // The wheel inside the frame never reaches this document.
      doc.addEventListener("wheel", (e) => handleWheelRef.current(e), { passive: false });
      // A click on a paragraph while the book is being read aloud reads
      // from there.
      doc.addEventListener("click", (e) => onBookClickRef.current(e, contents));
      // The selection is this frame's own, and a new frame starts without
      // one. It is reported cleared when it goes, as `onSelect` promises --
      // before, "Send to sermon" went on quoting words the reader had long
      // since clicked away from.
      if (hasSelectionRef.current) {
        hasSelectionRef.current = false;
        setHasSelection(false);
        onSelectRef.current?.("", null);
      }
      doc.addEventListener("selectionchange", () => {
        if (disposed) return;
        const selection = doc.getSelection();
        const has = !!selection && !selection.isCollapsed && selection.toString().trim() !== "";
        if (has === hasSelectionRef.current) return;
        hasSelectionRef.current = has;
        setHasSelection(has);
        if (!has) onSelectRef.current?.("", null);
      });
      // The block being read aloud is marked again in the new frame.
      followRef.current({ force: true, scroll: false });
    });

    rendition.on("rendered", () => {
      if (disposed) return;
      // Now the frame has its size, the block being read can be brought
      // into view.
      window.setTimeout(() => {
        if (!disposed) followRef.current({ force: true });
      }, 120);
      setStatus("ready");
      // A scroll that runs off the end of a chapter should stop there
      // rather than carry on into whatever is behind the pane. The
      // scroller is epub.js's own element, so it is styled once it exists.
      const scroller = host.querySelector<HTMLElement>(".epub-container");
      if (scroller) scroller.style.overscrollBehavior = "contain";
    });

    // epubjs renders each section in its own iframe, so a selection there
    // never reaches window.getSelection(); the rendition reports it instead.
    rendition.on("selected", (cfiRange: string, contents: { window: Window }) => {
      const text = (contents.window.getSelection()?.toString() ?? "").replace(/\s+/g, " ").trim();
      onSelectRef.current?.(text, text ? cfiRange : null);
    });

    rendition.on("relocated", (loc: { start?: { cfi?: string; href?: string; index?: number } }) => {
      if (disposed) return;
      const cfi = loc?.start?.cfi;
      const href = loc?.start?.href;
      if (cfi && href) onLocationRef.current?.({ cfi, href });
      if (href) setChapter(labelForHref(tocRef.current, href));
      setProgress((prev) => ({
        index: loc?.start?.index ?? prev.index,
        total: prev.total,
        percent: cfi ? percentOf(book, cfi) : prev.percent,
      }));
    });

    book.loaded.navigation
      .then((nav) => {
        if (disposed) return;
        tocRef.current = flattenToc(nav.toc);
        onTocRef.current?.(tocRef.current);
        // The first section can be on screen before its name is known.
        const href = rendition.location?.start?.href;
        if (href) setChapter(labelForHref(tocRef.current, href));
      })
      // A missing or malformed table of contents is not a reason to refuse
      // the book: it reads perfectly well, just without chapter names in the
      // header and an empty contents list. Left uncaught this was an
      // unhandled rejection instead.
      .catch(() => {});

    // `.then(onOk, onErr)` caught a rejected `book.ready` but not a throw
    // inside `onOk` itself -- and everything below runs in there. A trailing
    // `.catch` covers both, so a book that fails partway through opening says
    // so rather than leaving the pane blank.
    book.ready
      .then(() => {
        if (disposed) return;
        skipSectionsWithNoFile(book);
        let total = 0;
        book.spine.each(() => {
          total += 1;
        });
        spineCountRef.current = total;
        setProgress((prev) => ({ ...prev, total }));
        if (takingOver) {
          takingOver = false;
          carryOnRef.current(book);
        }

        // Restoring a CFI before the spine has loaded silently fails, so
        // the first display waits for the book to be ready. A CFI from
        // another edition (or a book that changed on disk) falls back to
        // the beginning rather than an empty view.
        const target = initialCfiRef.current;
        const wanted = findRef.current;
        const shown = wanted ? findAndShow(book, rendition, wanted, () => disposed) : target ? rendition.display(target) : rendition.display();
        shown?.catch?.(() => {
          if (!disposed) void rendition.display();
        });

        // Reading every section to work out how long the book is costs a
        // second or two, so it happens once the reader is already reading.
        locationsTimer = window.setTimeout(() => {
          book.locations
            .generate(LOCATION_CHARS)
            .then(() => {
              if (disposed) return;
              const cfi = rendition.location?.start?.cfi;
              setProgress((prev) => ({ ...prev, percent: cfi ? percentOf(book, cfi) : prev.percent }));
            })
            .catch(() => {});
        }, LOCATIONS_DELAY_MS);
      })
      .catch(() => {
        if (disposed) return;
        setStatus("error");
        // A book that will not open has nothing more to give a reading.
        if (takingOver) {
          takingOver = false;
          endLoading(readingRef.current.title, readingRef.current.paneId);
        }
      });

    // A pane being dragged wider changes size every frame; each change
    // re-renders the section, so only the size it settles at is acted on.
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (disposed || width <= 0 || height <= 0) return;
      if (resizeTimer != null) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        if (disposed) return;
        for (const contents of contentsOf(rendition)) padSheetToHeight(contents.document, height - DESK_MARGIN_PX);
        resizeToContainer(rendition);
      }, RESIZE_SETTLE_MS);
    });
    observer.observe(host);

    return () => {
      disposed = true;
      if (resizeTimer != null) window.clearTimeout(resizeTimer);
      if (locationsTimer != null) window.clearTimeout(locationsTimer);
      observer.disconnect();
      book.destroy();
      renditionRef.current = null;
      bookRef.current = null;
      spineCountRef.current = 0;
      // A reading this reader was loading (or had claimed) is let go of: the
      // reader that replaces this one takes it over if it is the same book
      // in the same pane, and otherwise it goes on with what it has.
      if (readGenRef.current > 0 || takingOver) letGoOfLoading(readingRef.current.title, readingRef.current.paneId);
    };
  }, [filePath]);

  // Type size, spacing, font, measure and theme are restyling, not
  // re-rendering: the stylesheet is replaced in place and the reader keeps
  // their place in the book.
  useEffect(() => {
    const rendition = renditionRef.current;
    if (!rendition) return;
    for (const contents of contentsOf(rendition)) {
      void contents.addStylesheetCss(css, EPUB_STYLE_KEY);
      // A scan's zoom is inline (it multiplies the fit), so it is redone
      // by hand; the frame's height follows once epub.js re-measures.
      if (isScannedPage(contents.document)) fitScannedPage(contents.document, zoom / 100);
      padSheetToHeight(contents.document, (hostRef.current?.clientHeight ?? 0) - DESK_MARGIN_PX);
    }
    // The section's height changed with its zoom; ask epub.js to measure
    // the frame again so nothing is cut off or left as empty desk.
    const timer = window.setTimeout(() => resizeToContainer(rendition), 60);
    return () => window.clearTimeout(timer);
  }, [css, zoom]);

  function commitScrub() {
    const value = scrub;
    setScrub(null);
    const book = bookRef.current;
    const rendition = renditionRef.current;
    if (value == null || !book || !rendition) return;
    const cfi = book.locations.cfiFromPercentage(value / 1000);
    if (cfi) void rendition.display(cfi);
  }

  const percent = scrub != null ? scrub / 1000 : progress.percent;
  const canScrub = progress.percent != null;
  const atFirstSection = progress.total > 0 && progress.index <= 0;
  const atLastSection = progress.total > 0 && progress.index >= progress.total - 1;

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line bg-surface px-2">
        <span className="min-w-0 flex-1 truncate text-xs text-ink-3" title={chapter ?? undefined}>
          {chapter ?? ""}
        </span>
        {readAloudTitle && <ReadAloudControls compact title={readAloudTitle} onRead={(from) => readAloudFnRef.current(from)} hasSelection={hasSelection} />}
        <div className="flex items-center gap-0.5" role="group" aria-label="Page zoom">
          <IconButton icon={ZoomOut} label="Zoom out (Ctrl+-)" size="sm" onClick={() => zoomBy(-1)} disabled={zoom <= EPUB_ZOOM_MIN} />
          <button
            type="button"
            className="min-w-[3.25rem] rounded px-1 text-center text-xs tabular-nums text-ink-2 hover:bg-hover"
            onClick={() => setZoom(100)}
            title="Page zoom; click to reset to 100% (Ctrl+0)"
            aria-label={`Page zoom ${zoom} percent; reset to 100 percent`}
          >
            {zoom}%
          </button>
          <IconButton icon={ZoomIn} label="Zoom in (Ctrl+=)" size="sm" onClick={() => zoomBy(1)} disabled={zoom >= EPUB_ZOOM_MAX} />
          <IconButton icon={MoveHorizontal} label="Fit the page to the pane's width" size="sm" onClick={fitWidth} />
        </div>
        <Popover
          width="w-72"
          trigger={({ toggle, open }) => <IconButton icon={Type} label="Text size, spacing, font, and page width" size="sm" active={open} onClick={toggle} />}
        >
          <Field label="Text size">
            <div className="flex items-center gap-1">
              <IconButton
                icon={Minus}
                label="Smaller text"
                size="sm"
                variant="secondary"
                disabled={useBookStyles || fontSize <= FONT_SIZE_MIN}
                onClick={() => setFontSize(Math.max(FONT_SIZE_MIN, fontSize - 1))}
              />
              <span className="min-w-[3rem] text-center text-sm tabular-nums text-ink">{fontSize}px</span>
              <IconButton
                icon={Plus}
                label="Larger text"
                size="sm"
                variant="secondary"
                disabled={useBookStyles || fontSize >= FONT_SIZE_MAX}
                onClick={() => setFontSize(Math.min(FONT_SIZE_MAX, fontSize + 1))}
              />
            </div>
          </Field>
          <Field label="Line spacing">
            <div className="flex gap-1">
              {LINE_SPACING_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  size="sm"
                  className="flex-1"
                  disabled={useBookStyles}
                  active={!useBookStyles && lineSpacing === option.value}
                  onClick={() => setLineSpacing(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </Field>
          <Field label="Font">
            <select
              value={readingFont}
              disabled={useBookStyles}
              onChange={(e) => setReadingFont(e.target.value as ReadingFont)}
              className={cx(selectSmClass, "w-full")}
            >
              {READING_FONT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Page width">
            <select value={epubWidth} onChange={(e) => setEpubWidth(e.target.value as EpubWidth)} className={cx(selectSmClass, "w-full")}>
              {EPUB_WIDTH_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <label className="mt-3 flex cursor-pointer items-start gap-2 border-t border-line pt-2.5 text-sm text-ink-2">
            <input type="checkbox" className={cx(checkboxClass, "mt-0.5")} checked={useBookStyles} onChange={(e) => setUseBookStyles(e.target.checked)} />
            <span>
              Use the book's own styling
              <span className="block text-xs text-ink-4">Shows the publisher's colours and type instead of yours.</span>
            </span>
          </label>
          <p className="mt-2 text-xs text-ink-4">Size, spacing and font are shared with the Bible and commentaries. The zoom buttons above the page (or Ctrl+scroll) scale this book alone.</p>
        </Popover>
      </div>

      <div
        ref={hostRef}
        tabIndex={0}
        role="region"
        aria-label="Book text"
        onKeyDown={handleKey}
        onWheel={handleWheel}
        className="relative min-h-0 flex-1 bg-surface-2 outline-none"
      >
        <div ref={containerRef} className="absolute inset-0" />
        {status !== "ready" && (
          <div className="absolute inset-0 flex items-center justify-center bg-bg p-8 text-center">
            {status === "loading" ? (
              <LoadingState label="Opening book…" />
            ) : (
              <p className="text-sm text-ink-3">This book could not be opened. The file may be damaged or not a valid EPUB.</p>
            )}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t border-line bg-surface px-2 py-1.5">
        <Button
          size="sm"
          icon={ChevronLeft}
          disabled={atFirstSection}
          onClick={() => void renditionRef.current?.prev()}
          title="Previous section (Left arrow)"
        >
          Previous
        </Button>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <input
            type="range"
            min={0}
            max={1000}
            step={1}
            value={Math.round((percent ?? 0) * 1000)}
            disabled={!canScrub}
            aria-label="Position in the book"
            className="h-1 min-w-0 flex-1 accent-accent disabled:opacity-40"
            onChange={(e) => setScrub(Number(e.target.value))}
            onPointerUp={commitScrub}
            onKeyUp={commitScrub}
            onBlur={commitScrub}
          />
          <span className="shrink-0 text-xs tabular-nums text-ink-3" title={percent != null ? "How far through the book you are" : "Section of the book"}>
            {percent != null ? `${Math.round(percent * 100)}%` : progress.total > 0 ? `${progress.index + 1} / ${progress.total}` : "…"}
          </span>
        </div>
        <Button size="sm" disabled={atLastSection} onClick={() => void renditionRef.current?.next()} title="Next section (Right arrow)">
          Next
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

/**
 * Finds the `occurrence`-th printing of `find.text` in the book, section by
 * section, and shows it marked. Falls back to `find.fallback` when the words
 * as printed are not found (the extracted text a citation was found in and
 * the rendered page can differ in spacing), and to the start when neither is.
 */
type SpineSection = {
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
function exactHits(section: SpineSection, doc: Document | null, text: string): { cfi: string }[] {
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

async function findAndShow(book: Book, rendition: Rendition, find: { text: string; occurrence: number; fallback?: string }, disposed: () => boolean): Promise<void> {
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

/** How far through the book a CFI sits, or null before the locations that
 * answer that have been generated. */
function percentOf(book: Book, cfi: string): number | null {
  try {
    if (book.locations.length() === 0) return null;
    const value = book.locations.percentageFromCfi(cfi);
    return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : null;
  } catch {
    return null;
  }
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-2.5">
      <div className="mb-1 text-xs font-medium text-ink-3">{label}</div>
      {children}
    </div>
  );
}
