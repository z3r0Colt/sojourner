import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * "Sources and licences" under a Webster entry (openAboutAt), against the
 * real workspace: it goes to the Settings pane already open rather than
 * opening another About beside it each time, and the About page asked --
 * new, or open already -- is the one told which credit to go to.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let paneId = "";
vi.mock("../../../workspace/PaneContext", () => ({ usePaneOptional: () => ({ id: paneId }) }));
vi.mock("../../../api/client", () => ({ api: { appVersion: () => new Promise(() => {}) } }));
vi.mock("../../../api/queries", () => ({ useTranslations: () => ({ data: [], isPending: false }) }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: [], isPending: false }) }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: () => Promise.resolve() }));

const { openAboutAt, useCreditAsked, AboutSection } = await import("./AboutSection");
const { openContent } = await import("../../../workspace/openContent");
const { useWorkspaceStore } = await import("../../../state/workspaceStore");

const click = { ctrlKey: false, metaKey: false, button: 0 } as React.MouseEvent;
const ctrlClick = { ctrlKey: true, metaKey: false, button: 0 } as React.MouseEvent;
const settingsPanes = () => useWorkspaceStore.getState().panes.filter((p) => p.kind === "settings");
const focused = () => useWorkspaceStore.getState().focusedPaneId;

/** A Dictionary pane showing a Webster entry, focused, as when its footer
 * link is clicked. */
function focusDictionary(): string {
  const store = useWorkspaceStore.getState();
  const open = store.panes.find((p) => p.kind === "dictionary");
  if (open) store.focusPane(open.id);
  else openContent("dictionary", { slug: null, work: "webster", webster: 1 }, { target: "new" });
  return focused();
}

describe("Sources and licences", () => {
  beforeEach(() => {
    const store = useWorkspaceStore.getState();
    for (const p of store.panes.filter((p) => p.kind === "settings" || p.kind === "dictionary")) store.closePane(p.id);
    useCreditAsked.setState({ asked: null });
  });

  it("opens About once, and goes back to it after", () => {
    const dictionary = focusDictionary();
    openAboutAt("webster-1828", click);
    expect(settingsPanes()).toHaveLength(1);
    const about = settingsPanes()[0];
    expect(about.params).toMatchObject({ section: "about" });
    expect(focused()).toBe(about.id);
    expect(useCreditAsked.getState().asked).toEqual({ credit: "webster-1828", paneId: about.id });

    useCreditAsked.setState({ asked: null });
    expect(focusDictionary()).toBe(dictionary);
    openAboutAt("webster-1828", click);
    expect(settingsPanes().map((p) => p.id)).toEqual([about.id]);
    expect(focused()).toBe(about.id);
    expect(useCreditAsked.getState().asked).toEqual({ credit: "webster-1828", paneId: about.id });
  });

  it("turns a Settings pane showing another section to About", () => {
    openContent("settings", { section: "preferences" }, { target: "new" });
    const settings = settingsPanes()[0];
    focusDictionary();
    openAboutAt("webster-1828", click);
    expect(settingsPanes().map((p) => [p.id, p.params.section])).toEqual([[settings.id, "about"]]);
  });

  it("opens a new one on Ctrl+click", () => {
    focusDictionary();
    openAboutAt("webster-1828", click);
    focusDictionary();
    openAboutAt("webster-1828", ctrlClick);
    expect(settingsPanes()).toHaveLength(2);
    expect(useCreditAsked.getState().asked?.paneId).toBe(focused());
  });

  it("is heard by the About page asked, open or not, and by no other", () => {
    const host = document.createElement("div");
    const root = createRoot(host);
    paneId = "s1";
    useCreditAsked.setState({ asked: { credit: "webster-1828", paneId: "s2" } });
    act(() => root.render(createElement(AboutSection)));
    expect(useCreditAsked.getState().asked).not.toBeNull();
    // Asked after it opened: taken up and let go of.
    act(() => useCreditAsked.setState({ asked: { credit: "webster-1828", paneId: "s1" } }));
    expect(useCreditAsked.getState().asked).toBeNull();
    act(() => root.unmount());
  });
});
