import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseHenry, sectionId, type Check } from "./course";
import { LESSONS } from "./lessons";

const REFERENCE = join(__dirname, "../../../reference/westminster_commentary");
const henry: { chapters: number[]; text: string }[] = JSON.parse(readFileSync(join(REFERENCE, "henry.json"), "utf8"));

function henryOn(question: number) {
  return henry.filter((e) => e.chapters.includes(question)).flatMap((e) => parseHenry(e.text));
}

function quizzes(): { lesson: string; check: Extract<Check, { type: "quiz" }> }[] {
  return LESSONS.flatMap((l) => l.steps.flatMap((s) => (s.check?.type === "quiz" ? [{ lesson: l.id, check: s.check }] : [])));
}

describe("the lessons as written", () => {
  it("name only questions Henry asks, in his words", () => {
    for (const { lesson, check } of quizzes())
      for (const a of check.henry ?? [])
        expect(henryOn(a.question).map((h) => h.ask), `${lesson}: Henry on Q${a.question}`).toContain(a.ask);
  });

  it("parse Henry's questions with their answers", () => {
    const q1 = henryOn(1);
    expect(q1.find((h) => h.ask === "Is he his own end?")).toEqual({
      ask: "Is he his own end?",
      yes: false,
      answer: "No: For none of us lives to himself, or dies to himself, Romans 14:7.",
    });
    expect(henry.flatMap((e) => parseHenry(e.text)).length).toBeGreaterThan(2500);
  });

  it("give every lesson a before step (a review reads them), except reviews", () => {
    for (const l of LESSONS) if (!l.review) expect(l.steps.map((s) => s.id), l.id).toContain("before");
  });

  it("teach every Shorter Catechism question exactly once", () => {
    const taught = LESSONS.filter((l) => !l.review).flatMap((l) => l.questions);
    expect([...taught].sort((a, b) => a - b)).toEqual(Array.from({ length: 107 }, (_, i) => i + 1));
  });

  // `DUMP_LESSONS=path npx vitest run lessons.test` writes the lessons, with
  // the section ids their steps open, for tools/check-guide-lessons.py.
  it.runIf(!!process.env.DUMP_LESSONS)("dump", () => {
    const withIds = LESSONS.map((l) => ({
      ...l,
      steps: l.steps.map((s) =>
        s.open?.pane === "westminster" ? { ...s, open: { ...s.open, sectionId: sectionId(s.open.doc, s.open.n, s.open.section) } } : s,
      ),
    }));
    writeFileSync(process.env.DUMP_LESSONS!, JSON.stringify(withIds, null, 1));
  });
});
