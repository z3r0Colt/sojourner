import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { convertFileSrc } from "../../lib/platform";
import * as pdfjsLib from "pdfjs-dist";
import type { TextItem } from "pdfjs-dist/types/src/display/api";
// eslint-disable-next-line import/no-unresolved
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, MoveHorizontal, X, ZoomIn, ZoomOut } from "lucide-react";
import { Button, IconButton } from "../../components/ui/Button";
import { cx, inputSmClass } from "../../components/ui/classes";
import { toast } from "../../components/ui/toast";
import { useTtsStore, type TtsSegment } from "../../state/ttsStore";
import { usePaneOptional } from "../../workspace/PaneContext";
import { ReadAloudControls } from "./ReadAloudControls";
import { endLoading, isReadingHere, letGoOfLoading, takeOverLoading, whenMoreWanted } from "./readAloudLoading";
import {
  fractionThroughBlock,
  nextAfterReading,
  paragraphAt,
  parseSpeechId,
  pdfParagraphs,
  pdfSegments,
  revealOffset,
  segmentIndexAtBlock,
  startIndexForView,
  type PdfParagraph,
  type PdfTextRun,
  type ResourceReadAloudHandle,
} from "./readAloudText";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

/**
 * PDF reader (F3.4): one page at a time on a canvas, remembered page,
 * zoom in and out around a fit-to-width default, and a find box scoped to
 * the page that marks every match on an overlay. Whole-document search
 * stays with the resource index (Ctrl+F).
 */

type Zoom = number | "fit";
const ZOOM_STEP = 1.2;
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 4;
/** Horizontal padding around the page inside the scroll area. */
const PAGE_GUTTER_PX = 32;

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface RenderedPage {
  /** Which page this is: the page number moves before the page is drawn. */
  page: number;
  scale: number;
  viewport: pdfjsLib.PageViewport;
  items: PageTextItem[];
}

type PageTextItem = { str: string; transform: number[]; width: number; height: number; hasEOL: boolean };

function textItemsOf(items: ReadonlyArray<TextItem | object>): PageTextItem[] {
  return items
    .filter((it): it is TextItem => "str" in it)
    .map((it) => ({ str: it.str, transform: it.transform as number[], width: it.width, height: it.height, hasEOL: it.hasEOL }));
}

/** A page's text runs as the paragraph builder takes them, in PDF units. */
function runsOf(items: readonly PageTextItem[]): PdfTextRun[] {
  return items.map((it) => ({
    str: it.str,
    x: it.transform[4],
    y: it.transform[5],
    width: it.width,
    height: it.height > 0 ? it.height : Math.hypot(it.transform[2], it.transform[3]),
    hasEOL: it.hasEOL,
  }));
}

