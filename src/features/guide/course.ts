/**
 * The guided study on the Westminster Standards (docs/guided-study-plan.md).
 *
 * The course follows the Shorter Catechism. A lesson is data: an
 * introduction, the panes it lays out, and steps. Each step tells the
 * student what to do, can open the pane to do it in, and can notice when it
 * is done -- a highlight in the passage, a note, a memory card, a prayer --
 * by looking at the student's ordinary app content, which stays theirs
 * whether or not the course is ever opened again. A check marks a step done;
 * it never blocks one, and any step can be ticked off by hand.
 *
 * This module is plain data and pure functions (no React, no store), so the
 * pane registry can name a lesson in a pane's title.
 */

import type { PaneKind } from "../../state/workspaceStore";
import { LESSONS } from "./lessons";

/** A Bible reference by book id (Romans is 45): a verse, or verses
 * `verse`..`to` of one chapter, or the whole chapter. */
export interface Passage {
  book: number;
  chapter: number;
  verse?: number;
  to?: number;
}

export type Standard = "wsc" | "wlc" | "wcf";
/** The Standards, and the Reformed confessions a lesson compares them with. */
export type Doc = Standard | "heidelberg" | "belgic";

/** Where a step's button takes the student. */
export type StepOpen =
  | { pane: "bible"; passage: Passage }
  | { pane: "interlinear"; passage: Passage }
  /** A question (or, for the Confession, chapter `n` paragraph `section`),
   * with a commentary source open on it ("whyte"). */
  | { pane: "westminster"; doc: Doc; n: number; section?: number; commentary?: string }
  | { pane: "wordstudy"; strongs: string }
  | { pane: "lexicon"; strongs: string }
  | { pane: "webster"; word: string }
  /** The study panes that follow the Bible, opened on `passage`. */
  | { pane: "crossrefs" | "confession-for-passage" | "citations" | "commentary" | "factbook-for-passage" | "timeline-for-passage"; passage: Passage }
  | { pane: "psalter"; psalm: number }
  | { pane: "search"; query: string }
  | { pane: "memory" | "prayer" | "notes" | "highlights" | "harmony" | "timeline" | "atlas" | "sermons" }
  /** A library book by (part of) its title, opened at a phrase. When the
   * install lacks it, `fallback` -- a Standards commentary on a question --
   * opens instead. */
  | { pane: "book"; title: string; find?: string; fallback: { doc: Standard; n: number; commentary: string } };

export interface QuizQuestion {
  q: string;
  choices: string[];
  /** Index into `choices`. */
  answer: number;
  /** Shown once answered. */
  why?: string;
}

/** How a step notices it is done. */
export type Check =
  /** A box in the Guide; done once something is written. */
  | { type: "answer"; placeholder?: string }
  /** Done once its pane has been opened from the step. */
  | { type: "opened" }
  /** A highlight anywhere in the passage. */
  | { type: "highlight"; passage: Passage }
  /** A verse note in the passage, tagged `tag` or written since the lesson began. */
  | { type: "note"; passage: Passage; tag: string }
  /** Memory cards for these: a Shorter Catechism question, a verse. */
  | { type: "memory"; question?: number; verse?: Passage }
  /** A prayer journal entry tagged `tag` or written since the lesson began. */
  | { type: "prayer"; tag: string }
  | { type: "quiz"; questions: QuizQuestion[] };

export interface Step {
  /** Stable within the lesson: progress is kept by it. */
  id: string;
  title: string;
  /** Paragraphs, separated by blank lines. */
  text: string;
  /** One line on the tool, the first time a lesson uses it. */
  tip?: string;
  open?: StepOpen;
  /** The button's words ("Open Romans 3"); a default is made from `open`. */
  openLabel?: string;
  check?: Check;
  optional?: boolean;
}

/** The panes a lesson lays out: the Guide on the left, the Bible on
 * `passage` beside it, and the study panes on the right, all following the
 * Bible. */
export interface LessonWorkspace {
  passage: Passage;
  study: PaneKind[];
  /** The Confessions pane, on this question, as a tab beside the study panes. */
  question?: number;
}

/** A lesson as written; its number is its place in the course. */
export interface LessonData {
  /** "wsc-33"; kept in progress and in pane params, so never renamed. */
  id: string;
  title: string;
  /** The Shorter Catechism questions it teaches. */
  questions: number[];
  intro: string;
  workspace: LessonWorkspace;
  steps: Step[];
}

export interface Lesson extends LessonData {
  number: number;
}

export interface Unit {
  title: string;
  /** What the unit covers, in the Catechism's words. */
  summary: string;
  lessons: Lesson[];
}

// ---------------------------------------------------------------------------
// The Standards' section ids. They are pinned in content.db (see
// SECTION_ID_RANGES in import/reference/westminster.rs) because user.db keeps
// them, so they can be computed here rather than looked up.

