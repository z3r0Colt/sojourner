import { useEffect, useMemo, useRef, useState } from "react";
import type { TimelineEra } from "../../api/types";
import { isChurchEra } from "./churchHistory";
import { spanLabel } from "./timelineLayout";
import { stripDrag, stripGrip, stripWindow, stripX, stripYear, type StripGrip } from "./timelineStrip";
import { centreOn, panBy, rangeForKey, sameRange, wheelIntent, widestRange, type TimelineViewRange } from "./timelineRange";
import { isDarkGround, timelineColors, useThemeVersion } from "./timelineTheme";

/** Tall enough to catch with a pointer, short enough to leave the rows alone. */
const STRIP_H = 16;

/**
 * The whole line in a strip under the canvas, and the view as a window on it
 * -- the timeline's scrollbar. The eras run along it in their colors, the
 * Bible's in the canvas's greys and church history's in its violet, so a
 * reader zoomed in on Hezekiah can see where they are in the whole of it and
 * get anywhere else in one move: drag the window to pan, drag either edge of
 * it to zoom, or press anywhere else on the strip to bring the view there
 * (and keep dragging from there). With focus it takes the canvas's keys, and
 * the wheel over it pans, as a scrollbar's does.
 */
export function TimelineOverview({
  eras,
  range,
  onRangeChange,
  line,
  extent,
  here,
  controls,
  className,
}: {
  eras: TimelineEra[];
  range: TimelineViewRange;
  onRangeChange: (r: TimelineViewRange) => void;
  /** The line the canvas clamps to; the strip shows it with its margins. */
  line: TimelineViewRange;
  /** The first and last years, for Home and End. */
  extent: TimelineViewRange | null;
  /** The open chapter's years, marked on the strip as on the canvas. */
  here?: { start: number; end: number } | null;
  /** The id of the canvas this scrolls. */
  controls: string;
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  const themeVersion = useThemeVersion();
  const world = useMemo(() => widestRange(line), [line]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(0, Math.floor(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The eras, drawn once for a size and a theme: the window over them is an
  // element of its own, so dragging it redraws nothing.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0) return;
    const h = STRIP_H - 2; // inside the border
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, h);
    const c = timelineColors();
    // The Bible's eras in the ink's grey, alternating shades. On a dark ground
    // the washes that read on white (a fifth and a third) all but vanish --
    // the first era barely differs from the empty strip -- so they are
    // stronger there.
    const bibleWash = isDarkGround(c) ? [0.42, 0.62] : [0.2, 0.34];
    let bible = 0;
    let church = 0;
    for (const era of eras) {
      const x0 = stripX(era.start_year, world, width);
      const x1 = stripX(era.end_year, world, width);
      const isChurch = isChurchEra(era);
      const i = isChurch ? church++ : bible++;
      ctx.fillStyle = isChurch ? c.church : c.ink4;
      ctx.globalAlpha = isChurch ? (i % 2 === 0 ? 0.3 : 0.48) : bibleWash[i % 2];
      ctx.fillRect(x0, 0, Math.max(1, x1 - x0), h);
    }
    ctx.globalAlpha = 1;
    if (here) {
      const x0 = stripX(here.start, world, width);
      ctx.fillStyle = c.accent;
      ctx.fillRect(Math.round(x0) - 1, 0, Math.max(2, stripX(here.end + 1, world, width) - x0), h);
    }
  }, [eras, world, width, here, themeVersion]);

  const rangeRef = useRef(range);
  rangeRef.current = range;

  /** Hands a new view up, unless it is the one showing -- as a drag or a key
   * at a limit asks for, and which would only re-render the timeline. */
  const moveTo = (next: TimelineViewRange) => {
    if (sameRange(next, rangeRef.current)) return;
    rangeRef.current = next;
    onRangeChange(next);
  };

  // The wheel pans here, and never scrolls the pane behind. React's own wheel
  // listeners are passive and cannot prevent that; this one is not.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (ev: WheelEvent) => {
      const w = el.getBoundingClientRect().width;
      const intent = wheelIntent(ev, w, true);
      if (!intent || !("pan" in intent) || w <= 0) return;
      ev.preventDefault();
      const r = rangeRef.current;
      const next = panBy(r, (intent.pan / w) * (r.end - r.start), line);
      if (sameRange(next, r)) return;
      rangeRef.current = next;
      onRangeChange(next);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onRangeChange, line]);

  const drag = useRef<{ id: number; grip: Exclude<StripGrip, "outside">; from: TimelineViewRange; fromPx: number } | null>(null);
  const win = stripWindow(range, world, width);
  const left = Math.max(0, win.x0);
  const right = Math.min(width, win.x1);
  const localX = (clientX: number) => clientX - (wrapRef.current?.getBoundingClientRect().left ?? 0) - 1; // the border

  return (
    <div
      ref={wrapRef}
      role="scrollbar"
      tabIndex={0}
      aria-controls={controls}
      aria-orientation="horizontal"
      aria-label="Where the view is on the whole timeline. Drag the window to move, its edges to zoom."
      aria-valuemin={Math.round(world.start)}
      aria-valuemax={Math.round(world.end)}
      aria-valuenow={Math.round((range.start + range.end) / 2)}
      aria-valuetext={spanLabel(range.start, range.end)}
      className={`relative shrink-0 cursor-pointer touch-none overflow-hidden rounded border border-line bg-surface outline-none focus-visible:ring-2 focus-visible:ring-accent ${className ?? ""}`}
      style={{ height: STRIP_H }}
      onPointerDown={(ev) => {
        // The main button only, and one pointer at a time.
        if (ev.button !== 0 || width <= 0 || (drag.current && drag.current.id !== ev.pointerId)) return;
        const px = localX(ev.clientX);
        let grip = stripGrip(px, win);
        let from = range;
        if (grip === "outside") {
          // A press off the window brings the view there, and the drag that
          // follows carries on from it.
          from = centreOn(range, stripYear(px, world, width), line);
          moveTo(from);
          grip = "move";
        }
        ev.currentTarget.setPointerCapture(ev.pointerId);
        drag.current = { id: ev.pointerId, grip, from, fromPx: px };
      }}
      onPointerMove={(ev) => {
        const d = drag.current;
        const px = localX(ev.clientX);
        if (d && d.id === ev.pointerId) {
          if ((ev.buttons & 1) !== 0) {
            moveTo(stripDrag(d.grip, d.from, d.fromPx, px, world, width, line));
            return;
          }
          // Its release was lost somewhere: the drag ends, not the window
          // following the mouse about until the next click.
          drag.current = null;
        }
        const grip = stripGrip(px, win);
        ev.currentTarget.style.cursor = grip === "start" || grip === "end" ? "ew-resize" : grip === "move" ? "grab" : "";
      }}
      onPointerUp={(ev) => {
        if (drag.current?.id === ev.pointerId) drag.current = null;
      }}
      onPointerCancel={(ev) => {
        if (drag.current?.id === ev.pointerId) drag.current = null;
      }}
      onLostPointerCapture={(ev) => {
        if (drag.current?.id === ev.pointerId) drag.current = null;
      }}
      onKeyDown={(ev) => {
        const next = rangeForKey(ev, rangeRef.current, extent, line);
        if (!next) return;
        ev.preventDefault();
        moveTo(next);
      }}
    >
      <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none absolute left-0 top-0 block" />
      {width > 0 && right > left && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 rounded-sm border-2 border-accent bg-accent/15"
          style={{ left, width: Math.max(right - left, 4) }}
        />
      )}
    </div>
  );
}
