import { useEffect, useMemo, useRef, useState } from "react";
import type { Timeline, TimelineEra, TimelineEvent } from "../../api/types";
import { importance, labelPlacement, packRows, spanLabel, ticks, yearLabel, type Placed } from "./timelineLayout";

export interface TimelineViewRange {
  start: number;
  end: number;
}

/** The whole line: a little before Creation to a little after Acts. */
export const FULL_RANGE: TimelineViewRange = { start: -4100, end: 120 };
const MIN_SPAN = 4;

const AXIS_H = 20;
const ERA_H = 22;
const LANE_H = 18;
const ROW_H = 20;

/** The two reigns' containers, drawn as the lane labels rather than as bars. */
const isLaneParent = (e: TimelineEvent, laneParents: Set<number>) => laneParents.has(e.id);

export function clampRange(r: TimelineViewRange): TimelineViewRange {
  let span = Math.min(Math.max(r.end - r.start, MIN_SPAN), FULL_RANGE.end - FULL_RANGE.start);
  let start = Math.max(FULL_RANGE.start, Math.min(r.start, FULL_RANGE.end - span));
  if (!Number.isFinite(start)) start = FULL_RANGE.start;
  if (!Number.isFinite(span)) span = FULL_RANGE.end - FULL_RANGE.start;
  return { start, end: start + span };
}

function tokens() {
  const root = getComputedStyle(document.documentElement);
  const t = (name: string, fallback: string) => root.getPropertyValue(name).trim() || fallback;
  return {
    surface: t("--color-surface", "#fff"),
    surface2: t("--color-surface-2", "#f4f4f4"),
    hover: t("--color-hover", "#eee"),
    ink: t("--color-ink", "#111"),
    ink2: t("--color-ink-2", "#333"),
    ink3: t("--color-ink-3", "#666"),
    ink4: t("--color-ink-4", "#999"),
    line: t("--color-line", "#ddd"),
    line2: t("--color-line-2", "#eee"),
    accent: t("--color-accent", "#2a5f4c"),
    accentSoft: t("--color-accent-soft", "#e3ede7"),
    groupA: t("--color-group-a", "#6b8fb5"),
    groupB: t("--color-group-b", "#b58f6b"),
    groupC: t("--color-group-c", "#8f6bb5"),
  };
}

/** Redraws when the theme changes: the colors come from the CSS tokens. */
function useThemeVersion(): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    const obs = new MutationObserver(() => setV((n) => n + 1));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "style"] });
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    const onMq = () => setV((n) => n + 1);
    mq?.addEventListener?.("change", onMq);
    return () => {
      obs.disconnect();
      mq?.removeEventListener?.("change", onMq);
    };
  }, []);
  return v;
}

