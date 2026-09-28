import { describe, expect, it } from "vitest";
import { findPassages, fitAtWord, labelParts, passagePreview } from "./jumpList";

describe("passagePreview", () => {
  it("shows a short passage whole", () => {
    expect(passagePreview("Jesus wept.")).toBe("Jesus wept.");
  });

  it("makes the spacing plain", () => {
    expect(passagePreview("  In the\n\tbeginning  ")).toBe("In the beginning");
  });

  it("cuts a long passage at a word, with an ellipsis", () => {
    const text =
      "Of Justification. Those whom God effectually calleth, he also freely justifieth; not by infusing righteousness into them.";
    const preview = passagePreview(text, 60);
    expect(preview.endsWith("…")).toBe(true);
    expect(preview.length).toBeLessThanOrEqual(61);
    // Cut between words, and the trailing comma or stop left behind goes too.
    expect(text.startsWith(preview.slice(0, -1))).toBe(true);
    expect(preview).toBe("Of Justification. Those whom God effectually calleth, he…");
  });

  it("cuts a single long word where it stands", () => {
    const preview = passagePreview("x".repeat(200), 80);
    expect(preview).toBe(`${"x".repeat(80)}…`);
  });
});

describe("findPassages", () => {
  const segments = [
    { id: "a", text: "In the beginning was the Word.", label: "Chapter 1" },
    { id: "b", text: "And the Word was made flesh, and dwelt among us." },
    { id: "c", text: "No man hath seen God at any time.", label: "v.18" },
  ];

  it("shows everything when there is no query", () => {
    expect(findPassages(segments, "")).toBeNull();
    expect(findPassages(segments, "   ")).toBeNull();
  });

  it("finds words in the text, ignoring case", () => {
    expect(findPassages(segments, "the word")).toEqual([0, 1]);
    expect(findPassages(segments, "FLESH")).toEqual([1]);
  });

  it("finds a label", () => {
    expect(findPassages(segments, "chapter 1")).toEqual([0]);
    expect(findPassages(segments, "v.18")).toEqual([2]);
  });

  it("does not care how the spaces fall", () => {
    expect(findPassages(segments, "made   flesh")).toEqual([1]);
    expect(findPassages([{ id: 1, text: "made\n flesh" }], "made flesh")).toEqual([0]);
  });

  it("treats the query as words, not a pattern", () => {
    expect(findPassages(segments, "(")).toEqual([]);
    expect(findPassages(segments, "v.1*")).toEqual([]);
  });
});

describe("labelParts", () => {
  it("keeps the place in a book's label apart from its name", () => {
    expect(labelParts("Sermon II. Sinners in the Hands of an angry God, paragraph 11")).toEqual({
      name: "Sermon II. Sinners in the Hands of an angry God",
      place: ", paragraph 11",
    });
  });

  it("leaves a label with no short tail whole", () => {
    expect(labelParts("p. 12")).toEqual({ name: "p. 12", place: "" });
    expect(labelParts("v. 1")).toEqual({ name: "v. 1", place: "" });
    // A comma inside a long title is not a place.
    expect(labelParts("Of God, and of the Holy Trinity, as the Scriptures teach it").place).toBe("");
  });
});

describe("fitAtWord", () => {
  // One unit a character, as if every letter were the same width.
  const measure = (text: string) => text.length;
  const name = "Sermon II. Sinners in the Hands of an angry God";

  it("leaves a name that fits whole", () => {
    expect(fitAtWord(name, name.length, measure)).toBe(name);
  });

  it("cuts after a whole word, with an ellipsis, never through one", () => {
    // The browser's own ellipsis gave "…of an an…" here.
    expect(fitAtWord(name, 41, measure)).toBe("Sermon II. Sinners in the Hands of an…");
    expect(fitAtWord(name, 36, measure)).toBe("Sermon II. Sinners in the Hands of…");
    // Punctuation before the cut goes: "Sermon II…", not "Sermon II.…".
    expect(fitAtWord(name, 12, measure)).toBe("Sermon II…");
  });

  it("falls back on the first word when nothing shorter fits", () => {
    expect(fitAtWord(name, 3, measure)).toBe("Sermon…");
    expect(fitAtWord("Supercalifragilistic", 5, measure)).toBe("Supercalifragilistic");
  });
});
