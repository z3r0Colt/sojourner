import { describe, expect, it } from "vitest";
import { isDarkGround, luminance } from "./timelineTheme";

describe("theme grounds", () => {
  it("reads a hex color's luminance", () => {
    expect(luminance("#ffffff")).toBeCloseTo(1);
    expect(luminance("#000")).toBeCloseTo(0);
    expect(luminance("rgb(0, 0, 0)")).toBeNull();
  });

  it("tells the dark themes' grounds from the light ones'", () => {
    expect(isDarkGround({ surface: "#181c23" })).toBe(true); // dark
    expect(isDarkGround({ surface: "#0b0b0b" })).toBe(true); // OLED
    expect(isDarkGround({ surface: "#ffffff" })).toBe(false);
    expect(isDarkGround({ surface: "#faf5e9" })).toBe(false); // sepia
    // A color it cannot read is taken for the light ground the washes were made for.
    expect(isDarkGround({ surface: "oklch(0.2 0 0)" })).toBe(false);
  });
});
