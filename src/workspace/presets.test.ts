import { describe, expect, it, vi } from "vitest";

vi.mock("../state/ttsStore", () => ({
  useTtsStore: { getState: () => ({ paneId: null, stop: () => {} }) },
}));

import { PRESET_WORKSPACES, applyWorkspace, captureWorkspace, mapPaneIds, sanitizeSavedWorkspaces, savedTree } from "./presets";
import { useWorkspaceStore } from "../state/workspaceStore";
import { leaves, paneOrder, validateTree } from "./layoutTree";

describe("saved workspaces", () => {
  it("every preset's tree names exactly its panes by index", () => {
    for (const p of PRESET_WORKSPACES) {
      const ids = p.panes.map((_, i) => String(i));
      expect(validateTree(savedTree(p), ids)).toEqual([]);
    }
  });

  it("captures the live tree with pane indexes and applies it back", () => {
    applyWorkspace(PRESET_WORKSPACES[1], undefined);
    const before = useWorkspaceStore.getState();
    expect(before.panes.length).toBe(4);
    expect(leaves(before.tree).length).toBe(4);
    const saved = captureWorkspace("mine");
    expect(paneOrder(saved.tree!)).toEqual(["0", "1", "2", "3"]);
    expect(validateTree(saved.tree!, ["0", "1", "2", "3"])).toEqual([]);

    applyWorkspace(PRESET_WORKSPACES[0], undefined);
    expect(useWorkspaceStore.getState().panes.length).toBe(1);
    applyWorkspace(saved, undefined);
    const after = useWorkspaceStore.getState();
    expect(after.panes.map((p) => p.kind)).toEqual(["bible", "commentary", "sermons", "mine"]);
    expect(leaves(after.tree).length).toBe(4);
    expect(validateTree(after.tree, after.panes.map((p) => p.id))).toEqual([]);
  });

  it("converts an old saved workspace with a layout and row split", () => {
    const [old] = sanitizeSavedWorkspaces([{ name: "old", layout: "two-plus-one", rowSplit: 0.25, panes: [{ kind: "bible", params: {}, linkGroup: "A", width: 1000 }, { kind: "commentary", params: {}, linkGroup: "A", width: 420 }, { kind: "mine", params: {}, linkGroup: "A", width: 420 }] }]);
    expect(old.layout).toBe("two-plus-one");
    const t = savedTree(old);
    expect(leaves(t).length).toBe(3);
    const right = t.type === "branch" ? t.children[1] : null;
    expect(right?.type === "branch" && right.ratio).toBeCloseTo(0.25);
  });

  it("drops what is not a workspace and keeps a valid tree", () => {
    const out = sanitizeSavedWorkspaces([null, 3, { name: "", panes: [] }, { name: "x", panes: [{ kind: "nope" }] }, { name: "ok", panes: [{ kind: "bible", params: {} }], tree: { type: "leaf", id: "l", paneIds: ["0"], activeId: "0" } }, { name: "badtree", panes: [{ kind: "bible", params: {} }], tree: { type: "leaf" } }]);
    expect(out.map((w) => w.name)).toEqual(["ok", "badtree"]);
    expect(out[0].tree).toBeDefined();
    expect(out[1].tree).toBeUndefined();
  });

  it("mapPaneIds drops ids the map has nothing for", () => {
    const t = savedTree(PRESET_WORKSPACES[2]);
    const mapped = mapPaneIds(t, (i) => (i === "1" ? null : `id${i}`));
    expect(paneOrder(mapped)).toEqual(["id0", "id2"]);
  });
});
