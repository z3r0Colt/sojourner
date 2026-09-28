import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Timeline, TimelineEra, TimelineEvent } from "../../api/types";
import { eventHoverText } from "./churchHistory";
import { TimelineOverview } from "./TimelineOverview";
import { fitLabel, importance, inReach, packBandsWithSelection, spanLabel, ticks, yearLabel, type Placed } from "./timelineLayout";
import { extentOf, lineFor, panBy, rangeForKey, sameRange, wheelIntent, zoomAbout, type TimelineViewRange } from "./timelineRange";
import { timelineColors, useThemeVersion, type TimelineColors } from "./timelineTheme";
import { timelineTracks } from "./timelineTracks";

const AXIS_H = 20;
const ERA_H = 22;
const LANE_H = 18;
const ROW_H = 20;
/** The church band's heading: a rule across the canvas with the band's name
 * on it, and a little room above it. */
const CHURCH_HEAD_H = 18;
/** The "N more" count in the bottom right corner: its box, one line high
 * whatever the pane's width, and the gap under it. */
const BADGE_BOX_H = 18;
const BADGE_GAP = 2;
/** The height kept free for the count at the foot of the canvas: its box,
 * the gap under it and a little over it, so the last row's descenders clear
 * it. */
const HIDDEN_BADGE_H = BADGE_BOX_H + BADGE_GAP + 2;
/** Below this width the count says only "N more": the whole sentence would
 * not fit on its line. */
const BADGE_SHORT_BELOW = 320;
/** The open chapter's events' priority in the strip beside a passage: ahead
 * of everything else. */
const HERE_FIRST = 10_000;

interface EraHit {
  era: TimelineEra;
  x0: number;
  x1: number;
  y: number;
}
interface LaneHit {
  event: TimelineEvent;
  x0: number;
  x1: number;
  y: number;
}

/**
 * The timeline, drawn: eras across the top (the Bible's, and under them
 * church history's when it is on, each row kept wherever the view is), the
 * reigns of Judah and Israel as two parallel lanes where the view reaches the
 * divided kingdom, the Bible's other events packed into rows below, and
 * church history's in a band of its own under those, in violet. Wheel to
 * zoom about the pointer, Shift+wheel (or a sideways swipe) to move along it,
 * drag to pan, click an event to select it. The arrow keys pan, Page Up and
 * Page Down a screen at a time, Home and End go to its ends and +/- zoom when
 * it has focus (without Alt, Ctrl or Cmd, which stay the app's). Under it,
 * unless `overview` is off, the whole line in a strip with the view as a
 * window on it.
 */
