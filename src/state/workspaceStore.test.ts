import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The TTS store pulls in the speech engines and the API client; none of that
// is under test here.
vi.mock("./ttsStore", () => ({
  useTtsStore: { getState: () => ({ paneId: null, stop: () => {} }) },
}));

import { migrateWorkspace, useWorkspaceStore, type Pane } from "./workspaceStore";
import { leaves, paneOrder, validateTree } from "../workspace/layoutTree";

const bible = (id: string, width = 1000) => ({
  id,
  kind: "bible",
  params: { translationId: null, bookId: 1, chapter: 1, activeVerse: null, paragraphMode: false, redLetterMode: false },
  linkGroup: "A",
  width,
  history: [],
  future: [],
});
const study = (id: string, width = 420) => ({ id, kind: "crossrefs", params: { bookId: 1, chapter: 1, verse: null }, linkGroup: "A", width, history: [], future: [] });

describe("migrateWorkspace", () => {
  it("upgrades a version-1 workspace to a tree of the pane count's template", () => {
    const out = migrateWorkspace({ version: 1, panes: [bible("a"), study("b")], focusedPaneId: "b", lastTranslationId: 3 });
    expect(out).not.toBeNull();
    expect(out!.version).toBe(3);
    expect(validateTree(out!.tree, ["a", "b"])).toEqual([]);
    expect(leaves(out!.tree).length).toBe(2);
    expect(out!.tree.type === "branch" && out!.tree.ratio).toBeCloseTo(1000 / 1420, 3);
    expect(out!.focusedPaneId).toBe("b");
    expect(out!.lastTranslationId).toBe(3);
  });

  it("upgrades a version-2 two-plus-one with its row split", () => {
    const out = migrateWorkspace({ version: 2, panes: [bible("a"), study("b"), study("c")], focusedPaneId: "a", lastTranslationId: null, layout: "two-plus-one", rowSplit: 0.3 });
    expect(out).not.toBeNull();
    const t = out!.tree;
    expect(t.type).toBe("branch");
    const right = t.type === "branch" ? t.children[1] : null;
    expect(right?.type === "branch" && right.direction).toBe("column");
    expect(right?.type === "branch" && right.ratio).toBeCloseTo(0.3);
    expect(paneOrder(t)).toEqual(["a", "b", "c"]);
    expect((out!.panes[0] as unknown as { width?: number }).width).toBeUndefined();
  });

  it("normalizes a version-3 workspace whose tree is rubbish", () => {
    const out = migrateWorkspace({ version: 3, panes: [bible("a"), study("b")], focusedPaneId: "a", lastTranslationId: null, tree: { nope: 1 } });
    expect(out).not.toBeNull();
    expect(paneOrder(out!.tree)).toEqual(["a", "b"]);
  });

  it("keeps at most eight panes and drops the rest from the tree", () => {
    const panes = Array.from({ length: 10 }, (_, i) => study(`p${i}`));
    const out = migrateWorkspace({ version: 2, panes, focusedPaneId: "p9", lastTranslationId: null, layout: "three", rowSplit: 0.5 });
    expect(out!.panes.length).toBe(8);
    expect(validateTree(out!.tree, out!.panes.map((p) => p.id))).toEqual([]);
    expect(out!.focusedPaneId).toBe("p0");
  });

  it("refuses an unknown version or an empty workspace", () => {
    expect(migrateWorkspace({ version: 9, panes: [bible("a")] })).toBeNull();
    expect(migrateWorkspace({ version: 3, panes: [], tree: null })).toBeNull();
  });
});

function biblePane(panes: Pane[], id: string) {
  const pane = panes.find((p) => p.id === id);
  if (!pane || pane.kind !== "bible") throw new Error(`no bible pane ${id}`);
  return pane;
}

describe("publishPassage to a linked Bible pane", () => {
  let leader: string;
  let follower: string;

  beforeEach(() => {
    const s = useWorkspaceStore.getState();
    leader = s.panes[0].id;
    const id = s.addPane(
      { kind: "bible", params: { translationId: null, bookId: 43, chapter: 3, activeVerse: null, paragraphMode: false, redLetterMode: false } },
      { linkGroup: "A" },
    );
    if (!id) throw new Error("workspace full");
    follower = id;
    useWorkspaceStore.getState().setPaneContent(leader, { kind: "bible", params: { translationId: null, bookId: 43, chapter: 3, activeVerse: null, paragraphMode: false, redLetterMode: false } }, { pushHistory: false });
  });

  afterEach(() => {
    useWorkspaceStore.getState().closePane(follower);
  });

  it("selects the verse and makes it the scroll target in the same chapter", () => {
    useWorkspaceStore.getState().publishPassage(leader, { bookId: 43, chapter: 3, verse: 16 });
    const f = biblePane(useWorkspaceStore.getState().panes, follower);
    expect(f.params.activeVerse).toBe(16);
    expect(f.params.verse).toBe(16);
  });

  it("carries the verse as the scroll target across a chapter change", () => {
    useWorkspaceStore.getState().publishPassage(leader, { bookId: 45, chapter: 8, verse: 28 });
    const f = biblePane(useWorkspaceStore.getState().panes, follower);
    expect(f.params.bookId).toBe(45);
    expect(f.params.chapter).toBe(8);
    expect(f.params.activeVerse).toBe(28);
    expect(f.params.verse).toBe(28);
  });

  it("clears the scroll target when the selection is cleared", () => {
    useWorkspaceStore.getState().publishPassage(leader, { bookId: 43, chapter: 3, verse: 16 });
    useWorkspaceStore.getState().publishPassage(leader, { bookId: 43, chapter: 3, verse: null });
    const f = biblePane(useWorkspaceStore.getState().panes, follower);
    expect(f.params.activeVerse).toBeNull();
    expect(f.params.verse).toBeUndefined();
  });

  it("leaves the leader alone", () => {
    useWorkspaceStore.getState().publishPassage(leader, { bookId: 43, chapter: 3, verse: 16 });
    const l = biblePane(useWorkspaceStore.getState().panes, leader);
    expect(l.params.verse).toBeUndefined();
  });
});