/** A paragraph's box in CSS pixels over the canvas. */
function paragraphRect(viewport: pdfjsLib.PageViewport, p: PdfParagraph): Rect {
  const [x1, y1] = viewport.convertToViewportPoint(p.left, p.top) as number[];
  const [x2, y2] = viewport.convertToViewportPoint(p.right, p.bottom) as number[];
  return { left: Math.min(x1, x2), top: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
}

/** Each open PDF's pages as paragraphs, as they are asked for. A page is
 * read with a look at the pages either side of it (for a sentence that runs
 * over the break), so each is asked for up to three times. */
const pageTextCache = new WeakMap<pdfjsLib.PDFDocumentProxy, Map<number, Promise<string[]>>>();

/** A page's paragraphs. A page that will not give up its text (damaged, or a
 * scan with no text layer) has none. */
function pageParagraphTexts(doc: pdfjsLib.PDFDocumentProxy, page: number): Promise<string[]> {
  if (page < 1 || page > doc.numPages) return Promise.resolve([]);
  let pages = pageTextCache.get(doc);
  if (!pages) {
    pages = new Map();
    pageTextCache.set(doc, pages);
  }
  let found = pages.get(page);
  if (!found) {
    found = doc
      .getPage(page)
      .then((pdfPage) => pdfPage.getTextContent())
      .then((text) => pdfParagraphs(runsOf(textItemsOf(text.items))).map((p) => p.text))
      .catch(() => []);
    pages.set(page, found);
  }
  return found;
}

/** A page as the voice reads it: its paragraphs, or `own` when they are in
 * hand already, with a sentence broken over either page break read whole
 * with the page it began on. */
async function pageSegments(doc: pdfjsLib.PDFDocumentProxy, page: number, own?: string[]): Promise<TtsSegment[]> {
  const [before, here, after] = await Promise.all([
    pageParagraphTexts(doc, page - 1),
    own ?? pageParagraphTexts(doc, page),
    pageParagraphTexts(doc, page + 1),
  ]);
  return pdfSegments(here, page, { lastOfPrevious: before[before.length - 1], firstOfNext: after[0] });
}

/** How many pages past one with no text a reading looks for somewhere to
 * begin, before deciding this is a scan with nothing to read. */
const MAX_SILENT_PAGES = 20;

/** Where each occurrence of `query` sits on the rendered page, in CSS
 * pixels over the canvas. A match inside a text run is placed by its
 * share of the run's width, which is close enough to mark it. */
function findOnPage(page: RenderedPage, query: string): Rect[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out: Rect[] = [];
  for (const item of page.items) {
    const str = item.str;
    if (!str) continue;
    const lower = str.toLowerCase();
    let idx = lower.indexOf(q);
    if (idx < 0) continue;
    const tx = pdfjsLib.Util.transform(page.viewport.transform, item.transform) as number[];
    const fontHeight = Math.hypot(tx[2], tx[3]) || 10;
    const runWidth = item.width * page.viewport.scale;
    while (idx >= 0) {
      const from = idx / str.length;
      const to = (idx + q.length) / str.length;
      out.push({ left: tx[4] + runWidth * from, top: tx[5] - fontHeight, width: Math.max(2, runWidth * (to - from)), height: fontHeight * 1.2 });
      idx = lower.indexOf(q, idx + q.length);
    }
  }
  return out;
}

export function PdfReader({
  filePath,
  initialPage,
  onPageChange,
  readAloudTitle,
  readAloudRef,
}: {
  filePath: string;
  /** The page saved last time (F3.4); read once, on open. */
  initialPage?: number;
  onPageChange?: (page: number) => void;
  /** The book's title, which reading it aloud goes by. Without it the PDF
   * has no read-aloud controls. */
  readAloudTitle?: string;
  /** Filled in with this PDF's read-aloud, for the reader sidebar. */
  readAloudRef?: MutableRefObject<ResourceReadAloudHandle | null>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(Math.max(1, initialPage ?? 1));
  const [numPages, setNumPages] = useState(0);
  const [zoom, setZoom] = useState<Zoom>("fit");
  const [areaWidth, setAreaWidth] = useState(0);
  const [rendered, setRendered] = useState<RenderedPage | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [current, setCurrent] = useState(0);
  const onPageChangeRef = useRef(onPageChange);
  onPageChangeRef.current = onPageChange;
  const paneId = usePaneOptional()?.id ?? null;
  const title = readAloudTitle ?? "";
  /** The title and pane a reading of this PDF goes by, for the loader that
   * runs on long after the render that started it. */
  const readingRef = useRef({ title, paneId });
  readingRef.current = { title, paneId };
  /** Bumped by every reading this reader starts; a loader from an earlier
   * one sees it has been replaced and stops. */
  const readGenRef = useRef(0);
  const speakingRef = useRef<HTMLSpanElement>(null);

  // A PDF that will not open is an ordinary thing for a file someone dragged
  // in: pdf.js rejects with PasswordException on an encrypted one and
  // InvalidPDFException on a damaged one. Without a `.catch` the rejection
  // went to `unhandledrejection`, got logged, and the pane then showed an
  // empty canvas forever with nothing said.
  //
  // The teardown was wrong too. `cleanup()` frees the pages' resources but
  // leaves the document and its worker thread alive, and it does nothing at
  // all if the load has not resolved yet -- so closing a pane while a large
  // PDF was still opening leaked the worker. `task.destroy()` cancels the
  // load if it is still running and tears the worker down either way.
  useEffect(() => {
    let cancelled = false;
    const url = convertFileSrc(filePath);
    setLoadError(null);
    // A reading of this PDF that the reader before this one, in this pane,
    // was still loading is this one's to carry on with once the PDF is open
    // (see `takeOverLoading`). It is claimed now, in the same pass that
    // closed that reader, or the reading would be told nothing more is coming.
    const reading = readingRef.current;
    let takingOver = reading.title !== "" && takeOverLoading(reading.title, reading.paneId);
    const task = pdfjsLib.getDocument({ url });
    task.promise
      .then((doc) => {
        if (cancelled) return;
        docRef.current = doc;
        setNumPages(doc.numPages);
        setPage((p) => Math.min(Math.max(1, p), doc.numPages));
        if (takingOver) {
          takingOver = false;
          carryOnRef.current(doc);
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : String(e));
        // A PDF that will not open has nothing more to give a reading.
        if (takingOver) {
          takingOver = false;
          endLoading(readingRef.current.title, readingRef.current.paneId);
        }
      });
    return () => {
      cancelled = true;
      docRef.current = null;
      void task.destroy();
      // A reading this reader was loading (or had claimed) is let go of: the
      // reader that replaces this one takes it over if it is the same PDF in
      // the same pane, and otherwise it goes on with what it has.
      if (readGenRef.current > 0 || takingOver) letGoOfLoading(readingRef.current.title, readingRef.current.paneId);
    };
  }, [filePath]);

  // Fit-to-width follows the pane as it is resized.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => setAreaWidth(Math.round(entries[0]?.contentRect.width ?? 0)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const doc = docRef.current;
    if (!doc || !canvasRef.current || numPages === 0) return;
    let cancelled = false;
    // The drawing under way, so that the next one can stop it. pdf.js will not
    // draw on a canvas that another render still holds: it throws "Cannot use
    // the same canvas during multiple render() operations", and that landed in
    // the catch below as a PDF that "could not be opened" -- one open in three,
    // in the dev build, where every effect runs twice, and whenever a resize or
    // a zoom came in while a page was drawing. Cancelling hands the canvas back
    // at once, and the cancelled render's rejection is ignored like any other
    // from an effect that has been replaced.
    let renderTask: ReturnType<pdfjsLib.PDFPageProxy["render"]> | null = null;
    // Same gap as the load: a page that will not render (a damaged object
    // stream, a font the worker chokes on) rejected into nothing and left the
    // canvas blank.
    doc
      .getPage(page)
      .then(async (pdfPage) => {
        if (cancelled || !canvasRef.current) return;
        const base = pdfPage.getViewport({ scale: 1 });
        const fitScale = areaWidth > 0 ? Math.max(0.1, (areaWidth - PAGE_GUTTER_PX) / base.width) : 1;
        const scale = zoom === "fit" ? fitScale : zoom;
        const viewport = pdfPage.getViewport({ scale });
        const canvas = canvasRef.current;
        // Draw at the device's pixel density so text stays crisp when zoomed.
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.round(viewport.width * dpr);
        canvas.height = Math.round(viewport.height * dpr);
        canvas.style.width = `${Math.round(viewport.width)}px`;
        canvas.style.height = `${Math.round(viewport.height)}px`;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        renderTask = pdfPage.render({ canvasContext: ctx, viewport, canvas, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined });
        const [, text] = await Promise.all([renderTask.promise, pdfPage.getTextContent()]);
        renderTask = null;
        if (cancelled) return;
        setRendered({ page, scale, viewport, items: textItemsOf(text.items) });
      })
      .catch((e) => {
        if (cancelled || e instanceof pdfjsLib.RenderingCancelledException) return;
        setLoadError(e instanceof Error ? e.message : String(e));
      });
    onPageChangeRef.current?.(page);
    return () => {
      cancelled = true;
      renderTask?.cancel();
      renderTask = null;
    };
  }, [page, numPages, zoom, areaWidth]);

  const matches = useMemo(() => (rendered ? findOnPage(rendered, query) : []), [rendered, query]);
  /** The page on screen as paragraphs: what the voice reads, and what a
   * click while it reads is matched against. */
  const paragraphs = useMemo(() => (rendered ? pdfParagraphs(runsOf(rendered.items)) : []), [rendered]);

  // -------------------------------------------------------------------
  // Read aloud, from the page on screen: its paragraphs from the first in
  // view, then the pages after it as the voice gets to them. Pieces are
  // named "p:<page>:<paragraph>:<piece>".

  const highlightColor = useTtsStore((s) => s.highlightColor);
  const autoScroll = useTtsStore((s) => s.autoScroll);
  const readingHere = useTtsStore((s) => isReadingHere(s, title, paneId));
  const speakingId = useTtsStore((s) =>
    s.isPlaying && s.sourceKind === "resource" && s.title === title && s.paneId === paneId ? String(s.segments[s.currentSegmentIndex]?.id ?? "") : "",
  );
  const speaking = parseSpeechId(speakingId);
  const speakingPage = speaking?.kind === "p" ? speaking.parts[0] : null;
  const speakingParagraph = speaking?.kind === "p" ? speaking.parts[1] : null;
  const speakingRect =
    rendered && rendered.page === speakingPage && speakingParagraph != null && paragraphs[speakingParagraph]
      ? paragraphRect(rendered.viewport, paragraphs[speakingParagraph])
      : null;

  // The page turns with the voice -- if the reader was following along,
  // that is: the page on screen was the one just read. A reader who has
  // gone to another page to look something up is left there.
  const lastSpeakingPage = useRef<number | null>(null);
  useEffect(() => {
    const previous = lastSpeakingPage.current;
    lastSpeakingPage.current = speakingPage;
    if (speakingPage == null || previous == null || previous === speakingPage) return;
    setPage((p) => (p === previous ? speakingPage : p));
  }, [speakingPage]);

  // And the paragraph being read is kept in view, with auto-scroll on.
  useEffect(() => {
    if (!autoScroll) return;
    const mark = speakingRef.current;
    const scroller = scrollRef.current;
    if (!mark || !scroller) return;
    const rect = mark.getBoundingClientRect();
    const view = scroller.getBoundingClientRect();
    const s = useTtsStore.getState();
    const delta = revealOffset({ top: rect.top, bottom: rect.bottom }, { top: view.top, bottom: view.bottom }, fractionThroughBlock(s.segments, s.currentSegmentIndex));
    if (Math.abs(delta) > 1) scroller.scrollBy({ top: delta, behavior: "smooth" });
  }, [speakingId, rendered, autoScroll]);

  /** Hands the pages after `from` to the reading as the voice nears the end
   * of what it has, until the PDF ends or the reading is no longer this one. */
  const keepLoading = async (doc: pdfjsLib.PDFDocumentProxy, gen: number, from: number) => {
    const { title: reading, paneId: pane } = readingRef.current;
    const ours = (s: ReturnType<typeof useTtsStore.getState>) =>
      docRef.current === doc && readGenRef.current === gen && s.sourceKind === "resource" && s.title === reading && s.paneId === pane && s.segments.length > 0;
    for (let next = from; next <= doc.numPages; next++) {
      if (!(await whenMoreWanted(ours))) return;
      const segments = await pageSegments(doc, next);
      if (!ours(useTtsStore.getState())) return;
      const done = next >= doc.numPages;
      if (segments.length > 0 || done) useTtsStore.getState().appendSegments(reading, pane, segments, { done });
    }
  };

  /** Carries on loading a reading of this PDF that the reader before this
   * one was loading, from the page after the last one it holds (see
   * `takeOverLoading`). */
  const carryOnLoading = (doc: pdfjsLib.PDFDocumentProxy) => {
    const { title: reading, paneId: pane } = readingRef.current;
    const from = nextAfterReading(useTtsStore.getState().segments, "p");
    if (from == null || from > doc.numPages) {
      endLoading(reading, pane);
      return;
    }
    void keepLoading(doc, ++readGenRef.current, from);
  };
  const carryOnRef = useRef(carryOnLoading);
  carryOnRef.current = carryOnLoading;

  /** Starts a fresh reading at paragraph `paragraph` of page `startPage`,
   * the whole page being its opening. A page with nothing to say from there
   * on (a plate, a blank, the foot of a chapter) begins at the next page
   * that has something. */
  const startReading = async (startPage: number, paragraph: number) => {
    const doc = docRef.current;
    if (!doc) {
      toast.info("The PDF is still opening.");
      return;
    }
    const gen = ++readGenRef.current;
    const { title: reading, paneId: pane } = readingRef.current;
    // The page on screen is read from the paragraphs it was drawn with, so a
    // click on one of them finds the same paragraph in the reading.
    let segments = await pageSegments(
      doc,
      startPage,
      rendered && rendered.page === startPage ? paragraphs.map((p) => p.text) : undefined,
    );
    if (docRef.current !== doc || readGenRef.current !== gen) return;
    let startIndex = segmentIndexAtBlock(segments, "p", startPage, paragraph);
    let next = startPage + 1;
    for (let tries = 0; startIndex < 0 && next <= doc.numPages && tries < MAX_SILENT_PAGES; tries++) {
      const more = await pageSegments(doc, next);
      next += 1;
      if (docRef.current !== doc || readGenRef.current !== gen) return;
      if (more.length > 0) {
        startIndex = segments.length;
        segments = segments.concat(more);
      }
    }
    if (startIndex < 0) {
      toast.info("There is no text on these pages for the voice to read. The PDF may be a scan: pictures of its pages rather than text.");
      return;
    }
    useTtsStore.getState().start(reading, "resource", segments, { startIndex, paneId: pane, more: next <= doc.numPages });
    const first = parseSpeechId(segments[startIndex].id);
    if (first && first.parts[0] !== startPage) setPage(first.parts[0]);
    if (next <= doc.numPages) void keepLoading(doc, gen, next);
  };

  /** Read aloud from the page on screen, at the first paragraph in view. A
   * PDF is drawn, not typeset -- there are no words to select in it -- so
   * this is also what "from the selection" comes to. */
  const readAloud = () => {
    let paragraph = 0;
    const canvas = canvasRef.current;
    const scroller = scrollRef.current;
    if (rendered && rendered.page === page && canvas && scroller) {
      const top = canvas.getBoundingClientRect().top;
      const view = scroller.getBoundingClientRect();
      const rects = paragraphs.map((p) => {
        const r = paragraphRect(rendered.viewport, p);
        return { top: r.top, bottom: r.top + r.height };
      });
      paragraph = startIndexForView(rects, view.top - top, view.bottom - top);
    }
    void startReading(page, paragraph);
  };
  const readAloudFnRef = useRef(readAloud);
  readAloudFnRef.current = readAloud;

  useEffect(() => {
    if (!readAloudRef) return;
    readAloudRef.current = { readAloud: () => readAloudFnRef.current() };
    return () => {
      readAloudRef.current = null;
    };
  }, [readAloudRef]);

  /** While this pane is reading the PDF, a click on a paragraph of the page
   * reads from there: a move within the reading when it holds that page, a
   * fresh reading otherwise. */
  function readFromClick(event: { button: number; clientX: number; clientY: number }) {
    const canvas = canvasRef.current;
    if (!readingHere || event.button !== 0 || !canvas || !rendered || rendered.page !== page) return;
    const box = canvas.getBoundingClientRect();
    const [x, y] = rendered.viewport.convertToPdfPoint(event.clientX - box.left, event.clientY - box.top) as number[];
    const paragraph = paragraphAt(paragraphs, x, y);
    if (paragraph < 0) return;
    const s = useTtsStore.getState();
    const at = segmentIndexAtBlock(s.segments, "p", page, paragraph);
    if (at >= 0) s.readFrom(title, "resource", s.segments, at, { paneId, more: s.more });
    else void startReading(page, paragraph);
  }
  useEffect(() => setCurrent(0), [query, page]);

  // The current match is kept in view.
  useEffect(() => {
    if (matches.length === 0) return;
    const el = overlayRef.current?.children[current] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "center", inline: "nearest" });
  }, [current, matches]);

  function step(delta: 1 | -1) {
    if (matches.length === 0) return;
    setCurrent((i) => (i + delta + matches.length) % matches.length);
  }

  function zoomBy(direction: 1 | -1) {
    const from = zoom === "fit" ? (rendered?.scale ?? 1) : zoom;
    const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, direction > 0 ? from * ZOOM_STEP : from / ZOOM_STEP));
    setZoom(Number(next.toFixed(3)));
  }

  const percent = rendered ? Math.round(rendered.scale * 100) : null;
  const hasDoc = numPages > 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line bg-surface px-2 py-1.5">
        <div className="flex items-center gap-0.5" role="group" aria-label="Zoom">
          <IconButton icon={ZoomOut} label="Zoom out" size="sm" onClick={() => zoomBy(-1)} disabled={!hasDoc} />
          <button
            type="button"
            className="min-w-[3.25rem] rounded px-1 text-center text-xs tabular-nums text-ink-2 hover:bg-hover"
            onClick={() => setZoom("fit")}
            title="Zoom level; click to fit the page width"
            aria-label={percent != null ? `Zoom ${percent} percent; fit to width` : "Fit to width"}
          >
            {percent != null ? `${percent}%` : "…"}
          </button>
          <IconButton icon={ZoomIn} label="Zoom in" size="sm" onClick={() => zoomBy(1)} disabled={!hasDoc} />
          <Button size="sm" variant="ghost" icon={MoveHorizontal} active={zoom === "fit"} onClick={() => setZoom("fit")} aria-pressed={zoom === "fit"} title="Fit the page to the pane's width">
            Fit width
          </Button>
        </div>
        {readAloudTitle && <ReadAloudControls compact title={readAloudTitle} onRead={() => readAloudFnRef.current()} />}
        <div className="ml-auto flex items-center gap-1">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                step(e.shiftKey ? -1 : 1);
              } else if (e.key === "Escape" && query) {
                e.preventDefault();
                setQuery("");
              }
            }}
            placeholder="Find on this page…"
            aria-label="Find on this page"
            className={cx(inputSmClass, "w-40")}
          />
          {query.trim() && (
            <>
              <span className="text-xs tabular-nums text-ink-3" role="status" aria-live="polite">
                {matches.length === 0 ? "No matches" : `${current + 1} of ${matches.length}`}
              </span>
              <IconButton icon={ChevronUp} label="Previous match (Shift+Enter)" size="sm" onClick={() => step(-1)} disabled={matches.length === 0} />
              <IconButton icon={ChevronDown} label="Next match (Enter)" size="sm" onClick={() => step(1)} disabled={matches.length === 0} />
              <IconButton icon={X} label="Clear find" size="sm" onClick={() => setQuery("")} />
            </>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto bg-surface-2 p-4">
        {loadError ? (
          <div className="mx-auto max-w-md rounded-lg border border-line bg-surface p-4 text-sm" role="alert">
            <p className="font-medium text-ink">This PDF could not be opened</p>
            <p className="mt-1 text-ink-3">
              It may be password-protected, or damaged. The file is still in your library.
            </p>
            <p className="mt-2 break-words font-mono text-xs text-ink-4">{loadError}</p>
          </div>
        ) : (
          <div className={cx("relative mx-auto w-fit shadow-lg", readingHere && "cursor-pointer")} onClick={readFromClick}>
            <canvas ref={canvasRef} className="block" />
            {/* The paragraph being read aloud; an overlay of its own, since the
                find overlay's children are counted to find its current match. */}
            <div className="pointer-events-none absolute inset-0" aria-hidden="true">
              {speakingRect && (
                <span
                  ref={speakingRef}
                  className="absolute rounded-sm mix-blend-multiply"
                  style={{
                    left: speakingRect.left - 3,
                    top: speakingRect.top - 3,
                    width: speakingRect.width + 6,
                    height: speakingRect.height + 6,
                    backgroundColor: highlightColor,
                    opacity: 0.45,
                  }}
                />
              )}
            </div>
            <div ref={overlayRef} className="pointer-events-none absolute inset-0" aria-hidden="true">
              {matches.map((m, i) => (
                <span
                  key={i}
                  className={cx("absolute rounded-sm mix-blend-multiply", i === current ? "bg-accent/45 ring-2 ring-accent" : "bg-warn/40")}
                  style={{ left: m.left, top: m.top, width: m.width, height: m.height }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-3 border-t border-line bg-surface py-2">
        <Button size="sm" icon={ChevronLeft} onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
          Previous
        </Button>
        <span className="text-sm text-ink-3">
          Page {page} of {numPages || "…"}
        </span>
        <Button size="sm" onClick={() => setPage((p) => Math.min(numPages, p + 1))} disabled={page >= numPages}>
          Next
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
