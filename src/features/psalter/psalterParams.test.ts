import { describe, expect, it } from "vitest";
import { clampPsalm, completePsalterParams, isPsalmNumber, isPsalterTab, psalmShown, stepPsalm } from "./psalterParams";

describe("isPsalmNumber", () => {
  it("knows the hundred and fifty psalms", () => {
    expect(isPsalmNumber(1)).toBe(true);
    expect(isPsalmNumber(119)).toBe(true);
    expect(isPsalmNumber(150)).toBe(true);
  });

  it("refuses what the Psalter does not have", () => {
    for (const n of [0, 151, -3, 2.5, Number.NaN, "23", null, undefined]) expect(isPsalmNumber(n), String(n)).toBe(false);
  });
});

describe("clampPsalm", () => {
  it("brings a number past either end to the nearest psalm", () => {
    expect(clampPsalm(0)).toBe(1);
    expect(clampPsalm(-40)).toBe(1);
    expect(clampPsalm(151)).toBe(150);
    expect(clampPsalm(22.6)).toBe(23);
  });

  it("starts at the beginning when given no number at all", () => {
    expect(clampPsalm(Number.NaN)).toBe(1);
    expect(clampPsalm(Number.POSITIVE_INFINITY)).toBe(1);
  });
});

describe("psalmShown", () => {
  it("is the pane's own psalm when it has a real one", () => {
    expect(psalmShown({ psalm: 23 })).toBe(23);
    expect(psalmShown({ psalm: 150 })).toBe(150);
  });

  it("brings a damaged saved psalm to the nearest one", () => {
    expect(psalmShown({ psalm: 0 })).toBe(1);
    expect(psalmShown({ psalm: 151 })).toBe(150);
    expect(psalmShown({ psalm: "23" })).toBe(23);
    expect(psalmShown({})).toBe(1);
    expect(psalmShown({ psalm: null })).toBe(1);
  });
});

describe("isPsalterTab", () => {
  it("knows the page's two tabs and nothing else", () => {
    expect(isPsalterTab("psalm")).toBe(true);
    expect(isPsalterTab("tunes")).toBe(true);
    expect(isPsalterTab("hymns")).toBe(false);
    expect(isPsalterTab(undefined)).toBe(false);
  });
});

describe("stepPsalm", () => {
  it("turns one psalm either way", () => {
    expect(stepPsalm(23, 1)).toBe(24);
    expect(stepPsalm(23, -1)).toBe(22);
  });

  it("stops at the ends of the book rather than wrapping round", () => {
    expect(stepPsalm(1, -1)).toBeNull();
    expect(stepPsalm(150, 1)).toBeNull();
    expect(stepPsalm(149, 1)).toBe(150);
    expect(stepPsalm(2, -1)).toBe(1);
  });
});

describe("completePsalterParams", () => {
  it("opens the psalm asked for, on its words", () => {
    expect(completePsalterParams({ psalm: 23 }, null, 100)).toEqual({ psalm: 23, view: "psalm" });
  });

  it("turns a Psalter on its Tunes tab back to the words when a psalm is chosen", () => {
    expect(completePsalterParams({ psalm: 24 }, { psalm: 23, view: "tunes" }, 23)).toEqual({ psalm: 24, view: "psalm" });
  });

  it("leaves an open Psalter where it is when no psalm is named", () => {
    expect(completePsalterParams({}, { psalm: 40, view: "tunes" }, 12)).toEqual({ psalm: 40, view: "tunes" });
  });

  it("comes back to the last psalm opened, else Psalm 1", () => {
    expect(completePsalterParams({}, null, 119)).toEqual({ psalm: 119, view: "psalm" });
    expect(completePsalterParams({}, null, null)).toEqual({ psalm: 1, view: "psalm" });
  });

  it("ignores a psalm the Psalter does not have, and a remembered one gone bad", () => {
    expect(completePsalterParams({ psalm: 151 }, null, 8)).toEqual({ psalm: 8, view: "psalm" });
    expect(completePsalterParams({ psalm: 0 }, null, 0)).toEqual({ psalm: 1, view: "psalm" });
  });

  it("opens straight on the tunes when that is what was asked for", () => {
    expect(completePsalterParams({ view: "tunes" }, null, 51)).toEqual({ psalm: 51, view: "tunes" });
  });

  it("drops a tab it does not know", () => {
    const partial = { view: "hymns" } as unknown as Parameters<typeof completePsalterParams>[0];
    expect(completePsalterParams(partial, null, null)).toEqual({ psalm: 1, view: "psalm" });
  });
});
