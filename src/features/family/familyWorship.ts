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

/** A verse to learn together: said every time the family gathers, with a
 * few more words hidden as the gatherings go by (see memoryHint). */
export interface FamilyMemory {
  bookId: number;
  chapter: number;
  verseStart: number;
  verseEnd: number;
  /** The day it was chosen. */
  since: string;
  /** Gatherings it has been said at. */
  times: number;
}

/** How much of the verse to show, by how often the family has said it:
 * all of it the first two times, then with words blanked, then only the
 * first letters -- and at any point "show the words" puts it all back. */
export function memoryHint(times: number): "full" | "blank-word" | "first-letter" {
  return times < 2 ? "full" : times < 4 ? "blank-word" : "first-letter";
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
  /** The verse the family is learning by heart, if any (absent in a setup
   * saved before there was one). */
  memory?: FamilyMemory | null;
  /** The family's own questions to talk over after the reading, when it has
   * written its own. Absent means the three defaults (DEFAULT_TALK_QUESTIONS),
   * so a setup saved before these could be changed asks those, and a family
   * that never touches them hears any later rewording of the defaults. Read
   * it through talkQuestions, never directly. */
  talkQuestions?: string[];
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

// ---------------------------------------------------------------------------
// Talk about it: the questions asked after every reading.

/**
 * Asked of every reading unless the family writes its own: faith, love and
 * hope, the three that abide (1 Corinthians 13:13). Enough to start a
 * conversation for a parent who does not know what to say, never wrong for
 * any passage, and easy for a child to remember by its one word.
 */
export const DEFAULT_TALK_QUESTIONS: readonly string[] = [
  "What does this passage teach us to believe about God?",
  "How does it call us to love God and our neighbour?",
  "What does it give us to hope for?",
];

/** The one word each default question goes by, shown beside it. */
const DEFAULT_TALK_TAGS = ["Faith", "Love", "Hope"];

/** A family's own list is kept short enough to ask in a few minutes and to
 * fit under the readings on the printed sheet. */
export const MAX_TALK_QUESTIONS = 8;
export const MAX_TALK_QUESTION_LENGTH = 200;

/**
 * A list of questions made safe to ask: each trimmed and cut to length, the
 * blank ones dropped, a question asked twice kept once, and no more than
 * MAX_TALK_QUESTIONS. Anything that is not a list of strings (a hand-edited
 * setting) comes out empty.
 */
export function cleanTalkQuestions(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  for (const item of list) {
    if (typeof item !== "string") continue;
    const q = item.trim().slice(0, MAX_TALK_QUESTION_LENGTH).trim();
    if (q && !out.includes(q)) out.push(q);
    if (out.length === MAX_TALK_QUESTIONS) break;
  }
  return out;
}

/** Whether the family asks questions of its own rather than the defaults. */
export function hasOwnTalkQuestions(state: Pick<FamilyWorship, "talkQuestions"> | null | undefined): boolean {
  return cleanTalkQuestions(state?.talkQuestions).length > 0;
}

/** The questions to ask after tonight's reading: the family's own when it
 * has written any, otherwise the three defaults. */
export function talkQuestions(state: Pick<FamilyWorship, "talkQuestions"> | null | undefined): string[] {
  const own = cleanTalkQuestions(state?.talkQuestions);
  return own.length > 0 ? own : [...DEFAULT_TALK_QUESTIONS];
}

/** "Faith", "Love" or "Hope" for a default question, word for word; a
 * question the family has written or reworded is its own and goes by none.
 * The word belongs to the question, so it follows it when the list is
 * reordered. */
export function talkQuestionTag(question: string): string | null {
  const i = DEFAULT_TALK_QUESTIONS.indexOf(question.trim());
  return i >= 0 ? DEFAULT_TALK_TAGS[i] : null;
}

/**
 * The setup with `list` as its questions. A list that is empty, or is the
 * defaults again, takes the family's own list away (Reset to the defaults is
 * `withTalkQuestions(state, null)`), so a family that edits its way back to
 * the three is on the defaults once more rather than holding a copy of them.
 */
export function withTalkQuestions(state: FamilyWorship, list: readonly string[] | null): FamilyWorship {
  const cleaned = cleanTalkQuestions(list);
  const isDefault = cleaned.length === DEFAULT_TALK_QUESTIONS.length && cleaned.every((q, i) => q === DEFAULT_TALK_QUESTIONS[i]);
  const next: FamilyWorship = { ...state, talkQuestions: cleaned };
  if (cleaned.length === 0 || isDefault) delete next.talkQuestions;
  return next;
}

// The edits the settings make to a list. Each returns the very list it was
// given when nothing changes (a blank question, one already asked, a full
// list, a move past either end), so the caller can tell and not save.

const asTalkQuestion = (text: string) => text.trim().slice(0, MAX_TALK_QUESTION_LENGTH).trim();

/** Another question at the end of the list. */
export function addTalkQuestion(list: string[], text: string): string[] {
  return insertTalkQuestion(list, list.length, text);
}

/** A question put in at `index` -- how a removed question is put back where
 * it was. */
export function insertTalkQuestion(list: string[], index: number, text: string): string[] {
  const q = asTalkQuestion(text);
  if (!q || list.includes(q) || list.length >= MAX_TALK_QUESTIONS) return list;
  const at = Math.max(0, Math.min(index, list.length));
  return [...list.slice(0, at), q, ...list.slice(at)];
}

/** Which question on the list already asks `text`, word for word as it
 * would be saved, or -1. The question at `except` -- the one being reworded
 * -- does not count, so a question left as it was is not a repeat of
 * itself. The settings use it to say why an edit or an addition was not
 * taken, rather than quietly dropping it. */
export function repeatedTalkQuestion(list: string[], text: string, except = -1): number {
  const q = asTalkQuestion(text);
  return q ? list.findIndex((old, i) => i !== except && old === q) : -1;
}

/** One question reworded. Cleared, it keeps its old words: taking a
 * question away is the remove button's work, not an empty box's. */
export function editTalkQuestion(list: string[], index: number, text: string): string[] {
  const q = asTalkQuestion(text);
  if (!q || index < 0 || index >= list.length || list[index] === q || list.includes(q)) return list;
  return list.map((old, i) => (i === index ? q : old));
}

/** One question taken away. The last one stays, so there is always
 * something to ask. */
export function removeTalkQuestion(list: string[], index: number): string[] {
  if (list.length <= 1 || index < 0 || index >= list.length) return list;
  return list.filter((_, i) => i !== index);
}

/** One question moved up (-1) or down (+1) a place. */
export function moveTalkQuestion(list: string[], index: number, by: -1 | 1): string[] {
  const to = index + by;
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return list;
  const out = [...list];
  [out[index], out[to]] = [out[to], out[index]];
  return out;
}

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

  const memory = state.memory ? { ...state.memory, times: state.memory.times + 1 } : (state.memory ?? null);

  return { ...state, plan, catechism, psalm, starter, memory };
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
