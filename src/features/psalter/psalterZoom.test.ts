import { describe, expect, it } from "vitest";
import { clampPsalterZoom, PSALTER_ZOOM_MAX, PSALTER_ZOOM_MIN, useUiStore } from "../../state/uiStore";

// The Psalter's zoom is remembered between sessions, so what comes back from
// storage is brought to a whole step inside the range before it is used.

describe("the Psalter's zoom", () => {
  it("keeps to whole steps inside its range", () => {
    expect(clampPsalterZoom(100)).toBe(100);
    expect(clampPsalterZoom(134)).toBe(130);
    expect(clampPsalterZoom(10)).toBe(PSALTER_ZOOM_MIN);
    expect(clampPsalterZoom(900)).toBe(PSALTER_ZOOM_MAX);
  });

  it("falls back to its own size for a damaged preference", () => {
    expect(clampPsalterZoom(Number.NaN)).toBe(100);
    expect(clampPsalterZoom(Number.POSITIVE_INFINITY)).toBe(100);
  });

  it("is remembered, and clamped as it is set", () => {
    useUiStore.getState().setPsalterZoom(250);
    expect(useUiStore.getState().psalterZoom).toBe(PSALTER_ZOOM_MAX);
    expect(JSON.parse(localStorage.getItem("bsa-ui-prefs") ?? "{}").psalterZoom).toBe(PSALTER_ZOOM_MAX);
    useUiStore.getState().setPsalterZoom(100);
    expect(useUiStore.getState().psalterZoom).toBe(100);
  });
});
