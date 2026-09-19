import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The TTS store pulls in the speech engines and the API client; none of that
// is under test here.
vi.mock("./ttsStore", () => ({
  useTtsStore: { getState: () => ({ paneId: null, stop: () => {} }) },
}));

import { useWorkspaceStore, type Pane } from "./workspaceStore";

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
      { width: 1000, linkGroup: "A" },
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
