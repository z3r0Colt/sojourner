/**
 * The workspace's arrangement as a split tree, the way an editor arranges
 * its groups: a leaf is a slot showing one pane (or several as tabs), a
 * branch splits the space it is given between two children, side by side
 * or stacked, at a ratio. Any leaf can be split on any side, any pane can
 * be dragged onto any edge of any other, and every divider is its own.
 *
 * Pure: nothing here touches React or the store. Every function returns a
 * new tree and leaves its argument alone, so the store can hand trees out
 * as state and tests can reason about them.
 *
 * Leaf ids are independent of the pane ids they hold. That is what lets a
 * move be "remove, then dock": the target leaf keeps its id through the
 * collapse the removal may cause elsewhere in the tree.
 *
 * Invariants (`validateTree` names any that fail; `normalize` repairs them):
 *   - every pane id is in exactly one leaf, and every id in the tree is a pane
 *   - a leaf's activeId is one of its paneIds, or null iff it holds none
 *   - a branch has exactly two children and a finite ratio within the clamp
 *   - at most one empty leaf (a placeholder), never as the root while
 *     there are panes to show
 *   - node ids are unique
 */

export type Side = "left" | "right" | "top" | "bottom";
/** "row" puts the children side by side; "column" stacks them. */
export type Direction = "row" | "column";

export interface LeafNode {
  type: "leaf";
  id: string;
  /** Tab order. Empty only for a placeholder waiting for content. */
  paneIds: string[];
  /** The tab shown; null iff `paneIds` is empty. */
  activeId: string | null;
}

export interface BranchNode {
  type: "branch";
  id: string;
  direction: Direction;
  children: [LayoutNode, LayoutNode];
  /** The share of the axis given to `children[0]`, between RATIO_MIN and RATIO_MAX. */
  ratio: number;
}

export type LayoutNode = LeafNode | BranchNode;

export const MAX_PANES = 8;
export const RATIO_MIN = 0.1;
export const RATIO_MAX = 0.9;
/** The narrowest (and shortest) a leaf is allowed to get, in pixels. */
export const PANE_MIN_PX = 240;
/** The width of the rule between two children of a branch, in pixels. */
export const DIVIDER_PX = 6;

