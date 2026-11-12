import { describe, expect, it } from "vitest";
import { tipPosition } from "./tipPosition";

const view = { width: 1000, height: 600 };
const tip = { width: 120, height: 24 };

describe("where a tooltip goes", () => {
  it("is centred under what it names", () => {
    expect(tipPosition({ left: 480, right: 512, top: 50, bottom: 82 }, tip, view)).toEqual({ left: 436, top: 88 });
  });

  it("goes above when there is no room below", () => {
    expect(tipPosition({ left: 480, right: 512, top: 560, bottom: 592 }, tip, view).top).toBe(530);
  });

  it("is held inside the window at either edge", () => {
    expect(tipPosition({ left: 2, right: 34, top: 50, bottom: 82 }, tip, view).left).toBe(6);
    expect(tipPosition({ left: 966, right: 998, top: 50, bottom: 82 }, tip, view).left).toBe(874);
  });
});
