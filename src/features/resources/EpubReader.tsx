import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
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
import { flatten, printedAt } from "./findPrinted";
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

/** Re-measures the frame against its container. epub.js types both
 * arguments as required, but omitting them is what asks it to measure. */
function resizeToContainer(rendition: Rendition): void {
  (rendition as unknown as { resize: (width?: number, height?: number) => void }).resize();
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
}: {
  filePath: string;
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

  const css = useMemo(() => {
    // themeVersion carries no value of its own; changing is its whole
    // purpose, because the colours are read from the theme's tokens.
    void themeVersion;
    return buildEpubCss({ fontSize, lineSpacing, readingFont, width: epubWidth, useBookStyles, zoom });
  }, [fontSize, lineSpacing, readingFont, epubWidth, useBookStyles, zoom, themeVersion]);

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
    });

    rendition.on("rendered", () => {
      if (disposed) return;
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
        let total = 0;
        book.spine.each(() => {
          total += 1;
        });
        setProgress((prev) => ({ ...prev, total }));

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
        if (!disposed) setStatus("error");
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
function exactHits(section: SpineSection, text: string): { cfi: string }[] {
  const doc = section.document;
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
        await item.load(book.load.bind(book));
        const hits = exactHits(item, text);
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
