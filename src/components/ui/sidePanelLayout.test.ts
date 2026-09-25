import { describe, expect, it } from "vitest";
import { SIDE_PANEL_DEFAULTS, sidePanelCollapsed, sidePanelWidth, type SidePanelRules } from "./sidePanelLayout";

const rules: SidePanelRules = { ...SIDE_PANEL_DEFAULTS, defaultWidth: 320 };

describe("sidePanelWidth", () => {
  it("uses the default until the reader drags it", () => {
    expect(sidePanelWidth({}, rules, 1400)).toBe(320);
    expect(sidePanelWidth({ width: 410 }, rules, 1400)).toBe(410);
  });

  it("never takes more than half of a thin pane", () => {
    expect(sidePanelWidth({}, rules, 500)).toBe(250);
    expect(sidePanelWidth({ width: 600 }, rules, 900)).toBe(450);
  });

  it("keeps its minimum even in a very thin pane", () => {
    expect(sidePanelWidth({ width: 40 }, rules, 1400)).toBe(180);
    expect(sidePanelWidth({}, rules, 300)).toBe(180);
  });

  it("applies only its own limits before the pane is measured", () => {
    expect(sidePanelWidth({ width: 900 }, rules, 0)).toBe(900);
  });
});

describe("sidePanelCollapsed", () => {
  it("folds itself away in a narrow pane", () => {
    expect(sidePanelCollapsed({}, rules, 500, null)).toBe(true);
    expect(sidePanelCollapsed({}, rules, 1000, null)).toBe(false);
  });

  it("stays open while there is nothing beside it", () => {
    expect(sidePanelCollapsed({}, { ...rules, autoCollapse: false }, 500, null)).toBe(false);
  });

  it("remembers the reader folding it in a wide pane", () => {
    expect(sidePanelCollapsed({ collapsed: true }, rules, 1000, null)).toBe(true);
  });

  it("lets the reader's choice in this pane win", () => {
    expect(sidePanelCollapsed({}, rules, 500, false)).toBe(false);
    expect(sidePanelCollapsed({}, rules, 1000, true)).toBe(true);
  });
});
