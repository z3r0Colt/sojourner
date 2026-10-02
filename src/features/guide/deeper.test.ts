import { describe, expect, it } from "vitest";
import { lessonById, lessonForQuestion, sectionId, wscQuestion, type GuideState } from "./course";
import { FURTHER_READING, classPlan, fisherQuestion, keyVerse, lessonReadings, openingQuestion, originalLanguage, parallelPlace, teachItManuscript } from "./deeper";
import { notebookEntries } from "./GuidePrint";
import { LESSONS } from "./lessons";
import type { Note, PrayerEntry } from "../../api/types";

const wsc33 = lessonById("wsc-33")!;

describe("go deeper", () => {
  it("names further reading only for lessons that exist", () => {
    for (const id of Object.keys(FURTHER_READING)) expect(lessonById(id), id).toBeDefined();
  });

  it("reads the verse the lesson keeps, in its own language", () => {
    expect(keyVerse(wsc33)).toEqual({ book: 45, chapter: 3, verse: 28 });
    expect(originalLanguage(keyVerse(wsc33))).toBe("Greek");
    expect(originalLanguage({ book: 19, chapter: 32 })).toBe("Hebrew");
  });

  it("asks Fisher about a question he answers", () => {
    expect(fisherQuestion(lessonById("wsc-45")!)).toBe(46);
    expect(fisherQuestion(wsc33)).toBe(33);
  });

  it("opens a parallel at its question or paragraph", () => {
    expect(parallelPlace("wlc", "70")).toEqual({ doc: "wlc", n: 70 });
    expect(parallelPlace("wcf", "11")).toEqual({ doc: "wcf", n: 11 });
    expect(parallelPlace("wcf", "11.2")).toEqual({ doc: "wcf", n: 11, section: 2 });
    expect(parallelPlace("heidelberg", "60")).toBeNull();
  });

  it("makes a teaching outline with the answer, the passages and discussion questions", () => {
    const { title, body } = teachItManuscript({
      lesson: wsc33,
      answers: [{ n: 33, prompt: "What is justification?", body: "Justification is an act of God’s free grace…" }],
      parallels: ["WLC 70", "WCF 11"],
    });
    expect(title).toBe("Catechism lesson: Justification (Q33)");
    expect(body).toContain("<h2>Discussion questions</h2>");
    expect(body).toContain("Is justification an act or a work?");
    expect(body).toContain('data-type="passage" data-book-id="45" data-chapter="3" data-verse-start="21" data-verse-end="28"');
    expect(body).toContain("WLC 70; WCF 11.");
    expect(lessonReadings(wsc33)).toHaveLength(1);
  });
});

describe("leading a class", () => {
  it("times the class steps and leaves the rest for home", () => {
    const { rows, total } = classPlan(wsc33);
    expect(rows.find((r) => r.step.id === "classic")?.minutes).toBeNull();
    expect(rows.find((r) => r.step.id === "check")?.minutes).toBe(15);
    expect(total).toBeGreaterThan(30);
    expect(total).toBeLessThan(120);
  });

  it("gives every lesson a class of a sensible length", () => {
    for (const l of LESSONS) {
      const { total } = classPlan(l);
      expect(total, l.id).toBeGreaterThan(10);
      expect(total, l.id).toBeLessThanOrEqual(120);
    }
  });
});

describe("family worship", () => {
  it("finds the lesson that teaches a question", () => {
    expect(lessonForQuestion(33)?.id).toBe("wsc-33");
    expect(lessonForQuestion(46)?.id).toBe("wsc-45");
    expect(wscQuestion(sectionId("wsc", 107))).toBe(107);
    expect(wscQuestion(sectionId("wlc", 1))).toBeNull();
  });
});

describe("the notebook", () => {
  const note = (id: number, chapter: number, verse: number, created_at: string): Note => ({
    id,
    book_id: 45,
    chapter,
    verse_start: verse,
    verse_end: verse,
    body: "<p>mine</p>",
    highlight_id: null,
    created_at,
    updated_at: created_at,
    deleted_at: null,
  });
  const prayer = (id: number, created_at: string): PrayerEntry => ({
    id,
    entry_date: created_at.slice(0, 10),
    mode: "free",
    adoration: null,
    confession: null,
    thanksgiving: null,
    supplication: null,
    free_text: "Lord…",
    book_id: null,
    chapter: null,
    verse_start: null,
    verse_end: null,
    created_at,
    updated_at: created_at,
    deleted_at: null,
  });
  const state: GuideState = {
    lessons: {
      "wsc-33": { startedAt: "2026-10-01T10:00:00Z", completedAt: "2026-10-01T12:00:00Z", done: {}, answers: { before: "By trying hard" }, quiz: {} },
    },
  };

  it("gathers tagged work, and untagged work written in the lesson's place while it was open", () => {
    const notes = [
      note(1, 3, 28, "2026-10-01T11:00:00Z"), // in the passage, during the lesson
      note(2, 3, 28, "2026-10-02T11:00:00Z"), // in the passage, after it
      note(3, 8, 1, "2026-09-01T11:00:00Z"), // elsewhere, but tagged
      note(4, 8, 1, "2026-10-01T11:00:00Z"), // elsewhere, untagged
      note(5, 3, 28, "2026-10-01T11:00:00Z"), // tagged with another lesson
    ];
    const prayers = [prayer(1, "2026-10-01T11:30:00Z"), prayer(2, "2026-10-05T11:30:00Z")];
    const [entry, ...rest] = notebookEntries(state, notes, [[3, "wsc-33"], [5, "wsc-34"]], prayers, [], LESSONS);
    expect(rest).toHaveLength(0);
    expect(entry.lesson.id).toBe("wsc-33");
    expect(entry.notes.map((n) => n.id).sort()).toEqual([1, 3]);
    expect(entry.prayers.map((p) => p.id)).toEqual([1]);
  });
});

describe("the opening question", () => {
  it("is the question alone, for a class", () => {
    expect(openingQuestion(wsc33)).toBe("In a sentence or two: how can a guilty person be right with God?");
    for (const l of LESSONS.filter((l) => !l.review)) expect(openingQuestion(l), l.id).toMatch(/\S/);
  });
});
