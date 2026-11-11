import { describe, expect, it } from "vitest";
import { sermonToolsShown } from "./useSermonTools";

describe("the sermon tools beside everything quotable", () => {
  it("show for a preacher, for everything, and for anyone never asked", () => {
    expect(sermonToolsShown("preaching", false)).toBe(true);
    expect(sermonToolsShown("everything", false)).toBe(true);
    expect(sermonToolsShown(null, false)).toBe(true);
  });

  it("stay out of the way of a reader, a student and a household", () => {
    expect(sermonToolsShown("reading", false)).toBe(false);
    expect(sermonToolsShown("studying", false)).toBe(false);
    expect(sermonToolsShown("family", false)).toBe(false);
  });

  it("show for anyone with a sermon open", () => {
    expect(sermonToolsShown("reading", true)).toBe(true);
    expect(sermonToolsShown("studying", true)).toBe(true);
  });
});
