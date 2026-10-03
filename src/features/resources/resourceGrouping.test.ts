import { describe, expect, it } from "vitest";
import type { CatalogEntry, Resource } from "../../api/types";
import {
  NO_AUTHOR,
  NO_TOPIC,
  YOUR_BOOKS,
  authorHeading,
  filterByKind,
  formatDuration,
  groupResources,
  kindSummary,
  knownAuthors,
  matchesTitleOrAuthor,
  splitAuthor,
} from "./resourceGrouping";

const r = (id: number, kind: Resource["kind"], title: string, author: string | null, added_at = "2026-01-01"): Resource => ({
  id,
  kind,
  title,
  author,
  file_path: `C:/x/${title}.${kind}`,
  has_text: true,
  added_at,
  bundled: false,
  library_key: null,
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

describe("authors, last name first", () => {
  it("inverts a plain name and keeps initials together", () => {
    expect(authorHeading("John Owen")).toBe("Owen, John");
    expect(authorHeading("C. H. Spurgeon")).toBe("Spurgeon, C. H.");
    expect(authorHeading("Robert Murray M'Cheyne")).toBe("M'Cheyne, Robert Murray");
    expect(authorHeading("Wilhelmus à Brakel")).toBe("à Brakel, Wilhelmus");
    expect(authorHeading("Martin Luther King Jr.")).toBe("King, Martin Luther, Jr.");
  });

  it("leaves single names, inverted names, several people and 'of' names alone", () => {
    expect(authorHeading("Tacitus (tr. Thomas Gordon)")).toBe("Tacitus");
    expect(authorHeading("Owen, John")).toBe("Owen, John");
    expect(authorHeading("Schaff and Wace (eds.)")).toBe("Schaff and Wace");
    expect(authorHeading("Philo of Alexandria (tr. C. D. Yonge)")).toBe("Philo of Alexandria");
    expect(authorHeading("Pliny the Younger")).toBe("Pliny the Younger");
    expect(authorHeading("  ")).toBeNull();
  });

  it("puts an author's edited books under their name, sorted by surname", () => {
    expect(splitAuthor("Philip Schaff (ed.)")).toEqual({ name: "Philip Schaff", role: "ed." });
    const books = [r(1, "epub", "Creeds", "Philip Schaff (ed.)"), r(2, "epub", "History", "Philip Schaff"), r(3, "epub", "Institutes", "John Calvin"), r(4, "epub", "Economy", "Wilhelmus à Brakel")];
    const groups = groupResources(books, "author", new Map());
    expect(groups.map((g) => g.label)).toEqual(["à Brakel, Wilhelmus", "Calvin, John", "Schaff, Philip"]);
    expect(groups[2].items.map((x) => x.id)).toEqual([1, 2]);
  });
});

describe("matchesTitleOrAuthor", () => {
  it("finds every word in the title or author, ignoring case and accents", () => {
    const book = r(1, "epub", "The Bruised Reed", "Richard Sibbes");
    expect(matchesTitleOrAuthor(book, "bruised")).toBe(true);
    expect(matchesTitleOrAuthor(book, "reed sibbes")).toBe(true);
    expect(matchesTitleOrAuthor(book, "smoking flax")).toBe(false);
    expect(matchesTitleOrAuthor(r(2, "epub", "Economy", "Wilhelmus à Brakel"), "a brakel")).toBe(true);
    expect(matchesTitleOrAuthor(book, "  ")).toBe(false);
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

describe("shelves and subjects", () => {
  const shipped = (id: number, title: string, key: string): Resource => ({ ...r(id, "epub", title, "X"), bundled: true, library_key: key });
  const entry = (file_name: string, shelf_id: string, shelf_name: string, shelf_order: number, subject: string): [string, CatalogEntry] => [
    file_name,
    { file_name, shelf_id, shelf_name, shelf_order, subject },
  ];
  const catalog = new Map([
    entry("s10.epub", "library", "Puritan and Reformed", 0, "Sermons"),
    entry("s9.epub", "library", "Puritan and Reformed", 0, "Sermons"),
    entry("inst.epub", "library", "Puritan and Reformed", 0, "Theology"),
    entry("npnf.epub", "fathers", "Church Fathers", 1, "Nicene and Post-Nicene Fathers, series 1"),
    entry("anf.epub", "fathers", "Church Fathers", 1, "Ante-Nicene Fathers"),
  ]);
  const books = [
    shipped(10, "Sermons Volume 10", "s10.epub"),
    shipped(11, "Sermons Volume 9", "s9.epub"),
    shipped(12, "Institutes", "inst.epub"),
    shipped(13, "NPNF1 01", "npnf.epub"),
    shipped(14, "ANF 01", "anf.epub"),
    r(15, "pdf", "My notes on Romans", null),
  ];

  it("by shelf: shelves in order, the Fathers by age, the reader's own last", () => {
    const groups = groupResources(books, "shelf", new Map(), catalog);
    expect(groups.map((g) => `${g.section} / ${g.label}`)).toEqual([
      "Puritan and Reformed / Sermons",
      "Puritan and Reformed / Theology",
      "Church Fathers / Ante-Nicene Fathers",
      "Church Fathers / Nicene and Post-Nicene Fathers, series 1",
      `${YOUR_BOOKS} / ${NO_TOPIC}`,
    ]);
    expect(groups[0].items.map((x) => x.title)).toEqual(["Sermons Volume 9", "Sermons Volume 10"]);
  });

  it("by shelf: the reader's own books under their tags", () => {
    const groups = groupResources(books, "shelf", new Map([[15, ["Romans"]]]), catalog);
    expect(groups[groups.length - 1]).toMatchObject({ section: YOUR_BOOKS, label: "Romans" });
  });

  it("by topic: a shipped book's subject counts as its topic, beside the reader's tags", () => {
    const groups = groupResources(books, "topic", new Map([[12, ["Favourites"]]]), catalog);
    const labels = groups.map((g) => g.label);
    expect(labels).toContain("Sermons");
    expect(groups.find((g) => g.label === "Favourites")!.items.map((x) => x.id)).toEqual([12]);
    expect(groups.find((g) => g.label === "Theology")!.items.map((x) => x.id)).toEqual([12]);
    expect(groups.find((g) => g.label === NO_TOPIC)!.items.map((x) => x.id)).toEqual([15]);
  });
});
