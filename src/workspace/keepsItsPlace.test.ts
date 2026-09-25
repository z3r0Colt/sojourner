import { describe, expect, it } from "vitest";
import type { Pane } from "../state/workspaceStore";
import { keepsItsPlace } from "./openContent";

const pane = (kind: string, params: object) => ({ id: "p1", kind, params, linkGroup: "A" }) as unknown as Pane;

describe("keepsItsPlace", () => {
  it("keeps a sermon manuscript on screen when something else is opened", () => {
    expect(keepsItsPlace(pane("sermon", { id: 7 }), "family", {})).toBe(true);
    expect(keepsItsPlace(pane("sermon", { id: 7 }), "sermon", { id: 8 })).toBe(true);
  });

  it("lets the same sermon reopen in place", () => {
    expect(keepsItsPlace(pane("sermon", { id: 7 }), "sermon", { id: 7 })).toBe(false);
  });

  it("leaves every other pane to be navigated as before", () => {
    expect(keepsItsPlace(pane("sermons", {}), "prayer", {})).toBe(false);
    expect(keepsItsPlace(pane("prayer", {}), "family", {})).toBe(false);
  });
});