let counter = 0;
export function newNodeId(): string {
  counter += 1;
  return `n${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function clampRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return 0.5;
  return Math.min(RATIO_MAX, Math.max(RATIO_MIN, ratio));
}

export function leaf(paneIds: string[], activeId?: string | null): LeafNode {
  const ids = [...paneIds];
  const active = activeId != null && ids.includes(activeId) ? activeId : (ids[0] ?? null);
  return { type: "leaf", id: newNodeId(), paneIds: ids, activeId: active };
}

export function branch(direction: Direction, a: LayoutNode, b: LayoutNode, ratio = 0.5): BranchNode {
  return { type: "branch", id: newNodeId(), direction, children: [a, b], ratio: clampRatio(ratio) };
}

// ---------------------------------------------------------------------------
// Reading the tree

export function findLeaf(tree: LayoutNode, leafId: string): LeafNode | null {
  if (tree.type === "leaf") return tree.id === leafId ? tree : null;
  return findLeaf(tree.children[0], leafId) ?? findLeaf(tree.children[1], leafId);
}

export function findNode(tree: LayoutNode, nodeId: string): LayoutNode | null {
  if (tree.id === nodeId) return tree;
  if (tree.type === "leaf") return null;
  return findNode(tree.children[0], nodeId) ?? findNode(tree.children[1], nodeId);
}

export function leafOfPane(tree: LayoutNode, paneId: string): LeafNode | null {
  if (tree.type === "leaf") return tree.paneIds.includes(paneId) ? tree : null;
  return leafOfPane(tree.children[0], paneId) ?? leafOfPane(tree.children[1], paneId);
}

export function parentOf(tree: LayoutNode, nodeId: string): BranchNode | null {
  if (tree.type === "leaf") return null;
  if (tree.children[0].id === nodeId || tree.children[1].id === nodeId) return tree;
  return parentOf(tree.children[0], nodeId) ?? parentOf(tree.children[1], nodeId);
}

/** Every leaf, depth first, left (or top) child first: reading order. */
export function leaves(tree: LayoutNode): LeafNode[] {
  if (tree.type === "leaf") return [tree];
  return [...leaves(tree.children[0]), ...leaves(tree.children[1])];
}

/** Pane ids in reading order: leaf by leaf, tabs in their order. This is
 * what "Pane 3" and Ctrl+3 mean. */
export function paneOrder(tree: LayoutNode): string[] {
  return leaves(tree).flatMap((l) => l.paneIds);
}

/** The first empty leaf, if there is one. */
export function placeholderLeaf(tree: LayoutNode): LeafNode | null {
  return leaves(tree).find((l) => l.paneIds.length === 0) ?? null;
}

function nodeIds(tree: LayoutNode, out: string[] = []): string[] {
  out.push(tree.id);
  if (tree.type === "branch") {
    nodeIds(tree.children[0], out);
    nodeIds(tree.children[1], out);
  }
  return out;
}

/** The smallest box the tree fits in: a leaf needs PANE_MIN_PX each way, a
 * row adds its children's widths (plus the divider) and takes the taller
 * child's height; a column the other way round. */
export function minSize(tree: LayoutNode): { width: number; height: number } {
  if (tree.type === "leaf") return { width: PANE_MIN_PX, height: PANE_MIN_PX };
  const a = minSize(tree.children[0]);
  const b = minSize(tree.children[1]);
  return tree.direction === "row"
    ? { width: a.width + b.width + DIVIDER_PX, height: Math.max(a.height, b.height) }
    : { width: Math.max(a.width, b.width), height: a.height + b.height + DIVIDER_PX };
}

// ---------------------------------------------------------------------------
// Rewriting the tree

/** Replaces the node with `nodeId` by whatever `fn` returns for it. */
export function updateNode(tree: LayoutNode, nodeId: string, fn: (node: LayoutNode) => LayoutNode): LayoutNode {
  if (tree.id === nodeId) return fn(tree);
  if (tree.type === "leaf") return tree;
  const a = updateNode(tree.children[0], nodeId, fn);
  const b = updateNode(tree.children[1], nodeId, fn);
  if (a === tree.children[0] && b === tree.children[1]) return tree;
  return { ...tree, children: [a, b] };
}

function directionFor(side: Side): Direction {
  return side === "left" || side === "right" ? "row" : "column";
}

/** Splits `leafId` and puts a new leaf holding `paneId` on `side` of it.
 * `ratio` is the share the existing leaf keeps. */
export function splitLeaf(tree: LayoutNode, leafId: string, side: Side, paneId: string, ratio = 0.5): LayoutNode {
  return splitWith(tree, leafId, side, leaf([paneId]), ratio);
}

/** Splits `leafId` with an empty placeholder leaf on `side`. */
export function splitLeafEmpty(tree: LayoutNode, leafId: string, side: Side, ratio = 0.5): LayoutNode {
  return splitWith(tree, leafId, side, leaf([]), ratio);
}

function splitWith(tree: LayoutNode, leafId: string, side: Side, added: LeafNode, ratio: number): LayoutNode {
  return updateNode(tree, leafId, (existing) => {
    const first = side === "left" || side === "top";
    const r = clampRatio(first ? 1 - ratio : ratio);
    return first ? branch(directionFor(side), added, existing, r) : branch(directionFor(side), existing, added, r);
  });
}

/** Takes a pane out of the tree. A leaf left empty is removed and its
 * parent collapses to the sibling; the root leaf stays as a placeholder
 * rather than disappearing. */
export function removePane(tree: LayoutNode, paneId: string): LayoutNode {
  const home = leafOfPane(tree, paneId);
  if (!home) return tree;
  const remaining = home.paneIds.filter((id) => id !== paneId);
  if (remaining.length > 0) {
    const activeId = home.activeId === paneId ? nextActive(home.paneIds, paneId) : home.activeId;
    return updateNode(tree, home.id, () => ({ ...home, paneIds: remaining, activeId }));
  }
  return removeLeaf(tree, home.id);
}

/** The tab shown after `closing` closes: the one after it, else before. */
function nextActive(paneIds: string[], closing: string): string | null {
  const i = paneIds.indexOf(closing);
  return paneIds[i + 1] ?? paneIds[i - 1] ?? null;
}

function removeLeaf(tree: LayoutNode, leafId: string): LayoutNode {
  if (tree.type === "leaf") return tree.id === leafId ? { ...tree, paneIds: [], activeId: null } : tree;
  if (tree.children[0].id === leafId) return tree.children[1];
  if (tree.children[1].id === leafId) return tree.children[0];
  const a = removeLeaf(tree.children[0], leafId);
  const b = removeLeaf(tree.children[1], leafId);
  if (a === tree.children[0] && b === tree.children[1]) return tree;
  return { ...tree, children: [a, b] };
}

/** Adds a pane to a leaf as a tab (at `index`, default the end) and shows it. */
export function addToLeaf(tree: LayoutNode, leafId: string, paneId: string, index?: number): LayoutNode {
  return updateNode(tree, leafId, (node) => {
    if (node.type !== "leaf" || node.paneIds.includes(paneId)) return node;
    const ids = [...node.paneIds];
    const at = index == null ? ids.length : Math.max(0, Math.min(ids.length, index));
    ids.splice(at, 0, paneId);
    return { ...node, paneIds: ids, activeId: paneId };
  });
}

/** Moves a pane: out of wherever it is, then onto `target` -- a side of
 * the target leaf (a new split) or "center" (a tab of it, at `index`).
 * A pane alone in its leaf asked to dock on that same leaf's side is left
 * where it is: the split would have nothing to split from. */
export function movePaneTo(tree: LayoutNode, paneId: string, targetLeafId: string, target: Side | "center", index?: number): LayoutNode {
  const home = leafOfPane(tree, paneId);
  const targetLeaf = findLeaf(tree, targetLeafId);
  if (!home || !targetLeaf) return tree;
  if (home.id === targetLeafId) {
    if (target === "center") return reorderTab(tree, home.id, paneId, index ?? home.paneIds.length - 1);
    if (home.paneIds.length === 1) return tree;
  }
  const removed = removePane(tree, paneId);
  if (!findLeaf(removed, targetLeafId)) return tree;
  if (target === "center") return addToLeaf(removed, targetLeafId, paneId, index);
  return splitLeaf(removed, targetLeafId, target, paneId);
}

/** Exchanges two panes' places, tabs and all; each keeps the other's activity. */
export function swapPaneIds(tree: LayoutNode, aId: string, bId: string): LayoutNode {
  if (aId === bId) return tree;
  const la = leafOfPane(tree, aId);
  const lb = leafOfPane(tree, bId);
  if (!la || !lb) return tree;
  const swap = (id: string) => (id === aId ? bId : id === bId ? aId : id);
  const rewrite = (node: LayoutNode): LayoutNode => {
    if (node.type === "leaf") {
      if (node.id !== la.id && node.id !== lb.id) return node;
      return { ...node, paneIds: node.paneIds.map(swap), activeId: node.activeId == null ? null : swap(node.activeId) };
    }
    return { ...node, children: [rewrite(node.children[0]), rewrite(node.children[1])] };
  };
  return rewrite(tree);
}

export function setRatio(tree: LayoutNode, branchId: string, ratio: number): LayoutNode {
  return updateNode(tree, branchId, (node) => (node.type === "branch" ? { ...node, ratio: clampRatio(ratio) } : node));
}

export function setActiveTab(tree: LayoutNode, leafId: string, paneId: string): LayoutNode {
  return updateNode(tree, leafId, (node) => (node.type === "leaf" && node.paneIds.includes(paneId) && node.activeId !== paneId ? { ...node, activeId: paneId } : node));
}

export function reorderTab(tree: LayoutNode, leafId: string, paneId: string, toIndex: number): LayoutNode {
  return updateNode(tree, leafId, (node) => {
    if (node.type !== "leaf" || !node.paneIds.includes(paneId)) return node;
    const ids = node.paneIds.filter((id) => id !== paneId);
    const at = Math.max(0, Math.min(ids.length, toIndex));
    ids.splice(at, 0, paneId);
    return { ...node, paneIds: ids };
  });
}

// ---------------------------------------------------------------------------
// Checking and repairing

export function isLayoutNode(v: unknown): v is LayoutNode {
  if (typeof v !== "object" || v === null) return false;
  const n = v as Record<string, unknown>;
  if (typeof n.id !== "string") return false;
  if (n.type === "leaf") {
    return Array.isArray(n.paneIds) && n.paneIds.every((id) => typeof id === "string") && (n.activeId === null || typeof n.activeId === "string");
  }
  if (n.type === "branch") {
    return (
      (n.direction === "row" || n.direction === "column") &&
      Array.isArray(n.children) &&
      n.children.length === 2 &&
      isLayoutNode(n.children[0]) &&
      isLayoutNode(n.children[1]) &&
      typeof n.ratio === "number"
    );
  }
  return false;
}

/** Every broken invariant, as a sentence each; empty when the tree is sound. */
export function validateTree(tree: LayoutNode, paneIds: string[]): string[] {
  const problems: string[] = [];
  const seen = new Map<string, number>();
  for (const l of leaves(tree)) {
    for (const id of l.paneIds) seen.set(id, (seen.get(id) ?? 0) + 1);
    if (l.paneIds.length === 0 && l.activeId != null) problems.push(`empty leaf ${l.id} has an active tab`);
    if (l.paneIds.length > 0 && (l.activeId == null || !l.paneIds.includes(l.activeId))) problems.push(`leaf ${l.id} has no valid active tab`);
  }
  for (const id of paneIds) {
    const n = seen.get(id) ?? 0;
    if (n !== 1) problems.push(`pane ${id} appears ${n} times`);
  }
  for (const [id, n] of seen) if (!paneIds.includes(id)) problems.push(`tree holds unknown pane ${id} (${n}x)`);
  const empties = leaves(tree).filter((l) => l.paneIds.length === 0);
  if (empties.length > 1) problems.push(`${empties.length} placeholders`);
  if (tree.type === "leaf" && tree.paneIds.length === 0 && paneIds.length > 0) problems.push("placeholder is the root while panes exist");
  const walk = (n: LayoutNode) => {
    if (n.type !== "branch") return;
    if (n.children.length !== 2) problems.push(`branch ${n.id} has ${n.children.length} children`);
    if (!Number.isFinite(n.ratio) || n.ratio < RATIO_MIN || n.ratio > RATIO_MAX) problems.push(`branch ${n.id} ratio ${n.ratio}`);
    n.children.forEach(walk);
  };
  walk(tree);
  const ids = nodeIds(tree);
  if (new Set(ids).size !== ids.length) problems.push("duplicate node ids");
  return problems;
}

/**
 * Makes any tree sound for the given panes: unknown ids are dropped,
 * duplicates keep their first appearance, panes the tree does not hold are
 * added as tabs in the last leaf, empty leaves collapse (one placeholder
 * may stay unless it is all there is beside real panes), ratios are
 * clamped, active tabs repaired, and node ids made unique. A tree that is
 * not a tree at all becomes one leaf of every pane.
 */
export function normalize(tree: LayoutNode | null | undefined, paneIds: string[]): LayoutNode {
  const wanted = new Set(paneIds);
  if (!tree || !isLayoutNode(tree)) return leaf(paneIds);
  const placed = new Set<string>();
  const usedIds = new Set<string>();
  let keptPlaceholder = false;

  const fix = (node: LayoutNode): LayoutNode | null => {
    const id = usedIds.has(node.id) ? newNodeId() : node.id;
    usedIds.add(id);
    if (node.type === "leaf") {
      const ids = node.paneIds.filter((p) => wanted.has(p) && !placed.has(p));
      ids.forEach((p) => placed.add(p));
      if (ids.length === 0) {
        if (keptPlaceholder) return null;
        keptPlaceholder = true;
        return { type: "leaf", id, paneIds: [], activeId: null };
      }
      const activeId = node.activeId != null && ids.includes(node.activeId) ? node.activeId : ids[0];
      return { type: "leaf", id, paneIds: ids, activeId };
    }
    const a = fix(node.children[0]);
    const b = fix(node.children[1]);
    if (a && b) return { type: "branch", id, direction: node.direction, children: [a, b], ratio: clampRatio(node.ratio) };
    return a ?? b;
  };

  let out = fix(tree);
  const missing = paneIds.filter((p) => !placed.has(p));
  if (!out) return leaf(paneIds);
  if (missing.length > 0) {
    const all = leaves(out);
    const filled = all.filter((l) => l.paneIds.length > 0);
    const into = filled[filled.length - 1] ?? all[all.length - 1];
    out = updateNode(out, into.id, (n) => (n.type === "leaf" ? { ...n, paneIds: [...n.paneIds, ...missing], activeId: n.activeId ?? missing[0] } : n));
  }
  // A placeholder next to real panes is fine; a placeholder that *is* the
  // root while there are panes is not (they went missing above and were
  // appended, so this only happens when nothing else could hold them).
  const ph = placeholderLeaf(out);
  if (ph && out.type === "leaf" && paneIds.length > 0) return leaf(paneIds);
  if (ph && paneIds.length > 0 && leaves(out).length > 1 && out.type === "branch") {
    // Keep it: the reader asked for it. But if the tree holds no panes at
    // all apart from it, collapse to the panes.
    if (paneOrder(out).length === 0) return leaf(paneIds);
  }
  return out;
}
