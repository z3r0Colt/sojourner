import type { Pane } from "../state/workspaceStore";

/**
 * Workspace layouts: a fixed set of templates rather than free-form
 * splitting, which keeps the 1100px minimum window usable and the
 * persisted shape simple.
 *
 * A layout has slots; panes fill the slots in order. More panes than
 * slots stack as tabs in the last slot; fewer panes than slots leave
 * placeholders that offer to add content. Below `NARROW_WINDOW` pixels of
 * window width the three- and four-slot layouts fall back to two columns
 * with the extra panes as tabs in the right column.
 *
 *   one           [ 0 ]
 *   two           [ 0 | 1 ]
 *   two-plus-one  [ 0 | 1 ]      right column split top / bottom
 *                 [   | 2 ]
 *   three         [ 0 | 1 | 2 ]
 *   two-by-two    [ 0 | 1 ]
 *                 [ 2 | 3 ]
 *
 * Column widths come from the flex weight of the pane at the top of each
 * column (the same `width` two panes side by side always had); the row
 * split of stacked columns is one shared fraction, `rowSplit`.
 */

export type LayoutId = "one" | "two" | "two-plus-one" | "three" | "two-by-two";

export interface LayoutMeta {
  id: LayoutId;
  label: string;
  slots: number;
  description: string;
}

export const LAYOUTS: readonly LayoutMeta[] = [
  { id: "one", label: "One pane", slots: 1, description: "A single pane; extra panes become tabs." },
  { id: "two", label: "Two columns", slots: 2, description: "Two panes side by side." },
  { id: "two-plus-one", label: "Two plus one", slots: 3, description: "A reading column with two panes stacked beside it." },
  { id: "three", label: "Three columns", slots: 3, description: "Three panes side by side." },
  { id: "two-by-two", label: "Two by two", slots: 4, description: "Four panes in a grid." },
];

export const LAYOUT_IDS: readonly LayoutId[] = LAYOUTS.map((l) => l.id);

/** Window width below which three- and four-slot layouts fall back to two
 * columns with tabs. */
export const NARROW_WINDOW = 1300;

export function isLayoutId(v: unknown): v is LayoutId {
  return typeof v === "string" && (LAYOUT_IDS as readonly string[]).includes(v);
}

export function layoutMeta(id: LayoutId): LayoutMeta {
  return LAYOUTS.find((l) => l.id === id) ?? LAYOUTS[0];
}

export function slotsOf(id: LayoutId): number {
  return layoutMeta(id).slots;
}

/** The layout a workspace of `count` panes gets when nothing was chosen. */
export function defaultLayoutFor(count: number): LayoutId {
  if (count <= 1) return "one";
  if (count === 2) return "two";
  if (count === 3) return "three";
  return "two-by-two";
}

/** After a pane is added: a layout without room grows to fit, so adding a
 * third pane still opens a third column as it always did. */
export function layoutAfterAdd(current: LayoutId, count: number): LayoutId {
  return count > slotsOf(current) ? defaultLayoutFor(count) : current;
}

/** After a pane closes: a layout left with an empty slot shrinks to fit,
 * keeping "two plus one" when three panes remain. */
export function layoutAfterClose(current: LayoutId, count: number): LayoutId {
  if (count >= slotsOf(current)) return current;
  return defaultLayoutFor(count);
}

/** Each column as the list of slot indexes it stacks, top to bottom. */
export function columnsOf(id: LayoutId): number[][] {
  switch (id) {
    case "one":
      return [[0]];
    case "two":
      return [[0], [1]];
    case "two-plus-one":
      return [[0], [1, 2]];
    case "three":
      return [[0], [1], [2]];
    case "two-by-two":
      return [
        [0, 2],
        [1, 3],
      ];
  }
}

/** Panes distributed over `slots` slots in order; the last slot takes any
 * extras (they render as tabs). An empty slot is an empty array. */
export function assignSlots(panes: Pane[], slots: number): Pane[][] {
  const out: Pane[][] = Array.from({ length: slots }, () => []);
  panes.forEach((p, i) => out[Math.min(i, slots - 1)].push(p));
  return out;
}

/** The layout actually rendered: the chosen one, or two columns when the
 * window is too narrow for three or four. */
export function effectiveLayout(chosen: LayoutId, windowWidth: number, paneCount: number): LayoutId {
  if (windowWidth > 0 && windowWidth < NARROW_WINDOW && slotsOf(chosen) >= 3) return paneCount >= 2 ? "two" : "one";
  return chosen;
}

export const ROW_SPLIT_DEFAULT = 0.5;
export const ROW_SPLIT_MIN = 0.2;
export const ROW_SPLIT_MAX = 0.8;

export function clampRowSplit(v: number): number {
  return Math.min(ROW_SPLIT_MAX, Math.max(ROW_SPLIT_MIN, v));
}
