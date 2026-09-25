import { describe, expect, it } from "vitest";
import { daysPractised, planItem, reviewDays, MEMORY_SETS } from "./memorySets";
import { askWhere, memoryWords, referenceMatches } from "./memoryText";
import { afterGathering, memoryHint, type FamilyWorship } from "../family/familyWorship";
import { defaultMemoryVerse } from "../sermons/SeriesMemory";
import type { Book, Sermon } from "../../api/types";

describe("planItem", () => {
  it("learns a verse or three as one card, and four or more a part at a time", () => {
    expect(planItem(45, 8, 28, 28).kind).toBe("card");
    expect(planItem(20, 3, 5, 7).kind).toBe("card");
    expect(planItem(19, 23, 1, 6).kind).toBe("passage");
  });

  it("does as it is told, but never makes a passage of a single part", () => {
    expect(planItem(19, 23, 1, 6, false).kind).toBe("card");
    expect(planItem(45, 10, 9, 10, true, 1).kind).toBe("passage");
    expect(planItem(43, 3, 16, 16, true).kind).toBe("card");
    // Two verses "two at a time" would be one part, never finished.
    expect(planItem(50, 4, 6, 7, true, 2).kind).toBe("card");
    expect(planItem(20, 3, 5, 7, true, 4).kind).toBe("card");
  });
});

describe("the review calendar", () => {
  it("counts distinct days in the last thirty, not reviews", () => {
    const log = ["2026-09-25", "2026-09-25", "2026-09-24", "2026-08-01"];
    expect(daysPractised(log, 30, "2026-09-25")).toBe(2);
  });

  it("puts a review on the reader's own calendar day", () => {
    const at = new Date(2026, 8, 25, 23, 30); // late evening, local time
    expect(reviewDays([at.toISOString()])).toEqual(["2026-09-25"]);
  });
});

describe("asking where a verse is", () => {
  it("alternates, and only for a card that asks", () => {
    expect(askWhere({ ask_reference: true, repetitions: 0 })).toBe(false);
    expect(askWhere({ ask_reference: true, repetitions: 1 })).toBe(true);
    expect(askWhere({ ask_reference: false, repetitions: 1 })).toBe(false);
  });

  it("wants book, chapter and the first verse", () => {
    const card = { book_id: 43, chapter: 3, verse_start: 16 };
    expect(referenceMatches({ bookId: 43, chapter: 3, verse: 16 }, card)).toBe(true);
    expect(referenceMatches({ bookId: 43, chapter: 3 }, card)).toBe(false);
    expect(referenceMatches({ bookId: 43, chapter: 4, verse: 16 }, card)).toBe(false);
    expect(referenceMatches(null, card)).toBe(false);
  });
});

describe("the family's memory verse", () => {
  it("hides more as the gatherings go by", () => {
    expect([0, 1, 2, 3, 4, 9].map(memoryHint)).toEqual(["full", "full", "blank-word", "blank-word", "first-letter", "first-letter"]);
  });

  it("counts a gathering, and leaves a setup without one alone", () => {
    const base: FamilyWorship = { plan: null, psalm: null, singing: false, catechism: null, prayerCategory: null, starter: false, started: "2026-09-01" };
    const withVerse = { ...base, memory: { bookId: 19, chapter: 119, verseStart: 105, verseEnd: 105, since: "2026-09-20", times: 1 } };
    expect(afterGathering(withVerse, {}).memory?.times).toBe(2);
    expect(afterGathering(base, {}).memory ?? null).toBeNull();
  });
});

describe("a series' memory verses", () => {
  const books = [{ id: 45, name: "Romans" }] as Book[];
  const sermon = (verse_start: number | null, verse_end: number | null) =>
    ({ passages: [{ role: "text", book_id: 45, chapter: 8, verse_start, verse_end }] }) as unknown as Sermon;

  it("takes a short text whole, and a long one's first verse", () => {
    expect(defaultMemoryVerse(sermon(28, 30), books)).toBe("Romans 8:28-30");
    expect(defaultMemoryVerse(sermon(1, 17), books)).toBe("Romans 8:1");
    expect(defaultMemoryVerse(sermon(null, null), books)).toBe("Romans 8:1");
  });
});

describe("the ready-made sets", () => {
  it("have distinct names and something in each", () => {
    expect(new Set(MEMORY_SETS.map((s) => s.name)).size).toBe(MEMORY_SETS.length);
    for (const s of MEMORY_SETS) expect(s.refs.length).toBeGreaterThan(0);
  });
});


describe("memoryWords", () => {
  it("leaves out what is not learned by heart", () => {
    expect(memoryWords("NUN. Thy word is a lamp unto my feet, and a light unto my path.")).toBe("Thy word is a lamp unto my feet, and a light unto my path.");
    expect(memoryWords("«A Psalm of David.» The LORD [is] my shepherd; I shall not want.")).toBe("The LORD is my shepherd; I shall not want.");
    expect(memoryWords("[Nun.] A lamp to my foot [is] Thy word")).toBe("A lamp to my foot is Thy word");
    expect(memoryWords("Hear, O Israel")).toBe("Hear, O Israel");
    expect(memoryWords("He. is not a heading")).toBe("He. is not a heading");
  });
});
