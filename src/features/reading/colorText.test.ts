import { describe, expect, it } from "vitest";
import { buildTokens } from "./verseTokens";
import { colorSpansByVerse, coloredHtml, sliceSpans } from "./colorText";
import { formatPassageHtml } from "../../lib/clipboard";
import type { ColorSpan, Highlight } from "../../api/types";

const text = "In the beginning God created the heaven and the earth.";
const span = (word: string, code: string, verse = 1): ColorSpan => {
  const start = text.indexOf(word);
  return { verse, start, end: start + word.length, code, term: word.toLowerCase() };
};

describe("color text", () => {
  it("tags the colored words and leaves the rest plain", () => {
    const tokens = buildTokens(text, [], 1, [], [], [], [span("beginning", "T2"), span("God", "GF")]);
    const tagged = tokens.flatMap((t) => (t.kind === "text" && t.segment.tag ? [[t.segment.text, t.segment.tag.code]] : []));
    expect(tagged).toEqual([
      ["beginning", "T2"],
      ["God", "GF"],
    ]);
    expect(tokens.map((t) => (t.kind === "text" ? t.segment.text : "")).join("")).toBe(text);
  });

  it("keeps a word's color on both sides of a highlight's edge", () => {
    const highlight = { id: 1, verse_start: 1, verse_end: 1, char_start: 0, char_end: text.indexOf("God") + 1, color: "#fef08a" } as Highlight;
    const tokens = buildTokens(text, [highlight], 1, [], [], [], [span("God", "GF")]);
    const pieces = tokens.flatMap((t) => (t.kind === "text" && t.segment.tag ? [[t.segment.text, t.segment.highlightId]] : []));
    expect(pieces).toEqual([
      ["G", 1],
      ["od", null],
    ]);
  });

  it("drops the families turned off", () => {
    const byVerse = colorSpansByVerse([span("beginning", "T2"), span("God", "GF"), span("earth", "L1", 2)], ["time"]);
    expect(byVerse?.get(1)?.map((s) => s.code)).toEqual(["GF"]);
    expect(byVerse?.get(2)?.map((s) => s.code)).toEqual(["L1"]);
  });

  it("copies with the colors, as HTML a document keeps", () => {
    const html = coloredHtml("God & the earth", [{ verse: 1, start: 0, end: 3, code: "GF", term: "god" }]);
    expect(html).toBe('<span style="color:#7a36bf">God</span> &amp; the earth');
    expect(formatPassageHtml(html, "Genesis 1:1", "text-ref")).toBe(`${html} (Genesis 1:1)`);
  });

  it("cuts a verse's colors to a selection", () => {
    const spans = [span("beginning", "T2"), span("God", "GF"), span("earth", "L1")];
    const from = text.indexOf("God");
    const to = text.indexOf("heaven");
    const cut = sliceSpans(spans, from, to);
    expect(cut).toEqual([{ ...spans[1], start: 0, end: 3 }]);
    expect(coloredHtml(text.slice(from, to), cut)).toContain('<span style="color:#7a36bf">God</span> created the ');
  });
});
