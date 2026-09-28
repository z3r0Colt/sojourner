import { describe, expect, it } from "vitest";
import {
  DEFAULT_TALK_QUESTIONS,
  MAX_TALK_QUESTIONS,
  MAX_TALK_QUESTION_LENGTH,
  STARTER_PLAN,
  STARTER_TITLES,
  addTalkQuestion,
  afterGathering,
  catechismFinished,
  catechismPlan,
  cleanTalkQuestions,
  customState,
  editTalkQuestion,
  guessPrayerCategory,
  insertTalkQuestion,
  hasOwnTalkQuestions,
  logSummary,
  logWeeks,
  moveTalkQuestion,
  nextPsalm,
  planFinished,
  psalmWeekDue,
  removeTalkQuestion,
  repeatedTalkQuestion,
  starterPsalm,
  starterState,
  talkQuestionTag,
  talkQuestions,
  upcomingDays,
  upcomingQuestions,
  withTalkQuestions,
  type FamilyWorship,
} from "./familyWorship";

describe("the first four weeks", () => {
  it("has a title for each of its 28 readings", () => {
    expect(STARTER_TITLES).toHaveLength(28);
  });

  it("sings a new psalm every seven gatherings", () => {
    expect([1, 7, 8, 14, 15, 22, 28, 40].map(starterPsalm)).toEqual([100, 100, 23, 23, 117, 1, 1, 1]);
  });

  it("moves the psalm on with the reading, and leaves the starter after day 28", () => {
    let s = starterState("cyc", null, "2026-09-01");
    for (let i = 0; i < 7; i++) s = afterGathering(s, { lengthDays: 28, catechismTotal: 145, today: "2026-09-08" });
    expect(s.plan).toEqual({ code: STARTER_PLAN, nextDay: 8 });
    expect(s.psalm).toEqual({ number: 23, since: "2026-09-08" });
    for (let i = 0; i < 21; i++) s = afterGathering(s, { lengthDays: 28, catechismTotal: 145, today: "2026-09-30" });
    expect(s.plan?.nextDay).toBe(29);
    expect(planFinished(s, 28)).toBe(true);
    expect(s.starter).toBe(false);
    // A finished plan stays finished until the family chooses another.
    expect(afterGathering(s, { lengthDays: 28 }).plan?.nextDay).toBe(29);
  });

  it("learns a new question every other time", () => {
    let s = starterState("cyc", null);
    const seen: number[] = [];
    for (let i = 0; i < 6; i++) {
      seen.push(s.catechism!.current);
      s = afterGathering(s, { catechismTotal: 145 });
    }
    expect(seen).toEqual([0, 0, 1, 1, 2, 2]);
  });

  it("keeps a custom setup off the starter's psalm schedule", () => {
    let s = customState(null, "2026-09-01");
    s = { ...s, psalm: { number: 46, since: "2026-09-01" } };
    for (let i = 0; i < 10; i++) s = afterGathering(s, { lengthDays: 28 });
    expect(s.psalm?.number).toBe(46);
  });
});

describe("the catechism", () => {
  it("goes over the two questions before, and one further back", () => {
    expect(catechismPlan({ code: "cyc", current: 0, pace: 1, timesOnCurrent: 0 }, 145, 0)).toEqual({ learning: 0, review: [] });
    expect(catechismPlan({ code: "cyc", current: 2, pace: 1, timesOnCurrent: 0 }, 145, 0)).toEqual({ learning: 2, review: [0, 1] });
    const later = catechismPlan({ code: "cyc", current: 20, pace: 1, timesOnCurrent: 0 }, 145, 3);
    expect(later.learning).toBe(20);
    expect(later.review).toContain(18);
    expect(later.review).toContain(19);
    expect(later.review.every((n) => n < 20)).toBe(true);
    expect(later.review).toHaveLength(3);
  });

  it("stops at the last question and says so", () => {
    const base = customState(null);
    let s: FamilyWorship = { ...base, catechism: { code: "cyc", current: 143, pace: 1, timesOnCurrent: 0 } };
    s = afterGathering(s, { catechismTotal: 145 });
    expect(s.catechism!.current).toBe(144);
    expect(catechismFinished(s.catechism!, 145)).toBe(false);
    s = afterGathering(s, { catechismTotal: 145 });
    expect(s.catechism!.current).toBe(144);
    expect(catechismFinished(s.catechism!, 145)).toBe(true);
    expect(catechismPlan(s.catechism!, 145, 9).learning).toBe(144);
  });

  it("lists the week's questions for the printed sheet", () => {
    expect(upcomingQuestions({ code: "cyc", current: 4, pace: 2, timesOnCurrent: 1 }, 145, 7)).toEqual([2, 3, 4, 5, 6, 7]);
    expect(upcomingQuestions({ code: "cyc", current: 0, pace: 1, timesOnCurrent: 0 }, 3, 7)).toEqual([0, 1, 2]);
  });
});

