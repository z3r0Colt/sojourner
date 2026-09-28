import { beforeEach, describe, expect, it, vi } from "vitest";

// The TTS store pulls in the speech engines and the API client; none of that
// is under test here.
vi.mock("../../state/ttsStore", () => ({
  useTtsStore: { getState: () => ({ paneId: null, stop: () => {} }) },
}));

import type { Book } from "../../api/types";
import { useWorkspaceStore, type Pane } from "../../state/workspaceStore";
import { ListMusic } from "lucide-react";
import { allCommands, commandNamedBy, filterCommands, navigationCommands, type CommandContext } from "./commands";

const books = [
  { id: 19, name: "Psalms", chapter_count: 150 },
  { id: 20, name: "Proverbs", chapter_count: 31 },
] as unknown as Book[];
const ctx: CommandContext = { titles: { books } };

const biblePane = {
  id: "bible",
  kind: "bible",
  params: { translationId: null, bookId: 19, chapter: 23, activeVerse: null, paragraphMode: false, redLetterMode: false },
  linkGroup: "A",
  history: [],
  future: [],
} as Pane;
const psalterPane = (psalm: number) => ({ id: "psalter", kind: "psalter", params: { psalm, view: "psalm" }, linkGroup: "A", history: [], future: [] }) as Pane;

function byId(focusedPaneId: string, psalm = 40) {
  useWorkspaceStore.setState({ panes: [biblePane, psalterPane(psalm)], focusedPaneId });
  return new Map(navigationCommands(ctx).map((c) => [c.id, c]));
}

describe("the chapter and psalm steps", () => {
  beforeEach(() => useWorkspaceStore.setState({ panes: [], focusedPaneId: "" }));

  it("gives Ctrl+[ and Ctrl+] to the Bible's chapters while the Bible is being read", () => {
    const cmds = byId("bible");
    expect(cmds.get("next-chapter")?.keys).toEqual(["Ctrl", "]"]);
    expect(cmds.get("prev-chapter")?.keys).toEqual(["Ctrl", "["]);
    expect(cmds.has("next-psalm")).toBe(false);
  });

  it("gives them to the psalms while the Psalter is being read, and still offers the chapters by name", () => {
    const cmds = byId("psalter");
    expect(cmds.get("next-psalm")).toMatchObject({ label: "Next psalm: Psalm 41", keys: ["Ctrl", "]"] });
    expect(cmds.get("prev-psalm")).toMatchObject({ label: "Previous psalm: Psalm 39", keys: ["Ctrl", "["] });
    expect(cmds.get("next-chapter")?.keys).toBeUndefined();
    expect(cmds.get("prev-chapter")?.keys).toBeUndefined();
  });

  it("offers no step past either end of the Psalter", () => {
    expect(byId("psalter", 150).has("next-psalm")).toBe(false);
    expect(byId("psalter", 1).has("prev-psalm")).toBe(false);
  });

  it("turns the Psalter it names, not the Bible", () => {
    byId("psalter").get("next-psalm")!.run();
    const panes = useWorkspaceStore.getState().panes;
    expect(panes.find((p) => p.id === "psalter")?.params).toEqual({ psalm: 41, view: "psalm" });
    expect(panes.find((p) => p.id === "bible")?.params).toMatchObject({ bookId: 19, chapter: 23 });
  });
});

describe("finding a command by name", () => {
  beforeEach(() => useWorkspaceStore.setState({ panes: [biblePane, psalterPane(40)], focusedPaneId: "bible" }));

  it("puts the Psalter's own command first for \"psalter\", ahead of the pane commands that also say it", () => {
    const found = filterCommands(allCommands(ctx), "psalter");
    expect(found[0]?.id).toBe("open-psalter");
    expect(found.map((c) => c.id)).toContain("open-new-psalter");
  });

  it("ranks whole words of the name over a word begun, and both over keywords", () => {
    const cmd = (id: string, label: string, keywords?: string) => ({ id, label, keywords, group: "Test", icon: ListMusic, run: () => {} });
    const commands = [cmd("keyword", "Something else", "tune"), cmd("prefix", "Tunes index"), cmd("whole", "Play the tune")];
    expect(filterCommands(commands, "tune").map((c) => c.id)).toEqual(["whole", "prefix", "keyword"]);
  });

  it("tells the palette which commands the typed words name outright", () => {
    const open = allCommands(ctx).find((c) => c.id === "open-psalter")!;
    expect(commandNamedBy(open, "psalter")).toBe(true);
    expect(commandNamedBy(open, "the psalter")).toBe(true);
    expect(commandNamedBy(open, "psalt")).toBe(false);
    expect(commandNamedBy(open, "")).toBe(false);
  });
});
