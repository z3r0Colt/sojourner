import { beforeEach, describe, expect, it } from "vitest";
import { verseTextLength, verseTextOffset } from "./domOffsets";

/** Romans 8:22 (ASV) as VerseRow draws it: plain runs, a footnote marker
 * before "together", red letters and a highlight as words of their own. */
const VERSE = "For we know that the whole creation groaneth and travaileth in pain together until now.";

function drawVerse(): HTMLElement {
  document.body.innerHTML = `<span data-verse-text="22"><span>For we know that the whole creation groaneth and travaileth in pain </span><sup class="ml-0.5 cursor-pointer select-none">[a]</sup><mark class="highlight">together</mark><span class="text-red-700"> until now.</span></span>`;
  return document.querySelector("[data-verse-text]") as HTMLElement;
}

describe("verseTextOffset", () => {
  let verse: HTMLElement;
  beforeEach(() => {
    verse = drawVerse();
  });

  it("counts the words before a marker as they are", () => {
    const first = verse.firstChild!.firstChild!;
    expect(verseTextOffset(verse, first, 4)).toBe(4);
  });

  it("leaves a footnote marker out of a place after it", () => {
    // "ogether until": one letter into the word after the marker.
    const together = verse.querySelector("mark")!.firstChild!;
    const start = verseTextOffset(verse, together, 1);
    const until = verse.querySelector(".text-red-700")!.firstChild!;
    const end = verseTextOffset(verse, until, 6);
    expect(VERSE.slice(start, end)).toBe("ogether until");
  });

  it("puts a place inside the marker just before it", () => {
    const marker = verse.querySelector("sup")!.firstChild!;
    expect(verseTextOffset(verse, marker, 2)).toBe(VERSE.indexOf("together"));
  });

  it("takes an element and child index as a range may give", () => {
    // After the second child (the marker) of the verse: the start of "together".
    expect(verseTextOffset(verse, verse, 2)).toBe(VERSE.indexOf("together"));
    expect(verseTextOffset(verse, verse, verse.childNodes.length)).toBe(VERSE.length);
  });

  it("measures the verse's words without the marker", () => {
    expect(verseTextLength(verse)).toBe(VERSE.length);
  });
});
