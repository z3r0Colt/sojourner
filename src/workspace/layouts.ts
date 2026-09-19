import { branch, leaf, leaves, type LayoutNode } from "./layoutTree";

/**
 * Quick arrangements: named templates that build a split tree from the
 * panes in reading order. They are starting points, not the model -- the
 * tree (see layoutTree.ts) is what is rendered and persisted, and it may
 * be split and rearranged freely afterwards. They also convert the old
 * template-plus-row-split workspaces (version 2) into trees.
 *
 *   one             [ 0 ]
 *   two             [ 0 | 1 ]
 *   two-plus-one    [ 0 | 1 ]      right column split top / bottom
 *                   [   | 2 ]
 *   three           [ 0 | 1 | 2 ]
 *   three-plus-one  [ 0 | 1 | 2 ]  third column split
 *                   [   |   | 3 ]
 *   two-by-two      [ 0 | 1 ]
 *                   [ 2 | 3 ]
 *   two-by-three    [ 0 | 1 | 2 ]
 *                   [ 3 | 4 | 5 ]
 *
 * A template has slots; panes fill the slots in order and any extra panes
 * become tabs in the last slot. Fewer panes than slots simply leaves the
 * unused slots out.
 */

export type LayoutId = "one" | "two" | "two-plus-one" | "three" | "three-plus-one" | "two-by-two" | "two-by-three";

export interface LayoutMeta {
  id: LayoutId;
  label: string;
  slots: number;
  description: string;
}

export const LAYOUTS: readonly LayoutMeta[] = [
  { id: "one", label: "One pane", slots: 1, description: "A single pane; other panes become tabs." },
  { id: "two", label: "Two columns", slots: 2, description: "Two panes side by side." },
  { id: "two-plus-one", label: "Two plus one", slots: 3, description: "A reading column with two panes stacked beside it." },
  { id: "three", label: "Three columns", slots: 3, description: "Three panes side by side." },
  { id: "three-plus-one", label: "Three plus one", slots: 4, description: "Three columns, the last one split top and bottom." },
  { id: "two-by-two", label: "Two by two", slots: 4, description: "Four panes in a grid." },
  { id: "two-by-three", label: "Two by three", slots: 6, description: "Six panes: three columns, each split top and bottom." },
];

export const LAYOUT_IDS: readonly LayoutId[] = LAYOUTS.map((l) => l.id);

export function isLayoutId(v: unknown): v is LayoutId {
  return typeof v === "string" && (LAYOUT_IDS as readonly string[]).includes(v);
}

export function layoutMeta(id: LayoutId): LayoutMeta {
  return LAYOUTS.find((l) => l.id === id) ?? LAYOUTS[0];
}

export function slotsOf(id: LayoutId): number {
  return layoutMeta(id).slots;
}

/** The template a workspace of `count` panes gets when nothing was chosen. */
export function defaultLayoutFor(count: number): LayoutId {
  if (count <= 1) return "one";
  if (count === 2) return "two";
  if (count === 3) return "three";
  return "two-by-two";
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
    case "three-plus-one":
      return [[0], [1], [2, 3]];
    case "two-by-two":
      return [
        [0, 2],
        [1, 3],
      ];
    case "two-by-three":
      return [
        [0, 3],
        [1, 4],
        [2, 5],
      ];
  }
}

/** Items distributed over `slots` slots in order; the last slot takes any
 * extras (they render as tabs). An empty slot is an empty array. */
export function assignSlots<T>(items: T[], slots: number): T[][] {
  const out: T[][] = Array.from({ length: slots }, () => []);
  items.forEach((p, i) => out[Math.min(i, slots - 1)].push(p));
  return out;
}

/** What a template needs to know about a pane: its id, and the flex weight
 * the old model gave it (1000 for a reading column, 420 for a study pane),
 * which sets the column widths. */
export interface TemplatePane {
  id: string;
  width?: number;
}

const DEFAULT_WEIGHT = 420;

/**
 * Builds the tree a template describes for these panes. Columns become a
 * right-leaning chain of row branches whose ratios come from the weights
 * of each column's top pane -- exactly the widths the old flex layout gave
 * them -- and a stacked column becomes a column branch at `rowSplit`.
 */
export function treeFromTemplate(id: LayoutId, panes: TemplatePane[], rowSplit = 0.5): LayoutNode {
  if (panes.length === 0) return leaf([]);
  const slots = assignSlots(panes, slotsOf(id));
  const columns = columnsOf(id);
  if (GRIDS.has(id)) {
    // A grid is two rows of columns, so it reads left to right along the
    // top and then along the bottom, as a page does. Each row's column
    // widths come from its own panes' weights.
    const rows = [0, 1].map((r) =>
      columns
        .map((col) => (col[r] != null ? slots[col[r]] : []))
        .filter((s) => s.length > 0)
        .map((slotPanes) => ({ node: leaf(slotPanes.map((p) => p.id)), weight: slotPanes[0].width ?? DEFAULT_WEIGHT })),
    );
    const rowNodes = rows.filter((r) => r.length > 0).map((r) => chainColumns(r));
    return rowNodes.length > 1 ? branch("column", rowNodes[0], rowNodes[1], rowSplit) : rowNodes[0];
  }
  const columnNodes = columns
    .map((col) => col.map((slot) => slots[slot]).filter((s) => s.length > 0))
    .filter((col) => col.length > 0)
    .map((col) => {
      const nodes = col.map((slotPanes) => leaf(slotPanes.map((p) => p.id)));
      return { node: nodes.length > 1 ? branch("column", nodes[0], nodes[1], rowSplit) : nodes[0], weight: col[0][0].width ?? DEFAULT_WEIGHT };
    });
  return chainColumns(columnNodes);
}

/** Templates with two full rows, built row by row. */
const GRIDS: ReadonlySet<LayoutId> = new Set<LayoutId>(["two-by-two", "two-by-three"]);

function chainColumns(columns: { node: LayoutNode; weight: number }[]): LayoutNode {
  if (columns.length === 1) return columns[0].node;
  const [first, ...rest] = columns;
  const total = columns.reduce((sum, c) => sum + c.weight, 0);
  return branch("row", first.node, chainColumns(rest), first.weight / total);
}

/** The template applied to the panes that exist now, in reading order. */
export function arrangementFor(id: LayoutId, paneIds: string[]): LayoutNode {
  return treeFromTemplate(
    id,
    paneIds.map((pid) => ({ id: pid })),
  );
}

/** The template a tree still matches in shape (ignoring ratios), or null
 * once it has been split by hand into something no template describes. */
export function detectTemplate(tree: LayoutNode): LayoutId | null {
  const count = leaves(tree).length;
  for (const l of LAYOUTS) {
    if (slotsOf(l.id) !== count) continue;
    if (shapeOf(tree) === shapeOf(arrangementFor(l.id, Array.from({ length: count }, (_, i) => String(i))))) return l.id;
  }
  return null;
}

function shapeOf(node: LayoutNode): string {
  if (node.type === "leaf") return "L";
  return `${node.direction === "row" ? "R" : "C"}(${shapeOf(node.children[0])},${shapeOf(node.children[1])})`;
}
