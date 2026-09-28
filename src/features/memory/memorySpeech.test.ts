import { describe, expect, it } from "vitest";
import { cardVerses, listenOffered, memoryCardKey, memorySegments, readingGivesAway, verseBeingRead } from "./memorySpeech";

const JOHN_3 = [
  { verse: 15, text: "That whosoever believeth in him should not perish, but have eternal life." },
  { verse: 16, text: "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life." },
  { verse: 17, text: "For God sent not his Son into the world to condemn the world; but that the world through him might be saved." },
  { verse: 18, text: "He that believeth on him is not condemned." },
];

describe("cardVerses", () => {
  it("takes the card's verses and nothing either side", () => {
    expect(cardVerses(JOHN_3, 16, 17).map((v) => v.verse)).toEqual([16, 17]);
  });

  it("gives the words as they are learned", () => {
    const psalm = [{ verse: 1, text: "«A Psalm of David.» The LORD [is] my shepherd; I shall not want." }];
    expect(cardVerses(psalm, 1, 1)).toEqual([{ verse: 1, text: "The LORD is my shepherd; I shall not want." }]);
  });

  it("is empty while the chapter loads", () => {
    expect(cardVerses(undefined, 16, 17)).toEqual([]);
  });
});

describe("memorySegments", () => {
  const verses = cardVerses(JOHN_3, 16, 17);

  it("says the reference first, then a segment for each verse", () => {
    const segments = memorySegments({ key: "memory-7", reference: "John 3:16-17", verses, askWhere: false });
    expect(segments.map((s) => s.id)).toEqual(["memory-7:ref", "memory-7:v16", "memory-7:v17"]);
    expect(segments.map((s) => s.label)).toEqual(["John 3:16-17", "v. 16", "v. 17"]);
    expect(segments[0].text).toBe("John 3:16-17.");
    expect(segments[1].text).toBe(JOHN_3[1].text);
  });

  it("never says or shows the reference on a card asking where the verse is", () => {
    const segments = memorySegments({ key: "memory-7", reference: "John 3:16-17", verses, askWhere: true });
    expect(segments.map((s) => s.id)).toEqual(["memory-7:v16", "memory-7:v17"]);
    for (const s of segments) {
      expect(s.text).not.toContain("John");
      expect(s.text).not.toMatch(/3:16/);
      // A verse number on the player is half the answer.
      expect(s.label).toBeUndefined();
    }
  });

  it("cuts a long verse into pieces, each within the limit and all labelled with the verse", () => {
    const long = { verse: 9, text: `${"Then were the king's scribes called at that time in the third month, that is, the month Sivan. ".repeat(6)}` };
    const segments = memorySegments({ key: "memory-1", reference: "Esther 8:9", verses: [long], askWhere: false });
    const pieces = segments.slice(1);
    expect(pieces.length).toBeGreaterThan(1);
    expect(pieces.every((s) => s.text.length <= 400)).toBe(true);
    expect(pieces.every((s) => s.label === "v. 9")).toBe(true);
    expect(pieces.map((s) => s.id)).toEqual(pieces.map((_, k) => `memory-1:v9.${k + 1}`));
  });

  it("labels verses however the caller asks", () => {
    const segments = memorySegments({ key: "m", reference: "John 3:16", verses: verses.slice(0, 1), askWhere: false, verseLabel: (v) => `John 3:${v}` });
    expect(segments[1].label).toBe("John 3:16");
  });

  it("has nothing to say for a card whose words are not loaded, not even the reference", () => {
    expect(memorySegments({ key: "m", reference: "John 3:16", verses: [], askWhere: false })).toEqual([]);
  });
});

describe("listenOffered", () => {
  it("waits for the answer on a card asking for the words", () => {
    expect(listenOffered({ askWhere: false, answerShowing: false })).toBe(false);
    expect(listenOffered({ askWhere: false, answerShowing: true })).toBe(true);
  });

  it("is there from the start on a card asking where", () => {
    expect(listenOffered({ askWhere: true, answerShowing: false })).toBe(true);
    expect(listenOffered({ askWhere: true, answerShowing: true })).toBe(true);
  });
});

describe("readingGivesAway", () => {
  const verses = cardVerses(JOHN_3, 16, 17);
  const key = memoryCardKey(7);
  const own = memorySegments({ key, reference: "John 3:16-17", verses, askWhere: false });
  const ownAskedWhere = memorySegments({ key, reference: "John 3:16-17", verses, askWhere: true });
  // "Listen to what's due": several cards, each its reference and words.
  const due = [
    ...memorySegments({ key: memoryCardKey(3), reference: "Psalm 23:1", verses: [{ verse: 1, text: "The LORD is my shepherd; I shall not want." }], askWhere: false }),
    ...own,
  ];

  it("catches a card's own words still being read over its hidden answer", () => {
    // Revealed, Listen pressed, graded, then Backspace: back with the answer hidden.
    expect(readingGivesAway(own, { key, askWhere: false, answerShowing: false })).toBe(true);
    expect(readingGivesAway(due, { key, askWhere: false, answerShowing: false })).toBe(true);
  });

  it("lets the reading be once the answer is showing", () => {
    expect(readingGivesAway(own, { key, askWhere: false, answerShowing: true })).toBe(false);
    expect(readingGivesAway(due, { key, askWhere: true, answerShowing: true })).toBe(false);
  });

  it("minds only the reference on a card asking where", () => {
    // Its own Listen is the words alone, which is how the card is practised.
    expect(readingGivesAway(ownAskedWhere, { key, askWhere: true, answerShowing: false })).toBe(false);
    // "Listen to what's due" says the reference before the words.
    expect(readingGivesAway(due, { key, askWhere: true, answerShowing: false })).toBe(true);
  });

  it("leaves other cards' readings, and other readings, alone", () => {
    const other = memorySegments({ key: memoryCardKey(12), reference: "Romans 8:28", verses: [{ verse: 28, text: "And we know that all things work together for good." }], askWhere: false });
    // Card 1 is not card 12.
    expect(readingGivesAway(other, { key: memoryCardKey(1), askWhere: false, answerShowing: false })).toBe(false);
    expect(readingGivesAway(other, { key, askWhere: false, answerShowing: false })).toBe(false);
    // A chapter in the Bible pane: verse numbers for ids.
    expect(readingGivesAway([{ id: 16, text: JOHN_3[1].text }], { key, askWhere: false, answerShowing: false })).toBe(false);
    expect(readingGivesAway([], { key, askWhere: false, answerShowing: false })).toBe(false);
  });
});

describe("verseBeingRead", () => {
  it("names the verse of this card a passage is from", () => {
    expect(verseBeingRead("memory-12:v16", "memory-12")).toBe(16);
    expect(verseBeingRead("memory-12:v16.2", "memory-12")).toBe(16);
    expect(verseBeingRead("memory-12:ref", "memory-12")).toBeNull();
    // Card 1 is not card 12.
    expect(verseBeingRead("memory-12:v16", "memory-1")).toBeNull();
    expect(verseBeingRead(16, "memory-12")).toBeNull();
    expect(verseBeingRead(undefined, "memory-12")).toBeNull();
  });
});
