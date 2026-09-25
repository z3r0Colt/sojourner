import { describe, expect, it } from "vitest";
import {
  STARTER_PLAN,
  STARTER_TITLES,
  afterGathering,
  catechismFinished,
  catechismPlan,
  customState,
  guessPrayerCategory,
  logSummary,
  logWeeks,
  nextPsalm,
  planFinished,
  psalmWeekDue,
  starterPsalm,
  starterState,
  upcomingDays,
  upcomingQuestions,
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
