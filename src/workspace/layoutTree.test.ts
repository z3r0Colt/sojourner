import { describe, expect, it } from "vitest";
import {
  PANE_MIN_PX,
  DIVIDER_PX,
  addToLeaf,
  branch,
  leaf,
  leafOfPane,
  leaves,
  minSize,
  movePaneTo,
  normalize,
  paneOrder,
  removePane,
  reorderTab,
  setActiveTab,
  setRatio,
  splitLeaf,
  splitLeafEmpty,
  swapPaneIds,
  validateTree,
  type LayoutNode,
} from "./layoutTree";

const ok = (tree: LayoutNode, ids: string[]) => expect(validateTree(tree, ids)).toEqual([]);

describe("splitLeaf", () => {
  it("puts the new leaf on the asked side", () => {
    const root = leaf(["a"]);
    for (const [side, first, dir] of [
      ["right", "a", "row"],
      ["left", "b", "row"],
      ["bottom", "a", "column"],
      ["top", "b", "column"],
    ] as const) {
      const t = splitLeaf(root, root.id, side, "b");
      expect(t.type).toBe("branch");
      if (t.type !== "branch") return;
      expect(t.direction).toBe(dir);
      expect(paneOrder(t)[0]).toBe(first);
      ok(t, ["a", "b"]);
    }
  });

  it("gives the existing leaf the ratio it asked to keep", () => {
    const root = leaf(["a"]);
    const right = splitLeaf(root, root.id, "right", "b", 0.7);
    const left = splitLeaf(root, root.id, "left", "b", 0.7);
    expect(right.type === "branch" && right.ratio).toBeCloseTo(0.7);
    expect(left.type === "branch" && left.ratio).toBeCloseTo(0.3);
  });
});

describe("removePane", () => {
  it("collapses the branch to the sibling", () => {
    const root = leaf(["a"]);
    const t = splitLeaf(root, root.id, "right", "b");
    const back = removePane(t, "b");
    expect(back.type).toBe("leaf");
    expect(paneOrder(back)).toEqual(["a"]);
  });

  it("keeps a tabbed leaf and moves the active tab", () => {
    const root = leaf(["a", "b", "c"], "b");
    const t = removePane(root, "b");
    expect(t.type === "leaf" && t.paneIds).toEqual(["a", "c"]);
    expect(t.type === "leaf" && t.activeId).toBe("c");
    const t2 = removePane(t, "c");
    expect(t2.type === "leaf" && t2.activeId).toBe("a");
  });

  it("collapses only one level and keeps other ratios", () => {
    const a = leaf(["a"]);
    const b = leaf(["b"]);
    const c = leaf(["c"]);
    const inner = branch("column", b, c, 0.3);
    const root = branch("row", a, inner, 0.6);
    const t = removePane(root, "c");
    expect(t.type === "branch" && t.ratio).toBeCloseTo(0.6);
    expect(t.type === "branch" && t.children[1].id).toBe(b.id);
    ok(t, ["a", "b"]);
  });

  it("leaves the root leaf as a placeholder", () => {
    const t = removePane(leaf(["a"]), "a");
    expect(t.type === "leaf" && t.paneIds).toEqual([]);
    expect(t.type === "leaf" && t.activeId).toBeNull();
  });
});

describe("movePaneTo", () => {
  it("round-trips a split back into a single leaf", () => {
    const root = leaf(["a"]);
    const split = splitLeaf(root, root.id, "right", "b");
    const homeOfA = leafOfPane(split, "a")!;
    const back = movePaneTo(split, "b", homeOfA.id, "center");
    expect(back.type).toBe("leaf");
    expect(paneOrder(back)).toEqual(["a", "b"]);
    ok(back, ["a", "b"]);
  });

  it("is a no-op when a lone pane docks on its own leaf's side", () => {
    const root = leaf(["a"]);
    const t = splitLeaf(root, root.id, "right", "b");
    const homeOfB = leafOfPane(t, "b")!;
    expect(movePaneTo(t, "b", homeOfB.id, "left")).toBe(t);
  });

  it("still lands when removing the pane collapses the target's parent", () => {
    // [a | b] then move a onto b's bottom: removing a collapses the root to
    // b's leaf, which must still be found by its id.
    const root = leaf(["a"]);
    const t = splitLeaf(root, root.id, "right", "b");
    const homeOfB = leafOfPane(t, "b")!;
    const moved = movePaneTo(t, "a", homeOfB.id, "bottom");
    expect(moved.type === "branch" && moved.direction).toBe("column");
    expect(paneOrder(moved)).toEqual(["b", "a"]);
    ok(moved, ["a", "b"]);
  });

  it("docks a tab out of its group", () => {
    const root = leaf(["a", "b"]);
    const t = movePaneTo(root, "b", root.id, "right");
    expect(leaves(t).length).toBe(2);
    expect(paneOrder(t)).toEqual(["a", "b"]);
  });

  it("moves a tab into another leaf at an index", () => {
    const root = leaf(["a"]);
    const t = splitLeaf(root, root.id, "right", "b");
    const homeOfA = leafOfPane(t, "a")!;
    const t2 = addToLeaf(t, homeOfA.id, "c");
    const t3 = movePaneTo(t2, "b", homeOfA.id, "center", 1);
    expect(t3.type === "leaf" && t3.paneIds).toEqual(["a", "b", "c"]);
  });

  it("reorders within the same leaf through center", () => {
    const root = leaf(["a", "b", "c"]);
    const t = movePaneTo(root, "c", root.id, "center", 0);
    expect(t.type === "leaf" && t.paneIds).toEqual(["c", "a", "b"]);
  });
});

