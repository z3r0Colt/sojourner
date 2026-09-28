import { describe, expect, it } from "vitest";
import { useUiStore } from "../state/uiStore";
import { PANE_KIND_LIST, type Pane, type PaneContent } from "../state/workspaceStore";
import { completeParams } from "./openContent";
import { PANE_KINDS, PANE_KIND_LIST_LISTED, paneTitle, parseRoute, routeFor } from "./paneKinds";

describe("the Psalter's routes", () => {
  it("reads a psalm number from the path", () => {
    expect(parseRoute("/psalter/23")).toEqual({ kind: "psalter", params: { psalm: 23 } });
    expect(parseRoute("/psalter/1")).toEqual({ kind: "psalter", params: { psalm: 1 } });
    expect(parseRoute("/psalter/150")).toEqual({ kind: "psalter", params: { psalm: 150 } });
  });

  it("opens the Psalter without a psalm when the path names none", () => {
    expect(parseRoute("/psalter")).toEqual({ kind: "psalter", params: {} });
  });

  it("falls back to the Psalter itself for a psalm it does not have", () => {
    for (const path of ["/psalter/0", "/psalter/151", "/psalter/-1", "/psalter/2.5", "/psalter/abc"]) {
      expect(parseRoute(path), path).toEqual({ kind: "psalter", params: {} });
    }
  });

  it("has a path for the tunes", () => {
    expect(parseRoute("/psalter/tunes")).toEqual({ kind: "psalter", params: { view: "tunes" } });
  });

  it("writes the psalm into the path, or the tunes when they are showing", () => {
    expect(routeFor({ kind: "psalter", params: { psalm: 23, view: "psalm" } })).toBe("/psalter/23");
    expect(routeFor({ kind: "psalter", params: { psalm: 23, view: "tunes" } })).toBe("/psalter/tunes");
  });

  it("reads back what it writes", () => {
    for (const psalm of [1, 23, 119, 150]) {
      expect(parseRoute(routeFor({ kind: "psalter", params: { psalm, view: "psalm" } }))).toEqual({ kind: "psalter", params: { psalm } });
    }
  });

  it("leaves the study pane's tunes route as it was", () => {
    expect(parseRoute("/study/tunes")).toEqual({ kind: "tunes", params: {} });
    expect(routeFor({ kind: "tunes", params: {} })).toBe("/study/tunes");
  });

  it("titles the pane by its psalm", () => {
    expect(paneTitle({ kind: "psalter", params: { psalm: 23, view: "psalm" } }, {})).toBe("Psalter · Psalm 23");
    expect(paneTitle({ kind: "psalter", params: { psalm: 23, view: "tunes" } }, {})).toBe("Psalter · Tunes");
  });

  it("names the same psalm in the title and the path as the page shows for damaged saved params", () => {
    const damaged = { kind: "psalter", params: {} } as unknown as PaneContent;
    expect(paneTitle(damaged, {})).toBe("Psalter · Psalm 1");
    expect(routeFor(damaged)).toBe("/psalter/1");
    const pastTheEnd = { kind: "psalter", params: { psalm: 151, view: "psalm" } } as PaneContent;
    expect(paneTitle(pastTheEnd, {})).toBe("Psalter · Psalm 150");
    expect(routeFor(pastTheEnd)).toBe("/psalter/150");
  });
});

describe("the pane-kind registry", () => {
  it("describes every kind the workspace knows, and only those", () => {
    expect(Object.keys(PANE_KINDS).sort()).toEqual([...PANE_KIND_LIST].sort());
  });

  it("offers the Psalter wherever a pane's content is chosen", () => {
    expect(PANE_KIND_LIST_LISTED).toContain("psalter");
    expect(PANE_KINDS.psalter.acceptsPassage).toBe(false);
  });

  it("offers the Psalter's Tunes tab in place of the separate tunes pane, which still opens", () => {
    expect(PANE_KIND_LIST_LISTED).not.toContain("tunes");
    expect(PANE_KIND_LIST).toContain("tunes");
  });

  it("tells the metrical pane that follows the Bible apart from the Psalter page", () => {
    const listedLabels = PANE_KIND_LIST_LISTED.map((k) => PANE_KINDS[k].label);
    expect(new Set(listedLabels).size).toBe(listedLabels.length);
    expect(PANE_KINDS.metrical.label).not.toBe(PANE_KINDS.psalter.label);
    expect(PANE_KINDS.metrical.acceptsPassage).toBe(true);
  });
});

describe("opening the Psalter", () => {
  const psalterPane = (psalm: number, view: "psalm" | "tunes") =>
    ({ id: "p1", kind: "psalter", params: { psalm, view }, linkGroup: "A", history: [], future: [] }) as Pane;

  it("fills a bare request from the last psalm opened", () => {
    useUiStore.setState({ psalterPsalm: 91 });
    expect(completeParams("psalter", {}, undefined)).toEqual({ psalm: 91, view: "psalm" });
  });

  it("keeps an open Psalter on its psalm and tab when the sidebar is clicked again", () => {
    useUiStore.setState({ psalterPsalm: 91 });
    expect(completeParams("psalter", {}, psalterPane(40, "tunes"))).toEqual({ psalm: 40, view: "tunes" });
  });

  it("opens the psalm a route names", () => {
    const parsed = parseRoute("/psalter/23");
    expect(parsed?.kind).toBe("psalter");
    expect(completeParams("psalter", parsed!.params as never, psalterPane(40, "tunes"))).toEqual({ psalm: 23, view: "psalm" });
  });
});
