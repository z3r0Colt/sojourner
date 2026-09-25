/**
 * Family worship: what the household reads, sings, learns and prays for
 * when it gathers, and how that moves on each time it does.
 *
 * Everything here is plain data and pure functions, so it can be tested; the
 * hook that loads it and the views that show it live beside it.
 *
 * The state is the family's own and lives in user.db (`useSetting`), apart
 * from the reader's personal plans: a parent reading M'Cheyne alone and the
 * family reading the same plan at the table keep two places, not one.
 *
 * Nothing is dated. The reading, the psalm and the catechism move on when
 * the family *gathers*, not when the calendar turns, so a missed night is
 * picked up where it was left rather than counted as behind. The log records
 * the nights gathered and nothing else -- no streaks.
 */

export const FAMILY_SETTING = "family_worship";
export const FAMILY_LOG_SETTING = "family_worship_log";
export const FAMILY_INVITE_SETTING = "family_worship_invite_dismissed";

export const STARTER_PLAN = "family_starter";

export interface FamilyCatechism {
  /** The document's code in the Confessions (cyc, wsc, heidelberg, wlc). */
  code: string;
  /** Index into the document's questions of the one being learned. */
  current: number;
  /** A new question every `pace` gatherings. */
  pace: number;
  /** Gatherings spent on the current question so far. */
  timesOnCurrent: number;
}

export interface FamilyWorship {
  /** The plan the family reads and the next day of it to read. */
  plan: { code: string; nextDay: number } | null;
  /** The psalm the family is learning to sing, and the day it was chosen. */
  psalm: { number: number; since: string } | null;
  singing: boolean;
  catechism: FamilyCatechism | null;
  /** Whose names come up to pray for: a prayer-list category, or everyone. */
  prayerCategory: string | null;
  /** On the first four weeks, whose psalm moves on with the reading. */
  starter: boolean;
  /** When the family set this up. */
  started: string;
}

/** The catechisms offered, gentlest first. */
export const FAMILY_CATECHISMS: { code: string; label: string; note: string }[] = [
  { code: "cyc", label: "Catechism for Young Children", note: "1840, 145 short questions. Made for little ones: “Who made you? God.”" },
  { code: "wsc", label: "Westminster Shorter Catechism", note: "1647, 107 questions. For older children and adults." },
  { code: "heidelberg", label: "Heidelberg Catechism", note: "1563, 129 questions, in 52 Lord's Days." },
  { code: "wlc", label: "Westminster Larger Catechism", note: "1648, 196 questions. Long answers; for older students." },
];

export const PACES: { value: number; label: string }[] = [
  { value: 1, label: "Every time we gather" },
  { value: 2, label: "Every other time" },
  { value: 3, label: "Every third time" },
  { value: 5, label: "About once a week" },
];

/** The first four weeks' psalms, a week (seven gatherings) each: short,
 * and among the best known in the metrical psalter. */
export const STARTER_PSALMS = [100, 23, 117, 1];

/** What each starter reading is about, for the heading over it. */
export const STARTER_TITLES = [
  "God makes the world",
  "The fall",
  "Noah and the ark",
  "God calls Abram",
  "The Lord will provide",
  "The burning bush",
  "The Passover",
  "Through the Red Sea",
  "The Ten Commandments",
  "David and Goliath",
  "The Lord is my shepherd",
  "The suffering servant",
  "Daniel and the lions",
  "Jesus is born",
  "The boy Jesus in the temple",
  "Jesus is baptized and tempted",
  "Jesus calms the storm",
  "Jesus teaches us to pray",
  "The good Samaritan",
  "The lost son",
  "You must be born again",
  "Lazarus raised",
  "The Lord's Supper",
  "The cross",
  "He is risen",
  "Jesus ascends",
  "The Spirit comes",
  "All things new",
];

/** Asked of every reading: enough to start a conversation for a parent who
 * does not know what to say, and never wrong for any passage. */
export const TALK_QUESTIONS = [
  "What does this passage teach us about God?",
  "What does it teach us about ourselves?",
  "What should we believe, or do, because of it?",
];

