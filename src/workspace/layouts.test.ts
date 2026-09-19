import { describe, expect, it } from "vitest";
import { LAYOUTS, arrangementFor, detectTemplate, slotsOf, treeFromTemplate } from "./layouts";
import { leaves, paneOrder, validateTree, type LayoutNode } from "./layoutTree";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);

describe("treeFromTemplate", () => {
  it("makes min(panes, slots) leaves and tabs the extras in the last slot, for every template", () => {
    for (const l of LAYOUTS) {
      for (let n = 1; n <= 8; n++) {
        const t = arrangementFor(l.id, ids(n));
        expect(validateTree(t, ids(n))).toEqual([]);
        expect(leaves(t).length).toBe(Math.min(n, slotsOf(l.id)));
        expect(paneOrder(t)).toEqual(ids(n));
        if (n > slotsOf(l.id)) {
          const last = leaves(t)[leaves(t).length - 1];
          expect(last.paneIds.length).toBe(n - slotsOf(l.id) + 1);
        }
      }
    }
  });

  it("turns the old flex weights into the column ratio", () => {
    const t = treeFromTemplate("two", [
      { id: "a", width: 1000 },
      { id: "b", width: 420 },
    ]);
    expect(t.type === "branch" && t.ratio).toBeCloseTo(1000 / 1420, 3);
  });

  it("applies the row split to a stacked column", () => {
    const t = treeFromTemplate("two-plus-one", [{ id: "a" }, { id: "b" }, { id: "c" }], 0.3);
    expect(t.type).toBe("branch");
    const right = t.type === "branch" ? t.children[1] : null;
    expect(right?.type === "branch" && right.direction).toBe("column");
    expect(right?.type === "branch" && right.ratio).toBeCloseTo(0.3);
  });

  it("chains three columns by weight", () => {
    const t = treeFromTemplate("three", [
      { id: "a", width: 900 },
      { id: "b", width: 900 },
      { id: "c", width: 700 },
    ]);
    expect(t.type === "branch" && t.ratio).toBeCloseTo(900 / 2500, 3);
    const rest = t.type === "branch" ? (t.children[1] as LayoutNode) : null;
    expect(rest?.type === "branch" && rest.ratio).toBeCloseTo(900 / 1600, 3);
  });

  it("gives an empty pane list a placeholder", () => {
    const t = treeFromTemplate("two", []);
    expect(t.type === "leaf" && t.paneIds).toEqual([]);
  });
});

describe("detectTemplate", () => {
  it("recognises every template it built when the panes fill it", () => {
    for (const l of LAYOUTS) {
      expect(detectTemplate(arrangementFor(l.id, ids(slotsOf(l.id))))).toBe(l.id);
    }
  });

  it("says one for a single tabbed leaf and null for a hand-made shape", () => {
    expect(detectTemplate(arrangementFor("one", ids(3)))).toBe("one");
    const t = treeFromTemplate("two", [{ id: "a" }, { id: "b" }]);
    // Split the left column: [ [a / c] | b ] matches no template.
    const custom: LayoutNode = t.type === "branch" ? { ...t, children: [{ type: "branch", id: "x", direction: "column", ratio: 0.5, children: [t.children[0], { type: "leaf", id: "y", paneIds: ["c"], activeId: "c" }] }, t.children[1]] } : t;
    expect(detectTemplate(custom)).toBeNull();
  });
});
