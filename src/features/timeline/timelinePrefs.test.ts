import { describe, expect, it } from "vitest";
import { readTimelinePrefs, writeTimelinePrefs } from "./timelinePrefs";

describe("the church history preference", () => {
  it("is on until the reader turns it off", () => {
    expect(readTimelinePrefs(null)).toEqual({ showChurchHistory: true });
    expect(readTimelinePrefs("{}")).toEqual({ showChurchHistory: true });
    expect(readTimelinePrefs('{"showChurchHistory":true}')).toEqual({ showChurchHistory: true });
    expect(readTimelinePrefs('{"showChurchHistory":false}')).toEqual({ showChurchHistory: false });
  });

  it("reads a damaged entry as nothing stored", () => {
    expect(readTimelinePrefs("{not json")).toEqual({ showChurchHistory: true });
    expect(readTimelinePrefs("null")).toEqual({ showChurchHistory: true });
    expect(readTimelinePrefs("[false]")).toEqual({ showChurchHistory: true });
    expect(readTimelinePrefs('"false"')).toEqual({ showChurchHistory: true });
  });

  it("saves over what is stored, keeping the rest", () => {
    expect(JSON.parse(writeTimelinePrefs(null, { showChurchHistory: false }))).toEqual({ showChurchHistory: false });
    expect(JSON.parse(writeTimelinePrefs('{"showChurchHistory":false,"other":1}', { showChurchHistory: true }))).toEqual({
      showChurchHistory: true,
      other: 1,
    });
  });

  it("saves even over a damaged entry, which would otherwise block every save", () => {
    const saved = writeTimelinePrefs("{not json", { showChurchHistory: false });
    expect(readTimelinePrefs(saved)).toEqual({ showChurchHistory: false });
  });
});