/**
 * The timeline, drawn: eras across the top, the reigns of Judah and Israel as
 * two parallel lanes where the view reaches the divided kingdom, and every
 * other event below, packed into rows. Wheel to zoom about the pointer, drag
 * to pan, click an event to select it. The arrow keys pan and +/- zoom when it
 * has focus.
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
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 600, h: 300 });
  const themeVersion = useThemeVersion();
  const hitRef = useRef<{ placed: Placed[]; lanes: { event: TimelineEvent; x0: number; x1: number; y: number }[]; eras: { era: TimelineEra; x0: number; x1: number }[]; rowsTop: number }>({
    placed: [],
    lanes: [],
    eras: [],
    rowsTop: 0,
  });
  const [hidden, setHidden] = useState(0);

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

  const laneParents = useMemo(() => {
    const s = new Set<number>();
    for (const e of timeline.events) if (e.lane && e.parent_id != null) s.add(e.parent_id);
    return s;
  }, [timeline]);
  const parents = useMemo(() => new Set(timeline.events.map((e) => e.parent_id).filter((id): id is number => id != null)), [timeline]);

  // Draw.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const { w, h } = size;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const c = tokens();
    const x = (year: number) => ((year - range.start) / (range.end - range.start)) * w;
    const font = getComputedStyle(canvas).fontFamily || "sans-serif";
    ctx.font = `12px ${font}`;
    const widths = new Map<string, number>();
    const measure = (s: string) => {
      let v = widths.get(s);
      if (v == null) {
        v = ctx.measureText(s).width;
        widths.set(s, v);
      }
      return v;
    };

    ctx.fillStyle = c.surface;
    ctx.fillRect(0, 0, w, h);

    // The open chapter.
    if (here) {
      const x0 = x(here.start);
      const x1 = Math.max(x(here.end + 1), x0 + 3);
      ctx.fillStyle = c.accentSoft;
      ctx.fillRect(x0, 0, x1 - x0, h);
    }

    // Ticks and axis.
    ctx.textBaseline = "middle";
    ctx.font = `11px ${font}`;
    for (const [year, label] of ticks(range.start, range.end, w)) {
      const tx = Math.round(x(year)) + 0.5;
      ctx.strokeStyle = c.line2;
      ctx.beginPath();
      ctx.moveTo(tx, AXIS_H);
      ctx.lineTo(tx, h);
      ctx.stroke();
      ctx.fillStyle = c.ink3;
      ctx.fillText(label, tx + 3, AXIS_H / 2);
    }
    ctx.strokeStyle = c.line;
    ctx.beginPath();
    ctx.moveTo(0, AXIS_H + 0.5);
    ctx.lineTo(w, AXIS_H + 0.5);
    ctx.stroke();

    // Eras.
    const eraHits: { era: TimelineEra; x0: number; x1: number }[] = [];
    timeline.eras.forEach((era, i) => {
      const x0 = x(era.start_year);
      const x1 = x(era.end_year);
      if (x1 < 0 || x0 > w) return;
      ctx.fillStyle = i % 2 === 0 ? c.surface2 : c.hover;
      ctx.fillRect(x0, AXIS_H + 1, x1 - x0, ERA_H - 2);
      ctx.save();
      ctx.beginPath();
      ctx.rect(Math.max(x0, 0), AXIS_H, Math.min(x1, w) - Math.max(x0, 0), ERA_H);
      ctx.clip();
      ctx.fillStyle = c.ink2;
      ctx.font = `600 11px ${font}`;
      ctx.fillText(era.name, Math.max(x0, 0) + 6, AXIS_H + ERA_H / 2);
      ctx.restore();
      eraHits.push({ era, x0, x1 });
    });
    let top = AXIS_H + ERA_H + 4;

    // The reigns of Judah and Israel, where the view reaches them.
    ctx.font = `12px ${font}`;
    const laneHits: { event: TimelineEvent; x0: number; x1: number; y: number }[] = [];
    for (const [lane, label, color] of [
      ["judah", "Judah", c.groupA],
      ["israel", "Israel", c.groupB],
    ] as const) {
      const reigns = timeline.events.filter((e) => e.lane === lane && x(e.end_year) >= 0 && x(e.start_year) <= w);
      if (reigns.length === 0) continue;
      for (const e of reigns) {
        const x0 = x(e.start_year);
        const x1 = Math.max(x(e.end_year), x0 + 2);
        const selected = e.id === selectedId;
        ctx.fillStyle = selected ? c.accent : color;
        ctx.globalAlpha = selected ? 1 : 0.55;
        ctx.fillRect(x0, top + 1, x1 - x0 - 1, LANE_H - 2);
        ctx.globalAlpha = 1;
        const name = e.title.replace(/^Reign of /, "");
        if (x1 - x0 - 8 > measure(name)) {
          ctx.fillStyle = selected ? c.surface : c.ink;
          ctx.fillText(name, x0 + 4, top + LANE_H / 2);
        }
        laneHits.push({ event: e, x0, x1, y: top });
      }
      ctx.font = `600 11px ${font}`;
      const lw = ctx.measureText(label).width;
      ctx.fillStyle = c.surface;
      ctx.globalAlpha = 0.85;
      ctx.fillRect(2, top + 2, lw + 8, LANE_H - 4);
      ctx.globalAlpha = 1;
      ctx.fillStyle = c.ink2;
      ctx.fillText(label, 6, top + LANE_H / 2);
      ctx.font = `12px ${font}`;
      top += LANE_H;
    }
    if (laneHits.length) top += 6;

    // Everything else, packed.
    const rest = timeline.events.filter((e) => !e.lane && !isLaneParent(e, laneParents));
    const rows = Math.max(1, Math.min(maxRows, Math.floor((h - top) / ROW_H)));
    const { placed, hidden: nHidden } = packRows(rest, x, (e) => measure(e.title), rows, w, (e) =>
      e.id === selectedId || hereEventIds?.has(e.id) ? 10_000 : importance(e, parents.has(e.id)),
    );
    for (const p of placed) {
      const y = top + p.row * ROW_H;
      const e = p.event;
      const selected = e.id === selectedId;
      const isHere = hereEventIds?.has(e.id) ?? false;
      const color = selected || isHere ? c.accent : c.ink4;
      if (p.x1 - p.x0 > 8) {
        ctx.fillStyle = color;
        ctx.globalAlpha = selected ? 0.9 : 0.35;
        ctx.fillRect(p.x0, y + 7, p.x1 - p.x0, 6);
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x0 + 3, y + 10, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = selected ? c.accent : isHere ? c.accent : c.ink2;
      ctx.font = selected || isHere ? `600 12px ${font}` : `12px ${font}`;
      const label = labelPlacement(p.x0, p.x1, measure(e.title));
      const labelX = label.x;
      if (label.inside) {
        // Inside a long bar, on a surface wash so it reads.
        ctx.fillStyle = c.surface;
        ctx.globalAlpha = 0.8;
        ctx.fillRect(labelX - 2, y + 3, measure(e.title) + 4, 14);
        ctx.globalAlpha = 1;
        ctx.fillStyle = selected || isHere ? c.accent : c.ink2;
      }
      ctx.fillText(e.title, labelX, y + 10);
    }
    hitRef.current = { placed, lanes: laneHits, eras: eraHits, rowsTop: top };
    setHidden(nHidden);
  }, [timeline, range, size, selectedId, here, hereEventIds, maxRows, laneParents, parents, themeVersion]);

  // Pointer: drag to pan, wheel to zoom.
  const drag = useRef<{ x: number; range: TimelineViewRange; moved: boolean } | null>(null);
  const rangeRef = useRef(range);
  rangeRef.current = range;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const r = rangeRef.current;
      const rect = canvas.getBoundingClientRect();
      const at = r.start + ((ev.clientX - rect.left) / rect.width) * (r.end - r.start);
      if (Math.abs(ev.deltaX) > Math.abs(ev.deltaY)) {
        const shift = (ev.deltaX / rect.width) * (r.end - r.start);
        onRangeChange(clampRange({ start: r.start + shift, end: r.end + shift }));
        return;
      }
      const k = Math.exp(ev.deltaY * 0.0015);
      onRangeChange(clampRange({ start: at - (at - r.start) * k, end: at + (r.end - at) * k }));
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [onRangeChange]);

  function hitTest(clientX: number, clientY: number): { event?: TimelineEvent; era?: TimelineEra } {
    const rect = canvasRef.current!.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const hits = hitRef.current;
    if (py >= AXIS_H && py < AXIS_H + ERA_H) {
      const era = hits.eras.find((e) => px >= e.x0 && px <= e.x1)?.era;
      return { era };
    }
    const lane = hits.lanes.find((l) => py >= l.y && py < l.y + LANE_H && px >= l.x0 - 2 && px <= l.x1 + 2);
    if (lane) return { event: lane.event };
    const row = Math.floor((py - hits.rowsTop) / ROW_H);
    const placed = hits.placed.find((p) => p.row === row && px >= p.x0 - 4 && px <= p.xLabel);
    return { event: placed?.event };
  }

  const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null);

  return (
    <div ref={wrapRef} className={`relative select-none ${className ?? ""}`}>
      <canvas
        ref={canvasRef}
        tabIndex={0}
        role="img"
        aria-label={`Timeline from ${yearLabel(range.start)} to ${yearLabel(range.end)}. Arrow keys move along it, plus and minus zoom.`}
        className="block cursor-grab rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent active:cursor-grabbing"
        onPointerDown={(ev) => {
          (ev.target as HTMLElement).setPointerCapture(ev.pointerId);
          drag.current = { x: ev.clientX, range, moved: false };
        }}
        onPointerMove={(ev) => {
          const d = drag.current;
          if (d) {
            const dx = ev.clientX - d.x;
            if (Math.abs(dx) > 3) d.moved = true;
            if (d.moved) {
              const shift = (-dx / size.w) * (d.range.end - d.range.start);
              onRangeChange(clampRange({ start: d.range.start + shift, end: d.range.end + shift }));
            }
            setHover(null);
            return;
          }
          const { event, era } = hitTest(ev.clientX, ev.clientY);
          const rect = canvasRef.current!.getBoundingClientRect();
          const text = event ? `${event.title} · ${spanLabel(event.start_year, event.end_year)}` : era ? `${era.name} · ${spanLabel(era.start_year, era.end_year)}` : null;
          setHover(text ? { x: ev.clientX - rect.left, y: ev.clientY - rect.top, text } : null);
          (ev.target as HTMLElement).style.cursor = event || era ? "pointer" : "";
        }}
        onPointerLeave={() => setHover(null)}
        onPointerUp={(ev) => {
          const d = drag.current;
          drag.current = null;
          if (d?.moved) return;
          const { event, era } = hitTest(ev.clientX, ev.clientY);
          if (era && onEraClick) onEraClick(era);
          else onSelect(event ?? null);
        }}
        onKeyDown={(ev) => {
          const span = range.end - range.start;
          const move = (by: number) => onRangeChange(clampRange({ start: range.start + by, end: range.end + by }));
          const zoom = (k: number) => {
            const mid = (range.start + range.end) / 2;
            onRangeChange(clampRange({ start: mid - (span * k) / 2, end: mid + (span * k) / 2 }));
          };
          if (ev.key === "ArrowLeft") move(-span * 0.15);
          else if (ev.key === "ArrowRight") move(span * 0.15);
          else if (ev.key === "+" || ev.key === "=") zoom(0.7);
          else if (ev.key === "-") zoom(1 / 0.7);
          else return;
          ev.preventDefault();
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
        <div className="pointer-events-none absolute bottom-1 right-2 rounded bg-surface px-1.5 text-xs text-ink-4">
          {hidden} more — zoom in to see them
        </div>
      )}
    </div>
  );
}