const WSC_FIRST_ID = 369;
const WLC_FIRST_ID = 173;
/** Paragraphs in each of the Confession's 33 chapters. */
const WCF_SECTION_COUNTS = [10, 3, 8, 2, 7, 6, 6, 8, 5, 4, 6, 1, 3, 3, 6, 7, 3, 4, 7, 4, 8, 7, 4, 6, 6, 3, 5, 7, 8, 4, 5, 3, 3];

export function sectionId(doc: Doc, n: number, section = 1): number {
  if (doc === "wsc") return WSC_FIRST_ID + n - 1;
  if (doc === "wlc") return WLC_FIRST_ID + n - 1;
  // Heidelberg Q&A N and Belgic Article N (the ranges after 517 and 480).
  if (doc === "heidelberg") return 517 + n;
  if (doc === "belgic") return 480 + n;
  const before = WCF_SECTION_COUNTS.slice(0, n - 1).reduce((a, b) => a + b, 0);
  return 1 + before + section - 1;
}

// ---------------------------------------------------------------------------
// The course

export const UNITS: Unit[] = [
  {
    title: "Scripture",
    summary: "What rule God has given to direct us how we may glorify and enjoy him (Q1–3).",
    lessons: LESSONS.filter((l) => l.questions[0] <= 3),
  },
  {
    title: "What we are to believe concerning God",
    summary: "God, his decrees and works, the fall, and redemption by Christ (Q4–38).",
    lessons: LESSONS.filter((l) => l.questions[0] >= 4 && l.questions[0] <= 38),
  },
  {
    title: "The duty God requires: the law",
    summary: "The moral law and the ten commandments (Q39–84).",
    lessons: LESSONS.filter((l) => l.questions[0] >= 39 && l.questions[0] <= 84),
  },
  {
    title: "The gospel and the means of grace",
    summary: "Faith, repentance, the word, the sacraments and prayer (Q85–107).",
    lessons: LESSONS.filter((l) => l.questions[0] >= 85),
  },
];

export function lessonById(id: string): Lesson | undefined {
  return LESSONS.find((l) => l.id === id);
}

/** The tag a lesson's notes and prayers carry ("wsc-33"). */
export function lessonTag(lesson: Lesson): string {
  return lesson.id;
}

// ---------------------------------------------------------------------------
// Progress, kept in the setting `guided_study` so it travels with backups.

export const GUIDE_SETTING = "guided_study";

export interface QuizResult {
  picks: number[];
  score: number;
  of: number;
}

export interface LessonProgress {
  startedAt: string;
  completedAt?: string;
  /** Step id -> when it was done. */
  done: Record<string, string>;
  answers: Record<string, string>;
  quiz: Record<string, QuizResult>;
}

export interface GuideState {
  lessons: Record<string, LessonProgress>;
  /** The lesson last opened, for "Continue". */
  current?: string;
}

export const EMPTY_GUIDE: GuideState = { lessons: {} };

export function newProgress(now: string): LessonProgress {
  return { startedAt: now, done: {}, answers: {}, quiz: {} };
}

/** `state` with one lesson's progress changed (started now if it was not). */
export function withLesson(state: GuideState, lessonId: string, now: string, change: (p: LessonProgress) => LessonProgress): GuideState {
  const current = state.lessons[lessonId] ?? newProgress(now);
  return { ...state, current: lessonId, lessons: { ...state.lessons, [lessonId]: change(current) } };
}

export function markDone(p: LessonProgress, stepId: string, now: string): LessonProgress {
  return p.done[stepId] ? p : { ...p, done: { ...p.done, [stepId]: now } };
}

export function unmarkDone(p: LessonProgress, stepId: string): LessonProgress {
  if (!p.done[stepId]) return p;
  const done = { ...p.done };
  delete done[stepId];
  return { ...p, done };
}

export function scoreQuiz(questions: QuizQuestion[], picks: number[]): QuizResult {
  return { picks, score: questions.filter((q, i) => picks[i] === q.answer).length, of: questions.length };
}

/** Steps done out of the steps that count (optional ones do not). */
export function stepsDone(lesson: Lesson, p: LessonProgress | undefined): { done: number; of: number } {
  const counted = lesson.steps.filter((s) => !s.optional);
  return { done: counted.filter((s) => p?.done[s.id]).length, of: counted.length };
}

/** The lesson to continue: the one last opened if it is unfinished, else
 * the first unfinished lesson in course order. */
export function nextLesson(state: GuideState, lessons: Lesson[] = LESSONS): Lesson | undefined {
  const current = state.current ? lessons.find((l) => l.id === state.current) : undefined;
  if (current && !state.lessons[current.id]?.completedAt) return current;
  return lessons.find((l) => !state.lessons[l.id]?.completedAt);
}

/** Whether a verse range overlaps a passage. */
export function overlaps(passage: Passage, book: number, chapter: number, verseStart: number, verseEnd: number): boolean {
  if (passage.book !== book || passage.chapter !== chapter) return false;
  if (passage.verse == null) return true;
  const to = passage.to ?? passage.verse;
  return verseStart <= to && verseEnd >= passage.verse;
}