/** A local calendar date, YYYY-MM-DD. */
export function localDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseLocal(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parseLocal(to).getTime() - parseLocal(from).getTime()) / 86_400_000);
}

/** The psalm for a starter day: a new one every seven gatherings. */
export function starterPsalm(nextDay: number): number {
  return STARTER_PSALMS[Math.min(STARTER_PSALMS.length - 1, Math.floor((Math.max(1, nextDay) - 1) / 7))];
}

/** The first four weeks, set up in one step. */
export function starterState(catechismCode: string, prayerCategory: string | null, today = localDate()): FamilyWorship {
  return {
    plan: { code: STARTER_PLAN, nextDay: 1 },
    psalm: { number: starterPsalm(1), since: today },
    singing: true,
    // Every other time: fourteen questions in four weeks is plenty to begin.
    catechism: { code: catechismCode, current: 0, pace: 2, timesOnCurrent: 0 },
    prayerCategory,
    starter: true,
    started: today,
  };
}

/** A blank setup for a family choosing its own: the starter reading until
 * they pick another, Psalm 100, the children's catechism. */
export function customState(prayerCategory: string | null, today = localDate()): FamilyWorship {
  return { ...starterState("cyc", prayerCategory, today), starter: false };
}

/** The prayer-list category a family most likely means, if it has one. */
export function guessPrayerCategory(categories: (string | null)[]): string | null {
  const names = categories.map((c) => c?.trim()).filter((c): c is string => !!c);
  return names.find((c) => /^famil(y|ies)$/i.test(c)) ?? null;
}

export function planFinished(state: FamilyWorship, lengthDays: number | undefined): boolean {
  return !!state.plan && lengthDays != null && state.plan.nextDay > lengthDays;
}

/**
 * The questions for a gathering: the one being learned, then up to three to
 * go over -- the two before it, and one further back that changes each time
 * so the early answers are not forgotten.
 */
export function catechismPlan(cat: FamilyCatechism, total: number, gatherings: number): { learning: number; review: number[] } {
  const learning = Math.max(0, Math.min(cat.current, Math.max(0, total - 1)));
  const review: number[] = [];
  if (learning >= 1) review.push(learning - 1);
  if (learning >= 2) review.push(learning - 2);
  // Anything from question 1 up to the three before the one being learned.
  const older = learning - 2;
  if (older > 0) review.push((gatherings * 7) % older);
  return { learning, review: [...new Set(review)].sort((a, b) => a - b) };
}

export function catechismFinished(cat: FamilyCatechism, total: number | undefined): boolean {
  return total != null && total > 0 && cat.current >= total - 1 && cat.timesOnCurrent >= cat.pace;
}

/**
 * The state after the family gathers once: the next reading, the next
 * question when its turn has come, and on the first four weeks the next
 * psalm. `lengthDays` and `catechismTotal` are what the plan and catechism
 * hold; a finished plan or catechism stays where it is until the family
 * chooses what comes next.
 */
export function afterGathering(
  state: FamilyWorship,
  opts: { lengthDays?: number; catechismTotal?: number; today?: string },
): FamilyWorship {
  const today = opts.today ?? localDate();
  let plan = state.plan;
  if (plan && (opts.lengthDays == null || plan.nextDay <= opts.lengthDays)) {
    plan = { ...plan, nextDay: plan.nextDay + 1 };
  }

  let catechism = state.catechism;
  if (catechism) {
    const times = catechism.timesOnCurrent + 1;
    const last = opts.catechismTotal != null ? Math.max(0, opts.catechismTotal - 1) : Infinity;
    if (times >= catechism.pace && catechism.current < last) {
      catechism = { ...catechism, current: catechism.current + 1, timesOnCurrent: 0 };
    } else {
      catechism = { ...catechism, timesOnCurrent: times };
    }
  }

  let psalm = state.psalm;
  let starter = state.starter;
  if (starter && plan?.code === STARTER_PLAN) {
    const next = starterPsalm(plan.nextDay);
    if (psalm?.number !== next) psalm = { number: next, since: today };
    if (opts.lengthDays != null && plan.nextDay > opts.lengthDays) starter = false;
  }

  return { ...state, plan, catechism, psalm, starter };
}