describe("tabs", () => {
  it("setActiveTab and reorderTab stay in bounds", () => {
    const root = leaf(["a", "b"]);
    expect(setActiveTab(root, root.id, "zz")).toBe(root);
    const t = setActiveTab(root, root.id, "b");
    expect(t.type === "leaf" && t.activeId).toBe("b");
    const r = reorderTab(root, root.id, "a", 99);
    expect(r.type === "leaf" && r.paneIds).toEqual(["b", "a"]);
  });

  it("swapPaneIds exchanges places across leaves", () => {
    const root = leaf(["a"]);
    const t = splitLeaf(root, root.id, "right", "b");
    const s = swapPaneIds(t, "a", "b");
    expect(paneOrder(s)).toEqual(["b", "a"]);
    ok(s, ["a", "b"]);
  });
});

describe("normalize", () => {
  it("appends missing panes and drops unknown ids", () => {
    const root = leaf(["a", "zz"]);
    const t = normalize(root, ["a", "b"]);
    expect(paneOrder(t)).toEqual(["a", "b"]);
    ok(t, ["a", "b"]);
  });

  it("flattens branches left with one child and clamps ratios", () => {
    const bad: LayoutNode = {
      type: "branch",
      id: "r",
      direction: "row",
      ratio: Number.NaN,
      children: [
        { type: "leaf", id: "x", paneIds: ["gone"], activeId: "gone" },
        { type: "branch", id: "q", direction: "column", ratio: 5, children: [{ type: "leaf", id: "y", paneIds: ["a"], activeId: null }, { type: "leaf", id: "z", paneIds: ["b"], activeId: "b" }] },
      ],
    };
    const t = normalize(bad, ["a", "b"]);
    expect(t.type).toBe("branch");
    expect(t.type === "branch" && t.ratio).toBeLessThanOrEqual(0.9);
    ok(t, ["a", "b"]);
  });

  it("keeps one placeholder and removes the rest", () => {
    const root = leaf(["a"]);
    const one = splitLeafEmpty(root, root.id, "right");
    const two = splitLeafEmpty(one, leafOfPane(one, "a")!.id, "bottom");
    expect(leaves(two).filter((l) => l.paneIds.length === 0).length).toBe(2);
    const t = normalize(two, ["a"]);
    expect(leaves(t).filter((l) => l.paneIds.length === 0).length).toBe(1);
    ok(t, ["a"]);
  });

  it("replaces a placeholder root when panes exist", () => {
    const t = normalize(leaf([]), ["a", "b"]);
    expect(t.type).toBe("leaf");
    expect(paneOrder(t)).toEqual(["a", "b"]);
  });

  it("makes duplicate node ids unique", () => {
    const dup: LayoutNode = { type: "branch", id: "same", direction: "row", ratio: 0.5, children: [{ type: "leaf", id: "same", paneIds: ["a"], activeId: "a" }, { type: "leaf", id: "same", paneIds: ["b"], activeId: "b" }] };
    ok(normalize(dup, ["a", "b"]), ["a", "b"]);
  });

  it("turns rubbish into one leaf of every pane", () => {
    expect(paneOrder(normalize(null, ["a", "b"]))).toEqual(["a", "b"]);
    expect(paneOrder(normalize({ nope: true } as unknown as LayoutNode, ["a"]))).toEqual(["a"]);
  });
});

describe("reading order and sizes", () => {
  it("reads a two-by-two left to right, top to bottom", () => {
    const t = branch("row", branch("column", leaf(["a"]), leaf(["c"])), branch("column", leaf(["b"]), leaf(["d"])));
    expect(paneOrder(t)).toEqual(["a", "c", "b", "d"]);
  });

  it("adds widths across a row and heights down a column", () => {
    const row = branch("row", leaf(["a"]), leaf(["b"]));
    expect(minSize(row)).toEqual({ width: PANE_MIN_PX * 2 + DIVIDER_PX, height: PANE_MIN_PX });
    const col = branch("column", leaf(["a"]), leaf(["b"]));
    expect(minSize(col)).toEqual({ width: PANE_MIN_PX, height: PANE_MIN_PX * 2 + DIVIDER_PX });
    expect(setRatio(row, row.id, 0).type === "branch" && (setRatio(row, row.id, 0) as { ratio: number }).ratio).toBe(0.1);
  });
});
