import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The TTS store pulls in the speech engines and the API client; none of that
// is under test here.
vi.mock("../../state/ttsStore", () => ({
  useTtsStore: { getState: () => ({ paneId: null, stop: () => {} }) },
}));

import { useUiStore } from "../../state/uiStore";
import { useWorkspaceStore } from "../../state/workspaceStore";
import { openContent, openPassage } from "../../workspace/openContent";
import { openFromTimeline } from "./timelineLinks";

describe("a link from a maximized timeline", () => {
  let timeline: string;
  let before: string[];

  beforeEach(() => {
    const s = useWorkspaceStore.getState();
    before = s.panes.map((p) => p.id);
    // A Bible pane to read in, and the timeline beside it, maximized.
    s.addPane({ kind: "bible", params: { translationId: null, bookId: 45, chapter: 8, activeVerse: null, paragraphMode: false, redLetterMode: false } });
    const id = useWorkspaceStore.getState().addPane({ kind: "timeline", params: { eventId: 100200, year: null } });
    if (!id) throw new Error("workspace full");
    timeline = id;
    useWorkspaceStore.getState().setMaximized(timeline);
  });

  afterEach(() => {
    const s = useWorkspaceStore.getState();
    for (const p of s.panes) if (!before.includes(p.id)) useWorkspaceStore.getState().closePane(p.id);
    useWorkspaceStore.getState().setMaximized(null);
    useUiStore.getState().setDistractionFreeMode(false);
  });

  it("opening beside it lets the maximize go, so the new pane is on screen", () => {
    openFromTimeline(() => openContent("westminster", { docCode: "dort", sectionId: null }, { target: "new", from: timeline }));
    const s = useWorkspaceStore.getState();
    const opened = s.panes.find((p) => p.kind === "westminster");
    expect(opened).toBeDefined();
    expect(s.focusedPaneId).toBe(opened!.id);
    expect(s.maximizedPaneId).toBeNull();
  });

  it("a passage opening in the Bible pane behind it does the same", () => {
    openFromTimeline(() => openPassage({ bookId: 1, chapter: 12, verse: 1 }, { target: "focused", from: timeline }));
    const s = useWorkspaceStore.getState();
    const bible = s.panes.find((p) => p.id === s.focusedPaneId);
    expect(bible?.kind === "bible" && bible.params.bookId).toBe(1);
    expect(s.panes.find((p) => p.id === timeline)?.kind).toBe("timeline");
    expect(s.maximizedPaneId).toBeNull();
  });

  it("leaves focus mode as Esc does", () => {
    useUiStore.getState().setDistractionFreeMode(true);
    openFromTimeline(() => openContent("resource", { id: 85 }, { target: "new", from: timeline }));
    expect(useWorkspaceStore.getState().maximizedPaneId).toBeNull();
    expect(useUiStore.getState().distractionFreeMode).toBe(false);
  });

  it("keeps the pane maximized when the link opened in it", () => {
    openFromTimeline(() => openContent("factbook", { id: "person:abraham" }, { target: timeline }));
    const s = useWorkspaceStore.getState();
    expect(s.panes.find((p) => p.id === timeline)?.kind).toBe("factbook");
    expect(s.maximizedPaneId).toBe(timeline);
  });
});

describe("a link from a timeline that is not maximized", () => {
  it("changes nothing about the layout", () => {
    const s = useWorkspaceStore.getState();
    const before = s.panes.map((p) => p.id);
    const id = s.addPane({ kind: "timeline", params: { eventId: null, year: null } })!;
    openFromTimeline(() => openContent("atlas", { journey: "paul-1" }, { target: "new", from: id }));
    expect(useWorkspaceStore.getState().maximizedPaneId).toBeNull();
    expect(useUiStore.getState().distractionFreeMode).toBe(false);
    for (const p of useWorkspaceStore.getState().panes) if (!before.includes(p.id)) useWorkspaceStore.getState().closePane(p.id);
  });
});