/** The plan days the next `count` gatherings will read, for the week's sheet. */
export function upcomingDays(state: FamilyWorship, lengthDays: number | undefined, count = 7): number[] {
  if (!state.plan) return [];
  const out: number[] = [];
  for (let d = state.plan.nextDay; out.length < count && (lengthDays == null || d <= lengthDays); d++) out.push(d);
  return out;
}

/** Every question the next `count` gatherings will learn or go over, in order. */
export function upcomingQuestions(cat: FamilyCatechism, total: number, count = 7): number[] {
  const seen = new Set<number>();
  let c = cat;
  for (let i = 0; i < count; i++) {
    const learning = Math.min(c.current, total - 1);
    seen.add(learning);
    if (i === 0) {
      if (learning >= 1) seen.add(learning - 1);
      if (learning >= 2) seen.add(learning - 2);
    }
    const next = afterGathering(
      { plan: null, psalm: null, singing: false, catechism: c, prayerCategory: null, starter: false, started: "" },
      { catechismTotal: total },
    ).catechism;
    if (!next) break;
    c = next;
  }
  return [...seen].filter((n) => n >= 0 && n < total).sort((a, b) => a - b);
}

/** The next psalm to move on to, 150 wrapping to 1. */
export function nextPsalm(n: number): number {
  return n >= 150 ? 1 : n + 1;
}

/** Whether the family has sung its psalm a week, and it is time to ask
 * about moving on. The first four weeks move on by themselves. */
export function psalmWeekDue(state: FamilyWorship, today = localDate()): boolean {
  return !!state.psalm && !state.starter && daysBetween(state.psalm.since, today) >= 7;
}

// ---------------------------------------------------------------------------
// The log: one entry per gathering, local dates, oldest first.

export function gatheredOn(log: string[], date: string): number {
  return log.filter((d) => d === date).length;
}

/** Gatherings in the month holding `today`. */
export function gatheredThisMonth(log: string[], today = localDate()): number {
  const month = today.slice(0, 7);
  return log.filter((d) => d.startsWith(month)).length;
}

/**
 * The last `weeks` weeks as rows of seven days, Sunday first, ending with the
 * week holding `today`: each day with how many times the family gathered.
 * Days after today are null.
 */
export function logWeeks(log: string[], weeks = 5, today = localDate()): ({ date: string; count: number } | null)[][] {
  const counts = new Map<string, number>();
  for (const d of log) counts.set(d, (counts.get(d) ?? 0) + 1);
  const end = parseLocal(today);
  const start = new Date(end);
  start.setDate(end.getDate() - end.getDay() - 7 * (weeks - 1));
  const rows: ({ date: string; count: number } | null)[][] = [];
  const cursor = new Date(start);
  for (let w = 0; w < weeks; w++) {
    const row: ({ date: string; count: number } | null)[] = [];
    for (let i = 0; i < 7; i++) {
      const date = localDate(cursor);
      row.push(cursor > end ? null : { date, count: counts.get(date) ?? 0 });
      cursor.setDate(cursor.getDate() + 1);
    }
    rows.push(row);
  }
  return rows;
}

/** A few words for the log, never a reproach. */
export function logSummary(log: string[], today = localDate()): string {
  if (log.length === 0) return "Nothing logged yet. The first time you gather, it is written down here.";
  const month = gatheredThisMonth(log, today);
  const monthName = parseLocal(today).toLocaleDateString(undefined, { month: "long" });
  const total = `${log.length} ${log.length === 1 ? "time" : "times"} in all`;
  if (month === 0) return `Not yet this ${monthName}; ${total}.`;
  return `Gathered ${month} ${month === 1 ? "time" : "times"} this ${monthName}, ${total}.`;
}
