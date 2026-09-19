import { describe, expect, it } from "vitest";
import type { Resource } from "../../api/types";
import { NO_AUTHOR, NO_TOPIC, filterByKind, formatDuration, groupResources, kindSummary, knownAuthors } from "./resourceGrouping";

const r = (id: number, kind: Resource["kind"], title: string, author: string | null, added_at = "2026-01-01"): Resource => ({
  id,
  kind,
  title,
  author,
  file_path: `C:/x/${title}.${kind}`,
  has_text: true,
  added_at,
  bundled: false,
});

const lib = [r(1, "epub", "Bruised Reed", "Sibbes", "2026-01-03"), r(2, "pdf", "Zeal", null, "2026-01-05"), r(3, "audio", "Sermon on Romans 8", "Sibbes", "2026-01-02"), r(4, "video", "Lecture", " ", "2026-01-04"), r(5, "mobi", "All of Grace", "spurgeon", "2026-01-01")];

describe("filterByKind", () => {
  it("counts epub, pdf and mobi as books", () => {
    expect(filterByKind(lib, "books").map((x) => x.id)).toEqual([1, 2, 5]);
    expect(filterByKind(lib, "audio").map((x) => x.id)).toEqual([3]);
    expect(filterByKind(lib, "video").map((x) => x.id)).toEqual([4]);
    expect(filterByKind(lib, "all").length).toBe(5);
  });
});

describe("groupResources", () => {
  it("by author: alphabetical, case-insensitive, no-author last, titles sorted", () => {
    const groups = groupResources(lib, "author", new Map());
    expect(groups.map((g) => g.label)).toEqual(["Sibbes", "spurgeon", NO_AUTHOR]);
    expect(groups[0].items.map((x) => x.title)).toEqual(["Bruised Reed", "Sermon on Romans 8"]);
    expect(groups[2].fallback).toBe(true);
    expect(groups[2].items.map((x) => x.id)).toEqual([4, 2]);
  });

  it("by recent: one group, newest first", () => {
    const groups = groupResources(lib, "recent", new Map());
    expect(groups.length).toBe(1);
    expect(groups[0].items.map((x) => x.id)).toEqual([2, 4, 1, 3, 5]);
  });

  it("by topic: a resource appears under each of its tags, untagged last", () => {
    const tags = new Map<number, string[]>([
      [1, ["justification", "assurance"]],
      [3, ["assurance"]],
    ]);
    const groups = groupResources(lib, "topic", tags);
    expect(groups.map((g) => g.label)).toEqual(["assurance", "justification", NO_TOPIC]);
    expect(groups[0].items.map((x) => x.id)).toEqual([1, 3]);
    expect(groups[2].items.length).toBe(3);
  });

  it("gives an empty library no groups", () => {
    expect(groupResources([], "author", new Map())).toEqual([]);
    expect(groupResources([], "recent", new Map())).toEqual([]);
  });
});

describe("helpers", () => {
  it("summarises kinds and lists known authors once", () => {
    expect(kindSummary(lib)).toBe("3 books · 1 audio · 1 video");
    expect(kindSummary([lib[0]])).toBe("1 book");
    expect(knownAuthors([...lib, r(9, "epub", "x", "SIBBES")])).toEqual(["Sibbes", "spurgeon"]);
  });

  it("formats durations", () => {
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(3725)).toBe("1:02:05");
  });
});