describe("the week ahead", () => {
  it("reads the next seven days, and no further than the plan goes", () => {
    const s = { ...starterState("cyc", null), plan: { code: STARTER_PLAN, nextDay: 25 } };
    expect(upcomingDays(s, 28)).toEqual([25, 26, 27, 28]);
    expect(upcomingDays({ ...s, plan: { code: STARTER_PLAN, nextDay: 3 } }, 28)).toEqual([3, 4, 5, 6, 7, 8, 9]);
  });

  it("asks about a new psalm after a week, but not on the starter", () => {
    const s = { ...customState(null), psalm: { number: 23, since: "2026-09-01" } };
    expect(psalmWeekDue(s, "2026-09-07")).toBe(false);
    expect(psalmWeekDue(s, "2026-09-08")).toBe(true);
    expect(psalmWeekDue({ ...s, starter: true }, "2026-09-20")).toBe(false);
    expect(nextPsalm(150)).toBe(1);
  });
});

describe("the talk questions", () => {
  it("asks faith, love and hope when the family has written none", () => {
    expect(DEFAULT_TALK_QUESTIONS).toEqual([
      "What does this passage teach us to believe about God?",
      "How does it call us to love God and our neighbour?",
      "What does it give us to hope for?",
    ]);
    // A setup saved before the questions could be changed has no list at all.
    const older = customState(null);
    expect("talkQuestions" in older).toBe(false);
    expect(talkQuestions(older)).toEqual(DEFAULT_TALK_QUESTIONS);
    expect(talkQuestions(null)).toEqual(DEFAULT_TALK_QUESTIONS);
    expect(talkQuestions({ talkQuestions: [] })).toEqual(DEFAULT_TALK_QUESTIONS);
    expect(talkQuestions({ talkQuestions: ["  ", ""] })).toEqual(DEFAULT_TALK_QUESTIONS);
    expect(hasOwnTalkQuestions(older)).toBe(false);
    expect(hasOwnTalkQuestions({ talkQuestions: [" "] })).toBe(false);
  });

  it("asks the family's own, trimmed, with the blanks and repeats left out", () => {
    const own = { talkQuestions: ["  Who is in this story? ", "", "What did God do?", "Who is in this story?"] };
    expect(talkQuestions(own)).toEqual(["Who is in this story?", "What did God do?"]);
    expect(hasOwnTalkQuestions(own)).toBe(true);
  });

  it("does not trust a hand-edited setting", () => {
    expect(cleanTalkQuestions("What?")).toEqual([]);
    expect(cleanTalkQuestions([1, null, "Why?"])).toEqual(["Why?"]);
    const many = Array.from({ length: 12 }, (_, i) => `Question ${i + 1}?`);
    expect(cleanTalkQuestions(many)).toHaveLength(MAX_TALK_QUESTIONS);
    expect(cleanTalkQuestions(["x".repeat(500)])[0]).toHaveLength(MAX_TALK_QUESTION_LENGTH);
  });

  it("names the defaults by their one word, and the family's own by none", () => {
    expect(DEFAULT_TALK_QUESTIONS.map(talkQuestionTag)).toEqual(["Faith", "Love", "Hope"]);
    expect(talkQuestionTag("What does it give us to hope for, children?")).toBeNull();
    expect(talkQuestionTag("Who is in this story?")).toBeNull();
  });

  it("keeps the family's list, and drops it when reset or edited back to the defaults", () => {
    const base = customState(null);
    const own = withTalkQuestions(base, ["Who is in this story?", " "]);
    expect(own.talkQuestions).toEqual(["Who is in this story?"]);
    expect("talkQuestions" in withTalkQuestions(own, null)).toBe(false);
    expect("talkQuestions" in withTalkQuestions(own, [])).toBe(false);
    expect("talkQuestions" in withTalkQuestions(own, [...DEFAULT_TALK_QUESTIONS])).toBe(false);
    // The same three in another order are the family's own.
    const reordered = [DEFAULT_TALK_QUESTIONS[2], DEFAULT_TALK_QUESTIONS[0], DEFAULT_TALK_QUESTIONS[1]];
    expect(withTalkQuestions(base, reordered).talkQuestions).toEqual(reordered);
  });

  it("keeps the family's questions when the rest of the setup moves on", () => {
    const s = withTalkQuestions(starterState("cyc", null), ["What did God do?"]);
    const after = afterGathering(s, { lengthDays: 28, catechismTotal: 145 });
    expect(after.talkQuestions).toEqual(["What did God do?"]);
  });

  it("adds a question at the end, and not a blank, a repeat, or one too many", () => {
    const list = ["A?", "B?"];
    expect(addTalkQuestion(list, "  C? ")).toEqual(["A?", "B?", "C?"]);
    expect(addTalkQuestion(list, "   ")).toBe(list);
    expect(addTalkQuestion(list, "A?")).toBe(list);
    const full = Array.from({ length: MAX_TALK_QUESTIONS }, (_, i) => `${i}?`);
    expect(addTalkQuestion(full, "One more?")).toBe(full);
    expect(addTalkQuestion(list, "y".repeat(300))[2]).toHaveLength(MAX_TALK_QUESTION_LENGTH);
  });

  it("rewords a question, keeping the old words when cleared or repeated", () => {
    const list = ["A?", "B?", "C?"];
    expect(editTalkQuestion(list, 1, " Bee? ")).toEqual(["A?", "Bee?", "C?"]);
    expect(editTalkQuestion(list, 1, "  ")).toBe(list);
    expect(editTalkQuestion(list, 1, "B?")).toBe(list);
    expect(editTalkQuestion(list, 1, "C?")).toBe(list);
    expect(editTalkQuestion(list, 5, "D?")).toBe(list);
  });

  it("puts a removed question back where it was, but not as a repeat or past the limit", () => {
    const list = ["A?", "C?"];
    expect(insertTalkQuestion(list, 1, " B? ")).toEqual(["A?", "B?", "C?"]);
    expect(insertTalkQuestion(list, 0, "Z?")).toEqual(["Z?", "A?", "C?"]);
    expect(insertTalkQuestion(list, 9, "D?")).toEqual(["A?", "C?", "D?"]);
    expect(insertTalkQuestion(list, 1, "C?")).toBe(list);
    expect(insertTalkQuestion(list, 1, " ")).toBe(list);
    const full = Array.from({ length: MAX_TALK_QUESTIONS }, (_, i) => `${i}?`);
    expect(insertTalkQuestion(full, 0, "One more?")).toBe(full);
  });

  it("names the question an edit or an addition would repeat", () => {
    const list = ["A?", "B?", "C?"];
    expect(repeatedTalkQuestion(list, " B? ")).toBe(1);
    expect(repeatedTalkQuestion(list, "B?", 2)).toBe(1);
    // A question left as it was does not repeat itself.
    expect(repeatedTalkQuestion(list, "B?", 1)).toBe(-1);
    expect(repeatedTalkQuestion(list, "D?")).toBe(-1);
    expect(repeatedTalkQuestion(list, "   ")).toBe(-1);
  });

  it("removes a question, but never the last", () => {
    const list = ["A?", "B?", "C?"];
    expect(removeTalkQuestion(list, 1)).toEqual(["A?", "C?"]);
    expect(removeTalkQuestion(list, 3)).toBe(list);
    const one = ["A?"];
    expect(removeTalkQuestion(one, 0)).toBe(one);
  });

  it("moves a question up or down a place, and no further than the ends", () => {
    const list = ["A?", "B?", "C?"];
    expect(moveTalkQuestion(list, 1, -1)).toEqual(["B?", "A?", "C?"]);
    expect(moveTalkQuestion(list, 1, 1)).toEqual(["A?", "C?", "B?"]);
    expect(moveTalkQuestion(list, 0, -1)).toBe(list);
    expect(moveTalkQuestion(list, 2, 1)).toBe(list);
    expect(list).toEqual(["A?", "B?", "C?"]);
  });
});

