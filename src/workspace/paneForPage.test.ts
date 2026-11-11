import { describe, expect, it } from "vitest";
import type { Pane } from "../state/workspaceStore";
import { PAGE_MIN_PX, isPageKind, paneForPage } from "./openContent";

function pane(id: string, kind: Pane["kind"]): Pane {
  return { id, kind, params: {}, linkGroup: "A", history: [], future: [] } as unknown as Pane;
}

const widths = (w: Record<string, number>) => (id: string) => w[id] ?? 0;

describe("where a page lands", () => {
  const bible = pane("bible", "bible");
  const commentary = pane("commentary", "commentary");

  it("tells a page from a study column", () => {
    for (const kind of ["settings", "resources", "guide", "encyclopedia", "sermons", "today"] as const) expect(isPageKind(kind), kind).toBe(true);
    for (const kind of ["commentary", "crossrefs", "mine", "confession-for-passage", "citations", "timeline-for-passage", "search"] as const) expect(isPageKind(kind), kind).toBe(false);
  });

  it("is the wide pane, when the focused one is a narrow study column", () => {
    const w = widths({ bible: 800, commentary: 340 });
    for (const kind of ["settings", "resources", "guide"] as const) expect(paneForPage([bible, commentary], "commentary", kind, w), kind).toBe("bible");
  });

  it("is the focused pane when it has room for a page, as it always was", () => {
    expect(paneForPage([bible, commentary], "bible", "settings", widths({ bible: 800, commentary: 340 }))).toBeNull();
    // A commentary the reader has widened holds a page well enough.
    expect(paneForPage([bible, commentary], "commentary", "settings", widths({ bible: 700, commentary: PAGE_MIN_PX }))).toBeNull();
  });

  it("is the focused pane for anything that is not a page", () => {
    expect(paneForPage([bible, commentary], "commentary", "crossrefs", widths({ bible: 800, commentary: 340 }))).toBeNull();
  });

  it("is the widest pane of several", () => {
    const lexicon = pane("lexicon", "lexicon");
    const w = widths({ bible: 500, lexicon: 620, commentary: 300 });
    expect(paneForPage([bible, lexicon, commentary], "commentary", "settings", w)).toBe("lexicon");
  });

  it("is never a sermon being written, nor a tab that is not showing", () => {
    const sermon = pane("sermon", "sermon");
    const hidden = pane("hidden", "notes");
    const w = widths({ sermon: 900, hidden: 0, commentary: 340 });
    expect(paneForPage([sermon, hidden, commentary], "commentary", "settings", w)).toBeNull();
  });

  it("stays put when no pane is wider, or nothing can be measured", () => {
    expect(paneForPage([bible, commentary], "commentary", "settings", widths({ bible: 300, commentary: 340 }))).toBeNull();
    expect(paneForPage([bible, commentary], "commentary", "settings", widths({}))).toBeNull();
    expect(paneForPage([commentary], "commentary", "settings", widths({ commentary: 340 }))).toBeNull();
  });
});
