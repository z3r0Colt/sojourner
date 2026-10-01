import { describe, expect, it } from "vitest";
import {
  EMPTY_GUIDE,
  UNITS,
  lessonById,
  markDone,
  nextLesson,
  overlaps,
  scoreQuiz,
  sectionId,
  stepsDone,
  unmarkDone,
  withLesson,
  type Lesson,
} from "./course";
import { LESSONS } from "./lessons";
import { parseRoute, routeFor } from "../../workspace/paneKinds";

const NOW = "2026-10-01T12:00:00.000Z";

describe("section ids", () => {
  // The ids content.db pins (import/reference/westminster.rs).
  it("matches the pinned ranges", () => {
    expect(sectionId("wsc", 1)).toBe(369);
    expect(sectionId("wsc", 107)).toBe(475);
    expect(sectionId("wlc", 1)).toBe(173);
    expect(sectionId("wlc", 196)).toBe(368);
    expect(sectionId("wcf", 1, 1)).toBe(1);
    expect(sectionId("wcf", 11, 1)).toBe(60);
    expect(sectionId("wcf", 33, 3)).toBe(172);
    expect(sectionId("heidelberg", 60)).toBe(577);
    expect(sectionId("belgic", 23)).toBe(503);
  });
});

describe("the lessons", () => {
  it("have unique ids and unique step ids, and every lesson is in a unit", () => {
    expect(new Set(LESSONS.map((l) => l.id)).size).toBe(LESSONS.length);
    for (const l of LESSONS) expect(new Set(l.steps.map((s) => s.id)).size).toBe(l.steps.length);
    expect(UNITS.flatMap((u) => u.lessons).map((l) => l.id)).toEqual(LESSONS.map((l) => l.id));
  });

  it("are numbered in course order", () => {
    expect(LESSONS.map((l) => l.number)).toEqual(LESSONS.map((_, i) => i + 1));
    expect(lessonById("wsc-33")?.title).toBe("Justification");
  });

  it("have quiz answers among their choices", () => {
    for (const l of LESSONS)
      for (const s of l.steps)
        if (s.check?.type === "quiz") for (const q of s.check.questions) expect(q.choices[q.answer]).toBeDefined();
  });
});

describe("progress", () => {
  const lesson = (n: number): Lesson => ({ ...LESSONS[0], id: `l${n}`, number: n, questions: [n] });

  it("starts a lesson on first change and marks steps", () => {
    let s = withLesson(EMPTY_GUIDE, "l1", NOW, (p) => markDone(p, "a", NOW));
    expect(s.current).toBe("l1");
    expect(s.lessons.l1.startedAt).toBe(NOW);
    expect(s.lessons.l1.done).toEqual({ a: NOW });
    s = withLesson(s, "l1", "later", (p) => markDone(p, "a", "later"));
    expect(s.lessons.l1.done.a).toBe(NOW);
    s = withLesson(s, "l1", "later", (p) => unmarkDone(p, "a"));
    expect(s.lessons.l1.done).toEqual({});
  });

  it("counts only steps that are not optional", () => {
    const l = LESSONS[0];
    const all = Object.fromEntries(l.steps.map((s) => [s.id, NOW]));
    const counted = l.steps.filter((s) => !s.optional).length;
    expect(stepsDone(l, undefined)).toEqual({ done: 0, of: counted });
    expect(stepsDone(l, { startedAt: NOW, done: all, answers: {}, quiz: {} })).toEqual({ done: counted, of: counted });
  });

  it("continues the current lesson, else the first unfinished", () => {
    const ls = [lesson(1), lesson(2), lesson(3)];
    expect(nextLesson(EMPTY_GUIDE, ls)?.id).toBe("l1");
    const p = { startedAt: NOW, done: {}, answers: {}, quiz: {} };
    expect(nextLesson({ current: "l2", lessons: { l2: p } }, ls)?.id).toBe("l2");
    expect(nextLesson({ current: "l2", lessons: { l1: { ...p, completedAt: NOW }, l2: { ...p, completedAt: NOW } } }, ls)?.id).toBe("l3");
  });

  it("scores a quiz", () => {
    const qs = [
      { q: "a", choices: ["x", "y"], answer: 1 },
      { q: "b", choices: ["x", "y"], answer: 0 },
    ];
    expect(scoreQuiz(qs, [1, 1])).toEqual({ picks: [1, 1], score: 1, of: 2 });
  });
});

describe("overlaps", () => {
  const rom3 = { book: 45, chapter: 3, verse: 21, to: 28 };
  it("finds a range touching the passage", () => {
    expect(overlaps(rom3, 45, 3, 24, 24)).toBe(true);
    expect(overlaps(rom3, 45, 3, 18, 21)).toBe(true);
    expect(overlaps(rom3, 45, 3, 29, 31)).toBe(false);
    expect(overlaps(rom3, 45, 4, 24, 24)).toBe(false);
    expect(overlaps({ book: 45, chapter: 3 }, 45, 3, 1, 1)).toBe(true);
  });
});

describe("routes", () => {
  it("round-trips the guide", () => {
    expect(routeFor({ kind: "guide", params: { lessonId: "wsc-33" } })).toBe("/guide/wsc-33");
    expect(parseRoute("/guide/wsc-33")).toEqual({ kind: "guide", params: { lessonId: "wsc-33" } });
    expect(parseRoute("/guide")).toEqual({ kind: "guide", params: { lessonId: null } });
  });
});