describe("the prayer category", () => {
  it("picks a Family category when the list has one", () => {
    expect(guessPrayerCategory(["Church", " family ", null])).toBe("family");
    expect(guessPrayerCategory(["Families"])).toBe("Families");
    expect(guessPrayerCategory(["Church", null])).toBeNull();
  });
});

describe("the log", () => {
  it("lays out whole weeks ending with this one, and counts twice-a-day", () => {
    // 2026-09-24 is a Thursday.
    const rows = logWeeks(["2026-09-20", "2026-09-24", "2026-09-24"], 2, "2026-09-24");
    expect(rows).toHaveLength(2);
    expect(rows[0][0]?.date).toBe("2026-09-13");
    expect(rows[1][0]).toEqual({ date: "2026-09-20", count: 1 });
    expect(rows[1][4]).toEqual({ date: "2026-09-24", count: 2 });
    expect(rows[1][5]).toBeNull();
  });

  it("never reproaches", () => {
    expect(logSummary([], "2026-09-24")).toMatch(/Nothing logged yet/);
    expect(logSummary(["2026-08-02"], "2026-09-24")).toMatch(/^Not yet this /);
    expect(logSummary(["2026-09-02", "2026-09-03"], "2026-09-24")).toMatch(/^Gathered 2 times this .*, 2 times in all\.$/);
  });
});
