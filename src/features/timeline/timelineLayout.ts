import type { TimelineEvent } from "../../api/types";

/**
 * Years on the timeline are astronomical: 1 BC is 0, 588 BC is -587, and a
 * fraction is part of the way through the year. That is what lays out on a
 * line without a gap between 1 BC and AD 1; these turn it back into BC and AD.
 */
export function yearLabel(astro: number): string {
  const y = Math.floor(astro + 1e-9);
  return y <= 0 ? `${1 - y} BC` : `AD ${y}`;
}

/** A span as a chronology prints it -- the start year, and the start plus the
 * length: "588 BC", Solomon's "1015–975 BC", "4 BC–AD 30". */
export function spanLabel(start: number, end: number): string {
  const a = yearLabel(start);
  if (end - start < 1) return a;
  const b = yearLabel(end);
  if (a === b) return a;
  const bothBc = a.endsWith("BC") && b.endsWith("BC");
  const bothAd = a.startsWith("AD") && b.startsWith("AD");
  if (bothBc) return `${a.slice(0, -3)}–${b}`;
  if (bothAd) return `${a}–${b.slice(3)}`;
  return `${a}–${b}`;
}

/** How long, in the source's terms: "40 years", "8 days". */
export function durationLabel(start: number, end: number): string | null {
  const years = end - start;
  if (years <= 0) return null;
  if (years >= 1.5) return `${Math.round(years)} years`;
  if (years >= 0.95) return "a year";
  const months = Math.round(years * 12);
  if (months >= 2) return `${months} months`;
  const days = Math.round(years * 365.25);
  return days <= 1 ? null : `${days} days`;
}

const STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];

/** Axis ticks at round historical years ("600 BC", "AD 30") across a span,
 * roughly one per `minGap` pixels. Each is [astronomical year, label]. */
export function ticks(viewStart: number, viewEnd: number, width: number, minGap = 90): [number, string][] {
  const perPx = (viewEnd - viewStart) / Math.max(width, 1);
  const step = STEPS.find((s) => s / perPx >= minGap) ?? 1000;
  const out: [number, string][] = [];
  // BC: historical year h is astronomical 1 - h.
  const firstBc = Math.ceil((1 - Math.min(viewEnd, 0)) / step) * step;
  for (let h = firstBc; 1 - h >= viewStart; h += step) out.push([1 - h, `${h} BC`]);
  const firstAd = Math.max(step, Math.ceil(Math.max(viewStart, 1) / step) * step);
  for (let a = firstAd; a <= viewEnd; a += step) out.push([a, `AD ${a}`]);
  return out.sort((x, y) => x[0] - y[0]);
}

/** Where an event's label goes: inside its bar when the bar has room for it,
 * else just after the bar (or the dot). Drawing and packing both use this, so
 * a row is held for exactly as long as its label runs. */
export function labelPlacement(x0: number, x1: number, labelWidth: number): { inside: boolean; x: number; end: number } {
  if (x1 - x0 > labelWidth + 16) return { inside: true, x: x0 + 8, end: x1 };
  const x = Math.max(x1, x0 + 6) + 4;
  return { inside: false, x, end: x + labelWidth };
}

export interface Placed {
  event: TimelineEvent;
  row: number;
  x0: number;
  x1: number;
  /** Where its label ends: the row is taken up to here. */
  xLabel: number;
}

/**
 * Packs events into rows without overlap. The most important go first -- an
 * era's containers and long spans, then single events, births and deaths
 * last -- each into the first row with room from its start to the end of its
 * bar or label. What finds no room in `maxRows` rows is left out at this zoom
 * (zooming in makes room) and counted, so the view can say how many.
 */
export function packRows(
  events: TimelineEvent[],
  x: (year: number) => number,
  labelWidth: (e: TimelineEvent) => number,
  maxRows: number,
  width: number,
  priority: (e: TimelineEvent) => number = () => 0,
): { placed: Placed[]; hidden: number } {
  const rows: [number, number][][] = [];
  const placed: Placed[] = [];
  let hidden = 0;
  const sorted = [...events].sort((a, b) => priority(b) - priority(a) || a.start_year - b.start_year || b.end_year - a.end_year);
  const free = (row: [number, number][], a: number, b: number) => row.every(([s, e]) => b <= s || a >= e);
  for (const event of sorted) {
    const x0 = x(event.start_year);
    const x1 = Math.max(x(event.end_year), x0 + 6);
    if (x1 < -200 || x0 > width + 200) continue;
    const xLabel = labelPlacement(x0, x1, labelWidth(event)).end + 8;
    const from = x0 - 4;
    let row = rows.findIndex((r) => free(r, from, xLabel));
    if (row < 0) {
      if (rows.length >= maxRows) {
        hidden++;
        continue;
      }
      row = rows.length;
      rows.push([]);
    }
    rows[row].push([from, xLabel]);
    placed.push({ event, row, x0, x1, xLabel });
  }
  return { placed, hidden };
}

/** How much an event matters at a glance: what contains others and what
 * lasts, before the single day; a birth or a death last of all. */
export function importance(e: TimelineEvent, hasChildren: boolean): number {
  let score = Math.min(e.end_year - e.start_year, 400);
  if (hasChildren) score += 500;
  if (e.source === "added") score += 60;
  if (/^(Birth|Death) of /.test(e.title)) score -= 200;
  return score;
}
