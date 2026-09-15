import { useEffect, useMemo, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import * as pdfjsLib from "pdfjs-dist";
import type { TextItem } from "pdfjs-dist/types/src/display/api";
// eslint-disable-next-line import/no-unresolved
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, MoveHorizontal, X, ZoomIn, ZoomOut } from "lucide-react";
import { Button, IconButton } from "../../components/ui/Button";
import { cx, inputSmClass } from "../../components/ui/classes";

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
  scale: number;
  viewport: pdfjsLib.PageViewport;
  items: Array<{ str: string; transform: number[]; width: number }>;
}

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
}: {
  filePath: string;
  /** The page saved last time (F3.4); read once, on open. */
  initialPage?: number;
  onPageChange?: (page: number) => void;
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
    const task = pdfjsLib.getDocument({ url });
    task.promise
      .then((doc) => {
        if (cancelled) return;
        docRef.current = doc;
        setNumPages(doc.numPages);
        setPage((p) => Math.min(Math.max(1, p), doc.numPages));
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
      docRef.current = null;
      void task.destroy();
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
        const [render, text] = await Promise.all([
          pdfPage.render({ canvasContext: ctx, viewport, canvas, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined }).promise,
          pdfPage.getTextContent(),
        ]);
        void render;
        if (cancelled) return;
        const items = text.items
          .filter((it): it is TextItem => "str" in it)
          .map((it) => ({ str: it.str, transform: it.transform as number[], width: it.width }));
        setRendered({ scale, viewport, items });
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      });
    onPageChangeRef.current?.(page);
    return () => {
      cancelled = true;
    };
  }, [page, numPages, zoom, areaWidth]);

  const matches = useMemo(() => (rendered ? findOnPage(rendered, query) : []), [rendered, query]);
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
          <div className="relative mx-auto w-fit shadow-lg">
            <canvas ref={canvasRef} className="block" />
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
