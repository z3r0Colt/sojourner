/**
 * How wide a pane's side panel is and whether it is folded away: the rules
 * behind `SidePanel`, kept apart from React so they can be tested.
 *
 * A side panel (the Atlas's list of places, the Encyclopedia's index) is
 * sized in pixels the reader chose by dragging, but never more than a share
 * of its pane, so a thin pane keeps room for what the panel is beside. In a
 * pane too narrow for both, the panel folds to a strip by itself -- once
 * there is something beside it to read -- and the reader can open it again.
 */

export interface SidePanelPrefs {
  /** The width the reader last dragged it to. */
  width?: number;
  /** Folded away by the reader in a pane wide enough for it. */
  collapsed?: boolean;
}

export interface SidePanelRules {
  defaultWidth: number;
  minWidth: number;
  /** The most of its pane the panel may take, 0..1. */
  maxShare: number;
  /** Below this pane width the panel folds itself away. */
  collapseBelow: number;
  /** False while there is nothing beside the panel to make room for (no
   * article chosen yet): then it stays open whatever the pane's width. */
  autoCollapse: boolean;
}

export const SIDE_PANEL_DEFAULTS: Omit<SidePanelRules, "defaultWidth"> = {
  minWidth: 180,
  maxShare: 0.5,
  collapseBelow: 640,
  autoCollapse: true,
};

/** The panel's width in pixels for a pane `paneWidth` wide (0 = not yet
 * measured, when only the panel's own limits apply). */
export function sidePanelWidth(prefs: SidePanelPrefs, rules: SidePanelRules, paneWidth: number): number {
  const wanted = prefs.width ?? rules.defaultWidth;
  const ceiling = paneWidth > 0 ? Math.max(rules.minWidth, Math.floor(paneWidth * rules.maxShare)) : Infinity;
  return Math.round(Math.min(Math.max(wanted, rules.minWidth), ceiling));
}

/** Whether the panel shows as a strip. `override` is the reader's choice in
 * this pane since it opened (null when they have not chosen); it wins. */
export function sidePanelCollapsed(prefs: SidePanelPrefs, rules: SidePanelRules, paneWidth: number, override: boolean | null): boolean {
  if (override != null) return override;
  const narrow = paneWidth > 0 && paneWidth < rules.collapseBelow;
  if (narrow && rules.autoCollapse) return true;
  return !!prefs.collapsed;
}