export function TimelineCanvas({
  timeline,
  range,
  onRangeChange,
  selectedId,
  onSelect,
  here,
  hereEventIds,
  maxRows = 40,
  onEraClick,
  overview = true,
  className,
}: {
  timeline: Timeline;
  range: TimelineViewRange;
  onRangeChange: (r: TimelineViewRange) => void;
  selectedId: number | null;
  onSelect: (e: TimelineEvent | null) => void;
  /** The open chapter's years, marked as a band. */
  here?: { start: number; end: number } | null;
  /** Events the open chapter records, drawn in the accent. */
  hereEventIds?: Set<number>;
  maxRows?: number;
  onEraClick?: (era: TimelineEra) => void;
  /** The overview strip under the canvas. On by default; it takes its 20px
   * from the height `className` gives, so a canvas held to a fixed height
   * either makes room for it or turns it off. */
  overview?: boolean;
  className?: string;
}) {
  const canvasId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 600, h: 300 });
  const themeVersion = useThemeVersion();
  const colorsRef = useRef<{ version: number; colors: TimelineColors } | null>(null);
  // Label widths, kept across frames: measuring text is the slowest thing in
  // a frame, and a title is as wide at one year as at the next. Kept per
  // face: a title cut short (fitLabel) is measured in the face it is set in,
  // the bolder one when it is selected, the eras' own for an era's name.
  const widthsRef = useRef<{ font: string; faces: Map<string, Map<string, number>> }>({ font: "", faces: new Map() });
  const hitRef = useRef<{
    placed: Placed[];
    church: Placed[];
    lanes: LaneHit[];
    eras: EraHit[];
    erasBottom: number;
    rowsTop: number;
    churchTop: number;
  }>({ placed: [], church: [], lanes: [], eras: [], erasBottom: AXIS_H + ERA_H, rowsTop: 0, churchTop: -1 });
  const [hidden, setHidden] = useState(0);
  // The backing store's size as last set. Setting a canvas's width or height
  // reallocates and clears it even to the same value, so it is set only when
  // the size or the screen's density has changed, not on every frame of a
  // drag.
  const backingRef = useRef({ w: 0, h: 0, dpr: 0 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const r = entry.contentRect;
      setSize({ w: Math.max(100, Math.floor(r.width)), h: Math.max(80, Math.floor(r.height)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The events sorted into what draws where, once per timeline rather than
  // once per frame: a drag redraws sixty times a second.
  const split = useMemo(() => timelineTracks(timeline), [timeline]);
  // The packed events by id, to find the selected one among them.
  const packedById = useMemo(() => new Map([...split.bible, ...split.church].map((e) => [e.id, e])), [split]);

  // How far the line runs: to today with church history, to a little after
  // Acts without it. Home and End go to its first and last years.
  const extent = useMemo(() => extentOf([...timeline.events, ...timeline.eras]), [timeline]);
  const line = useMemo(() => lineFor(extent?.end ?? null), [extent]);

  // Draw.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const { w, h } = size;
    const backing = backingRef.current;
    if (backing.w !== w || backing.h !== h || backing.dpr !== dpr) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      backingRef.current = { w, h, dpr };
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // A canvas kept at its size keeps its last frame and its context's state
    // too, so the frame is cleared and what it relies on is set afresh.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1;
    ctx.textAlign = "left";
    if (colorsRef.current?.version !== themeVersion) colorsRef.current = { version: themeVersion, colors: timelineColors() };
    const c = colorsRef.current.colors;
    const x = (year: number) => ((year - range.start) / (range.end - range.start)) * w;
    const font = getComputedStyle(canvas).fontFamily || "sans-serif";
    const label = `12px ${font}`;
    const labelStrong = `600 12px ${font}`;
    const small = `600 11px ${font}`;
    if (widthsRef.current.font !== label) widthsRef.current = { font: label, faces: new Map() };
    const measureIn = (face: string, s: string) => {
      const faces = widthsRef.current.faces;
      let widths = faces.get(face);
      if (!widths) faces.set(face, (widths = new Map()));
      let v = widths.get(s);
      if (v == null) {
        // Always in the face asked for, whatever the canvas was last set to,
        // as the width is kept for every later frame.
        const was = ctx.font;
        ctx.font = face;
        v = ctx.measureText(s).width;
        ctx.font = was;
        widths.set(s, v);
      }
      return v;
    };
    const measure = (s: string) => measureIn(label, s);

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = c.surface;
    ctx.fillRect(0, 0, w, h);

    // The open chapter.
    if (here) {
      const x0 = x(here.start);
      const x1 = Math.max(x(here.end + 1), x0 + 3);
      ctx.fillStyle = c.accentSoft;
      ctx.fillRect(x0, 0, x1 - x0, h);
    }

    // Ticks and axis. A year too near the right edge to be read whole keeps
    // its line and leaves out its label, rather than showing "AD 3".
    ctx.textBaseline = "middle";
    const tickFace = `11px ${font}`;
    ctx.font = tickFace;
    for (const [year, tick] of ticks(range.start, range.end, w)) {
      const tx = Math.round(x(year)) + 0.5;
      ctx.strokeStyle = c.line2;
      ctx.beginPath();
      ctx.moveTo(tx, AXIS_H);
      ctx.lineTo(tx, h);
      ctx.stroke();
      if (tx + 3 + measureIn(tickFace, tick) > w) continue;
      ctx.fillStyle = c.ink3;
      ctx.fillText(tick, tx + 3, AXIS_H / 2);
    }
    ctx.strokeStyle = c.line;
    ctx.beginPath();
    ctx.moveTo(0, AXIS_H + 0.5);
    ctx.lineTo(w, AXIS_H + 0.5);
    ctx.stroke();

    // Eras: the Bible's row, then church history's under it -- in the first
    // century both show, one over the other, as Luke's apostolic church and
    // Schaff's apostolic age overlap. Church eras are washed in its violet so
    // the row says whose eras they are. Each history the timeline carries
    // keeps its row wherever the view is, empty where it reaches none of that
    // history's eras: were a row there only where its eras show, the lanes
    // and every packed row under it would drop 22px as AD 30 came in at the
    // right of a view of the Gospels and jump back up as AD 60 left at the
    // left, the events moving out from under the pointer mid-pan. An empty
    // row over Abraham costs less than that. (With church history turned off
    // there is one row; switching it is the reader's own doing.)
    const eraHits: EraHit[] = [];
    let top = AXIS_H;
    ctx.font = small;
    const eraTracks: [TimelineEra[], boolean][] = [
      [split.bibleEras, false],
      [split.churchEras, true],
    ];
    for (const [eras, church] of eraTracks) {
      if (eras.length === 0) continue;
      for (let i = 0; i < eras.length; i++) {
        const era = eras[i];
        const x0 = x(era.start_year);
        const x1 = x(era.end_year);
        if (x1 < 0 || x0 > w) continue;
        if (!church) ctx.fillStyle = i % 2 === 0 ? c.surface2 : c.hover;
        else {
          ctx.fillStyle = c.church;
          ctx.globalAlpha = i % 2 === 0 ? 0.1 : 0.18;
        }
        ctx.fillRect(x0, top + 1, x1 - x0, ERA_H - 2);
        ctx.globalAlpha = 1;
        // Named in what shows of it: whole, cut short at a word, or not at
        // all -- not cut off mid-letter by its end or the canvas's ("Th").
        const name = fitLabel(era.name, Math.min(x1, w) - Math.max(x0, 0) - 10, (s) => measureIn(small, s));
        if (name) {
          ctx.fillStyle = c.ink2;
          ctx.fillText(name, Math.max(x0, 0) + 6, top + ERA_H / 2);
        }
        eraHits.push({ era, x0, x1, y: top });
      }
      top += ERA_H;
    }
    // A timeline with no eras at all still keeps the row, so the rows under
    // it sit where they always do.
    if (top === AXIS_H) top += ERA_H;
    const erasBottom = top;
    top += 4;

    // The reigns of Judah and Israel, where the view reaches them. A reign
    // is named inside what shows of its bar, clear of the lane's own name at
    // the left edge, or not at all: never a name running in from off the
    // left or out past the right, cut to "kiah".
    ctx.font = label;
    const laneHits: LaneHit[] = [];
    for (let lane = 0; lane < 2; lane++) {
      const reigns = lane === 0 ? split.judah : split.israel;
      const color = lane === 0 ? c.groupA : c.groupB;
      const laneName = lane === 0 ? "Judah" : "Israel";
      ctx.font = small;
      const laneNameEnd = 2 + ctx.measureText(laneName).width + 8;
      ctx.font = label;
      let any = false;
      for (const e of reigns) {
        const x0 = x(e.start_year);
        if (x(e.end_year) < 0 || x0 > w) continue;
        any = true;
        const x1 = Math.max(x(e.end_year), x0 + 2);
        const selected = e.id === selectedId;
        ctx.fillStyle = selected ? c.accent : color;
        ctx.globalAlpha = selected ? 1 : 0.55;
        ctx.fillRect(x0, top + 1, x1 - x0 - 1, LANE_H - 2);
        ctx.globalAlpha = 1;
        const name = e.title.replace(/^Reign of /, "");
        const nameFrom = Math.max(x0, laneNameEnd) + 4;
        if (Math.min(x1, w) - nameFrom - 4 > measure(name)) {
          ctx.fillStyle = selected ? c.surface : c.ink;
          ctx.fillText(name, nameFrom, top + LANE_H / 2);
        }
        laneHits.push({ event: e, x0, x1, y: top });
      }
      if (!any) continue;
      ctx.font = small;
      ctx.fillStyle = c.surface;
      ctx.globalAlpha = 0.85;
      ctx.fillRect(2, top + 2, laneNameEnd - 2, LANE_H - 4);
      ctx.globalAlpha = 1;
      ctx.fillStyle = c.ink2;
      ctx.fillText(laneName, 6, top + LANE_H / 2);
      ctx.font = label;
      top += LANE_H;
    }
    if (laneHits.length) top += 6;

    // Everything else, packed: the Bible's rows, then church history's band
    // below them, sharing the rows there are (see packBands).
    const labelWidth = (e: TimelineEvent) => measure(e.title);
    let churchNear = false;
    for (const e of split.church) {
      if (inReach(e, x, w, labelWidth)) {
        churchNear = true;
        break;
      }
    }
    // What is left out is counted in a badge at the canvas's bottom right
    // corner, so the rows stop short of it: a last row running down under
    // the count would have it over a name. Holding the room back costs
    // nothing where nothing is left out -- the rows it would have held were
    // not needed -- so it is held back always, and the rows packed once.
    const room = h - top - (churchNear ? CHURCH_HEAD_H : 0) - HIDDEN_BADGE_H;
    const rows = Math.max(1, Math.min(maxRows, Math.floor(room / ROW_H)));
    // The open chapter's events in the strip beside a passage always show;
    // the rest by how much they matter, and the selection kept in its row.
    const rank = (e: TimelineEvent) => (hereEventIds?.has(e.id) ? HERE_FIRST : importance(e, split.parents.has(e.id)));
    const chosen = selectedId != null ? packedById.get(selectedId) : undefined;
    const bands = packBandsWithSelection(split.bible, split.church, x, labelWidth, rows, w, rank, chosen);

    /** An event's title where it was packed (labelPlacement): inside its
     * bar when there is room (on a surface wash, so it reads), else after
     * it, or before its mark at the right edge, or pinned at the left edge
     * after an arrow in the mark's `color` when its mark is off there. A
     * title with room for only part of it is cut short at a word, measured
     * in the face it is set in. A title before its mark is set to end where
     * the room for it ends, so a selected one, in the bolder face and a
     * little wider than measured, runs out to the left, not over its mark;
     * and where that, or running on to the right, would take it off the
     * canvas, the bolder title is cut short too rather than cut off. */
    const drawTitle = (p: Placed, y: number, strong: boolean, color: string) => {
      const at = p.label;
      if (at.room <= 0) return;
      const face = strong ? labelStrong : label;
      const whole = p.event.title;
      const canvasRoom = at.before ? at.x + at.room : at.inside ? Math.min(p.x1, w) - at.x : w - at.x;
      const cutTo = strong ? canvasRoom : at.room;
      const title = measureIn(face, whole) <= cutTo ? whole : fitLabel(whole, cutTo, (s) => measureIn(face, s));
      if (!title) return;
      if (at.inside) {
        ctx.fillStyle = c.surface;
        ctx.globalAlpha = 0.8;
        ctx.fillRect(at.x - 2, y + 3, measureIn(face, title) + 4, 14);
        ctx.globalAlpha = 1;
      }
      if (at.pinned) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(2, y + 10);
        ctx.lineTo(7, y + 6.5);
        ctx.lineTo(7, y + 13.5);
        ctx.closePath();
        ctx.fill();
      }
      ctx.font = face;
      ctx.fillStyle = strong ? c.accent : c.ink2;
      if (at.before) {
        ctx.textAlign = "right";
        ctx.fillText(title, at.x + at.room, y + 10);
        ctx.textAlign = "left";
      } else ctx.fillText(title, at.x, y + 10);
    };

    for (const p of bands.bible.placed) {
      const y = top + p.row * ROW_H;
      const e = p.event;
      const strong = e.id === selectedId || (hereEventIds?.has(e.id) ?? false);
      const color = strong ? c.accent : c.ink4;
      if (p.x1 - p.x0 > 8) {
        ctx.fillStyle = color;
        ctx.globalAlpha = e.id === selectedId ? 0.9 : 0.35;
        ctx.fillRect(p.x0, y + 7, p.x1 - p.x0, 6);
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x0 + 3, y + 10, 3, 0, Math.PI * 2);
      ctx.fill();
      drawTitle(p, y, strong, color);
    }

    // Church history. A bar that fades out at both ends is a span whose
    // source says "about"; its mark is drawn open for the same reason.
    const bar = (x0: number, x1: number, y: number, height: number, alpha: number, circa: boolean) => {
      if (!circa) {
        ctx.globalAlpha = alpha;
        ctx.fillRect(x0, y, x1 - x0, height);
        return;
      }
      const f = Math.min(12, (x1 - x0) / 4) / 2;
      ctx.globalAlpha = alpha * 0.3;
      ctx.fillRect(x0, y, f, height);
      ctx.fillRect(x1 - f, y, f, height);
      ctx.globalAlpha = alpha * 0.6;
      ctx.fillRect(x0 + f, y, f, height);
      ctx.fillRect(x1 - 2 * f, y, f, height);
      ctx.globalAlpha = alpha;
      ctx.fillRect(x0 + 2 * f, y, x1 - x0 - 4 * f, height);
    };
    // A mark per kind, small enough to sit where the Bible's dot does: a
    // diamond for a council, a square (a page) for a writing, an arrowhead
    // going out for a mission, and the dot for anything else.
    const mark = (kind: TimelineEvent["kind"], mx: number, my: number, color: string, open: boolean) => {
      ctx.beginPath();
      if (kind === "council") {
        ctx.moveTo(mx, my - 4);
        ctx.lineTo(mx + 4, my);
        ctx.lineTo(mx, my + 4);
        ctx.lineTo(mx - 4, my);
        ctx.closePath();
      } else if (kind === "writing") {
        ctx.rect(mx - 3, my - 3, 6, 6);
      } else if (kind === "mission") {
        ctx.moveTo(mx - 3, my - 4);
        ctx.lineTo(mx + 4, my);
        ctx.lineTo(mx - 3, my + 4);
        ctx.closePath();
      } else {
        ctx.arc(mx, my, 3, 0, Math.PI * 2);
      }
      if (open) {
        ctx.fillStyle = c.surface;
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.lineWidth = 1;
      } else {
        ctx.fillStyle = color;
        ctx.fill();
      }
    };
    let churchTop = -1;
    if (bands.church.placed.length > 0) {
      const headY = top + bands.bible.rows * ROW_H;
      const ruleY = Math.round(headY + CHURCH_HEAD_H / 2) + 0.5;
      ctx.strokeStyle = c.church;
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.moveTo(0, ruleY);
      ctx.lineTo(w, ruleY);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.font = small;
      const bandName = "Church history";
      const nw = ctx.measureText(bandName).width;
      ctx.fillStyle = c.surface;
      ctx.fillRect(2, ruleY - 7, nw + 8, 14);
      ctx.fillStyle = c.church;
      ctx.fillText(bandName, 6, ruleY);
      churchTop = headY + CHURCH_HEAD_H;
      for (const p of bands.church.placed) {
        const y = churchTop + p.row * ROW_H;
        const e = p.event;
        const strong = e.id === selectedId || (hereEventIds?.has(e.id) ?? false);
        const color = strong ? c.accent : c.church;
        const circa = e.circa === true;
        ctx.fillStyle = color;
        if (e.kind === "life") {
          // A life: a fine rule from birth to death, a tick at either end.
          const alpha = e.id === selectedId ? 0.95 : 0.7;
          bar(p.x0, p.x1, y + 8.5, 3, alpha, circa);
          ctx.globalAlpha = circa ? alpha * 0.45 : alpha;
          ctx.fillRect(p.x0, y + 6, 1.5, 8);
          ctx.fillRect(p.x1 - 1.5, y + 6, 1.5, 8);
          ctx.globalAlpha = 1;
        } else {
          if (p.x1 - p.x0 > 8) bar(p.x0, p.x1, y + 7, 6, e.id === selectedId ? 0.9 : 0.3, circa);
          ctx.globalAlpha = 1;
          mark(e.kind, p.x0 + 3, y + 10, color, circa);
        }
        drawTitle(p, y, strong, color);
      }
    }

    hitRef.current = { placed: bands.bible.placed, church: bands.church.placed, lanes: laneHits, eras: eraHits, erasBottom, rowsTop: top, churchTop };
    setHidden(bands.bible.hidden + bands.church.hidden);
  }, [split, packedById, range, size, selectedId, here, hereEventIds, maxRows, themeVersion]);

  // Pointer: drag to pan, wheel to zoom (or, with Shift or sideways, to pan).
  // A drag belongs to the pointer that pressed: a second finger on a touch
  // screen is not a second drag the view would jump between.
  const drag = useRef<{ id: number; x: number; range: TimelineViewRange; moved: boolean } | null>(null);
  const rangeRef = useRef(range);
  rangeRef.current = range;

  /** Hands a new view up -- unless it is the view already showing, as every
   * pointer move or key press at a limit asks for: handing that on would
   * redraw the canvas and re-render the timeline around it for nothing. */
  const moveTo = (next: TimelineViewRange) => {
    if (sameRange(next, rangeRef.current)) return;
    // A fast drag sends several moves before the view comes back round as a
    // prop; each builds on the last rather than on the stale one.
    rangeRef.current = next;
    onRangeChange(next);
  };

  // React's wheel listeners are passive and cannot stop the pane behind from
  // scrolling (or the WebView from zooming); this one is not.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (ev: WheelEvent) => {
      const rect = canvas.getBoundingClientRect();
      const intent = wheelIntent(ev, rect.width);
      if (!intent || rect.width <= 0) return;
      ev.preventDefault();
      const r = rangeRef.current;
      const next =
        "pan" in intent
          ? panBy(r, (intent.pan / rect.width) * (r.end - r.start), line)
          : zoomAbout(r, r.start + ((ev.clientX - rect.left) / rect.width) * (r.end - r.start), intent.zoom, line);
      // At a limit the wheel asks for the view it has: nothing to hand on
      // (the page is still kept from scrolling, above). A fast wheel sends
      // several events before the view comes back round as a prop; each
      // builds on the last rather than on the stale range.
      if (sameRange(next, r)) return;
      rangeRef.current = next;
      onRangeChange(next);
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [onRangeChange, line]);

  function hitTest(clientX: number, clientY: number): { event?: TimelineEvent; era?: TimelineEra } {
    const rect = canvasRef.current!.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const hits = hitRef.current;
    if (py >= AXIS_H && py < hits.erasBottom) {
      const era = hits.eras.find((e) => py >= e.y && py < e.y + ERA_H && px >= e.x0 && px <= e.x1)?.era;
      return { era };
    }
    const lane = hits.lanes.find((l) => py >= l.y && py < l.y + LANE_H && px >= l.x0 - 2 && px <= l.x1 + 2);
    if (lane) return { event: lane.event };
    if (hits.churchTop >= 0 && py >= hits.churchTop) {
      const row = Math.floor((py - hits.churchTop) / ROW_H);
      return { event: hits.church.find((p) => p.row === row && px >= p.xFrom && px <= p.xLabel)?.event };
    }
    const row = Math.floor((py - hits.rowsTop) / ROW_H);
    const placed = hits.placed.find((p) => p.row === row && px >= p.xFrom && px <= p.xLabel);
    return { event: placed?.event };
  }

  const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null);

  return (
    <div className={`flex select-none flex-col ${className ?? ""}`}>
      <div ref={wrapRef} className="relative min-h-0 flex-1">
        <canvas
          ref={canvasRef}
          id={canvasId}
          tabIndex={0}
          role="img"
          aria-label={`Timeline from ${yearLabel(range.start)} to ${yearLabel(range.end)}. Arrow keys move along it, Page Up and Page Down a screen at a time, Home and End to its ends, plus and minus zoom.`}
          className="absolute left-0 top-0 block cursor-grab touch-none rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent active:cursor-grabbing"
          onPointerDown={(ev) => {
            // The main button only, and one pointer at a time.
            if (ev.button !== 0 || (drag.current && drag.current.id !== ev.pointerId)) return;
            ev.currentTarget.setPointerCapture(ev.pointerId);
            drag.current = { id: ev.pointerId, x: ev.clientX, range: rangeRef.current, moved: false };
          }}
          onPointerMove={(ev) => {
            const d = drag.current;
            // A drag whose button is no longer down lost its release somewhere
            // (outside the window, say): it ends here, rather than the view
            // panning with the mouse until the next click.
            if (d && d.id === ev.pointerId && (ev.buttons & 1) === 0) drag.current = null;
            else if (d) {
              if (d.id !== ev.pointerId) return;
              const dx = ev.clientX - d.x;
              if (Math.abs(dx) > 3) d.moved = true;
              if (d.moved) moveTo(panBy(d.range, (-dx / size.w) * (d.range.end - d.range.start), line));
              setHover(null);
              return;
            }
            const { event, era } = hitTest(ev.clientX, ev.clientY);
            const rect = canvasRef.current!.getBoundingClientRect();
            const text = event ? eventHoverText(event) : era ? `${era.name} · ${spanLabel(era.start_year, era.end_year)}` : null;
            setHover(text ? { x: ev.clientX - rect.left, y: ev.clientY - rect.top, text } : null);
            (ev.target as HTMLElement).style.cursor = event || era ? "pointer" : "";
          }}
          onPointerLeave={() => setHover(null)}
          onPointerUp={(ev) => {
            // A click is a press and a release here, by the same pointer,
            // without a drag between: a drag that began somewhere else and
            // was let go over the canvas selects nothing (nor clears the
            // selection), and neither does a second finger lifting.
            const d = drag.current;
            if (!d || d.id !== ev.pointerId) return;
            drag.current = null;
            if (d.moved) return;
            const { event, era } = hitTest(ev.clientX, ev.clientY);
            if (era && onEraClick) onEraClick(era);
            else onSelect(event ?? null);
          }}
          // A touch the browser takes back, or capture lost to anything else,
          // ends the drag where it is.
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
        />
        {hover && (
          <div
            className="pointer-events-none absolute z-10 max-w-xs rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink shadow"
            style={{ left: Math.max(4, Math.min(hover.x + 12, size.w - 200)), top: hover.y + 14 }}
          >
            {hover.text}
          </div>
        )}
        {hidden > 0 && (
          // One line, in the room the rows leave for it (HIDDEN_BADGE_H), at
          // any width: in a narrow pane it says less rather than wrapping up
          // over the last row.
          <div
            className="pointer-events-none absolute right-2 max-w-[calc(100%-1rem)] truncate whitespace-nowrap rounded bg-surface px-1.5 text-xs text-ink-4"
            style={{ bottom: BADGE_GAP, height: BADGE_BOX_H, lineHeight: `${BADGE_BOX_H}px` }}
          >
            {size.w < BADGE_SHORT_BELOW ? `${hidden} more` : `${hidden} more — zoom in to see them`}
          </div>
        )}
      </div>
      {overview && (
        <TimelineOverview
          className="mt-1"
          eras={timeline.eras}
          range={range}
          onRangeChange={onRangeChange}
          line={line}
          extent={extent}
          here={here}
          controls={canvasId}
        />
      )}
    </div>
  );
}
