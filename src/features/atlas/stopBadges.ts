/**
 * A journey's numbered stops as the map can show them. A journey comes back
 * to a city (Antioch is Paul's first stop and his fourteenth), and towns a
 * day apart sit on top of each other until the map is zoomed in, so a circle
 * per stop drew numbers over numbers. Stops whose badges would touch on the
 * screen are drawn as one, numbered "1, 14" or "3–5", and part again as the
 * reader zooms in and there is room.
 *
 * Plain functions of screen positions, so they can be tested without a map.
 */

/** "1–3, 7, 14": the stops in order, a run of three or more as a range. */
export function stopLabel(numbers: number[]): string {
  const ns = [...new Set(numbers)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < ns.length; ) {
    let j = i;
    while (j + 1 < ns.length && ns[j + 1] === ns[j] + 1) j++;
    if (j - i >= 2) parts.push(`${ns[i]}–${ns[j]}`);
    else for (let k = i; k <= j; k++) parts.push(String(ns[k]));
    i = j + 1;
  }
  return parts.join(", ");
}

/** About how wide a badge is on the screen, in pixels: the round badge for
 * one or two digits, wider for a list. */
export function badgeWidth(label: string): number {
  return Math.max(20, label.length * 6.5 + 10);
}

export const BADGE_HEIGHT = 20;
/** Room left between two badges before they are drawn as one. */
const GAP = 2;

export interface ScreenStop {
  n: number;
  x: number;
  y: number;
}

export interface Badge {
  /** The stops it stands for, in journey order. */
  ns: number[];
  /** Where it is drawn: the earliest of its stops. */
  x: number;
  y: number;
  label: string;
}

/**
 * The badges for stops at these screen positions: any two that would
 * overlap become one, drawn at the earlier stop, until none overlap. A badge
 * grows as it takes more numbers, so it may then reach a neighbour it
 * missed; the merging goes on until nothing touches.
 */
export function stopBadges(stops: ScreenStop[]): Badge[] {
  let badges: Badge[] = [...stops]
    .sort((a, b) => a.n - b.n)
    .map((s) => ({ ns: [s.n], x: s.x, y: s.y, label: String(s.n) }));
  const touch = (a: Badge, b: Badge) =>
    Math.abs(a.x - b.x) < (badgeWidth(a.label) + badgeWidth(b.label)) / 2 + GAP && Math.abs(a.y - b.y) < BADGE_HEIGHT + GAP;
  for (let merged = true; merged; ) {
    merged = false;
    outer: for (let i = 0; i < badges.length; i++) {
      for (let j = i + 1; j < badges.length; j++) {
        if (!touch(badges[i], badges[j])) continue;
        const [first, second] = badges[i].ns[0] < badges[j].ns[0] ? [badges[i], badges[j]] : [badges[j], badges[i]];
        const ns = [...first.ns, ...second.ns].sort((a, b) => a - b);
        const joined: Badge = { ns, x: first.x, y: first.y, label: stopLabel(ns) };
        badges = badges.filter((_, k) => k !== i && k !== j);
        badges.push(joined);
        badges.sort((a, b) => a.ns[0] - b.ns[0]);
        merged = true;
        break outer;
      }
    }
  }
  return badges;
}
