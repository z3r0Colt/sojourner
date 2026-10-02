/**
 * "Go deeper": what a lesson offers a mature student, or anyone with more
 * time. Most of it is made from data the app already ships rather than
 * written per lesson -- the Larger Catechism questions and Confession
 * paragraphs on the same subject (the parallels table), with Ridgley and
 * Hodge on them; Beattie and Fisher on the question; the verse the lesson
 * keeps, in Greek or Hebrew and in the library's citations. What is chosen
 * by hand is a book from the Puritan shelf for each lesson, and the
 * lesson's own questions, which become a teaching outline in Sermons.
 *
 * Plain data and pure functions, like course.ts.
 */

import { escapeHtml } from "../../lib/escapeHtml";
import type { Lesson, Passage, QuizQuestion, Step } from "./course";

/** The commentary a deeper step opens on each of the other Standards:
 * Ridgley has every Larger Catechism question, Hodge every chapter of the
 * Confession. */
export const PARALLEL_COMMENTARY = { wlc: "ridgley", wcf: "hodge" } as const;

/** The questions Fisher's catechism passes over: those that only recite a
 * commandment, which he takes with the question after. */
const FISHER_SKIPS = new Set([43, 45, 49, 53, 57, 63, 67, 70, 73, 76, 79]);

/** The question a lesson is chiefly about: the one its workspace opens in
 * the Confessions (Q33 of a lesson on Q32-33), else its first. */
export function mainQuestion(lesson: Lesson): number {
  return lesson.workspace.question ?? lesson.questions[0];
}

/** The lesson's main question, or the first Fisher answers if he skips it. */
export function fisherQuestion(lesson: Lesson): number {
  const main = mainQuestion(lesson);
  if (!FISHER_SKIPS.has(main)) return main;
  return lesson.questions.find((q) => !FISHER_SKIPS.has(q)) ?? main;
}

/** A parallel from the database ("70" in the Larger Catechism, "11" or
 * "11.2" in the Confession) as the place a step opens. */
export function parallelPlace(documentCode: string, label: string): { doc: "wlc" | "wcf"; n: number; section?: number } | null {
  if (documentCode !== "wlc" && documentCode !== "wcf") return null;
  const [n, section] = label.split(".").map(Number);
  if (!Number.isFinite(n)) return null;
  return documentCode === "wcf" && Number.isFinite(section) ? { doc: "wcf", n, section } : { doc: documentCode, n };
}

export interface Reading {
  title: string;
  author: string;
  /** One line on why this book, for this lesson. */
  why: string;
}

/**
 * Further reading, by lesson: books in the Sojourner library packs, opened
 * at their beginning. Optional and named by title and author, so an install
 * without the pack just says so. Titles as the pack gives them (Owen's
 * Pneumatologia is told from Flavel's by the author; Baxter's Christian
 * Directory is his "Practical Works").
 */
export const FURTHER_READING: Record<string, Reading[]> = {
  "wsc-1": [{ title: "Of Communion with God the Father, Son and Holy Ghost", author: "Owen", why: "What it is to enjoy God, from the Father’s love to the Spirit’s comfort." }],
  "wsc-2": [{ title: "The Institutes of the Christian Religion", author: "Calvin", why: "Book 1, chapters 6–9: Scripture, like glasses to weak eyes, makes plain to us the true God." }],
  "wsc-4": [{ title: "Outlines of Theology", author: "Hodge", why: "A. A. Hodge on the attributes of God, by question and answer." }],
  "wsc-5": [
    { title: "A Brief Declaration and Vindication of The Doctrine of the Trinity", author: "Owen", why: "The Trinity from Scripture: “a small, plain discourse”, as Owen called it, written for plain Christians rather than scholars." },
  ],
  "wsc-7": [{ title: "A Display of Arminianism", author: "Owen", why: "Owen’s first book: God’s decree set against the alternatives." }],
  "wsc-9": [{ title: "Pneumatologia", author: "Flavel", why: "The soul God made: its nature, its powers, and its worth." }],
  "wsc-11": [{ title: "The Crook in the Lot", author: "Boston", why: "God’s providence in the hard places of a life, and how to bear them." }],
  "wsc-12": [{ title: "Systematic Theology", author: "Berkhof", why: "Louis Berkhof (1938) on the covenant of works: its history in Reformed teaching, its ground in Scripture, and its elements." }],
  "wsc-13": [{ title: "Indwelling Sin in Believers", author: "Owen", why: "What sin is and how it works, as Owen found it in the heart of a believer." }],
  "wsc-16": [{ title: "A Dissertation on Divine Justice", author: "Owen", why: "Why sin must be punished: the justice of God and the need of a satisfaction." }],
  "wsc-20": [{ title: "Systematic Theology", author: "Berkhof", why: "Berkhof compares the covenant of grace with the covenant of works, and sets out its promises, its characteristics, and Christ its Mediator." }],
  "wsc-21": [{ title: "The Fountain of Life Opened Up", author: "Flavel", why: "Sermons on the person of Christ, God and man in one person." }],
  "wsc-23": [{ title: "The Fountain of Life Opened Up", author: "Flavel", why: "Flavel preaches through Christ’s offices of prophet, priest and king." }],
  "wsc-27": [{ title: "Christ Crucified Vol 1", author: "Durham", why: "Durham’s sermons on Isaiah 53: the humiliation of Christ." }],
  "wsc-29": [
    { title: "The Method of Grace in the Gospel Redemption", author: "Flavel", why: "How the Spirit applies to us the redemption Christ purchased." },
    { title: "The Necessity of Regeneration", author: "Charnock", why: "Why no one enters the kingdom without the new birth." },
  ],
  "wsc-33": [{ title: "The Doctrine of Justification by Faith", author: "Owen", why: "The fullest Puritan treatment of justification and imputed righteousness." }],
  "wsc-34": [
    { title: "Of the Mortification of Sin in Believers", author: "Owen", why: "Sanctification at work: putting sin to death by the Spirit." },
  ],
  "wsc-36": [
    { title: "The Doctrine of the Saints' Perseverance Explained and Confirmed", author: "Owen", why: "Perseverance in grace to the end, the last benefit of Question 36." },
  ],
  "wsc-37": [{ title: "The Saints' Everlasting Rest", author: "Baxter", why: "Heaven set before the believer, to be thought on daily." }],
  "wsc-39": [{ title: "Conscience with the Power and Cases Thereof", author: "Ames", why: "The law applied to the conscience, case by case." }],
  "wsc-49": [
    { title: "A Brief Instruction in the Worship of God", author: "Owen", why: "The second commandment and the regulative principle, by question and answer." },
  ],
  "wsc-63": [{ title: "Practical Works of Richard Baxter", author: "Baxter", why: "A Christian Directory: Baxter’s directions for husbands and wives, parents and children, masters and servants." }],
  "wsc-79": [
    { title: "The Rare Jewel of Christian Contentment", author: "Burroughs", why: "The grace the tenth commandment requires." },
    { title: "The Art of Divine Contentment", author: "Watson", why: "Watson on Philippians 4:11: “I have learned, in whatsoever state I am, therewith to be content.”" },
  ],
  "wsc-82": [{ title: "Indwelling Sin in Believers", author: "Owen", why: "Why even the regenerate do not perfectly keep the law in this life." }],
  "wsc-85": [{ title: "A Call to the Unconverted to Turn and Live", author: "Baxter", why: "The call to faith and repentance, pressed on the conscience." }],
  "wsc-88": [{ title: "A Discourse of the Word, the Instrument of Regeneration", author: "Charnock", why: "How God makes the word effectual to salvation." }],
  "wsc-91": [{ title: "Sacramental Discourses", author: "Owen", why: "Owen’s addresses at the Lord’s Table." }],
  "wsc-96": [{ title: "Sacramental Discourses", author: "Owen", why: "Owen’s addresses at the Lord’s Table: how to come, and what to look for." }],
  "wsc-98": [{ title: "Of Prayer", author: "Calvin", why: "Calvin’s chapter on prayer from the Institutes, with his exposition of the Lord’s Prayer." }],
};

/** The verse a lesson asks the student to keep, else its passage: the one
 * the deeper layer reads in the original and in the library. */
export function keyVerse(lesson: Lesson): Passage {
  for (const s of lesson.steps) if (s.check?.type === "memory" && s.check.verse) return s.check.verse;
  return lesson.workspace.passage;
}

/** Old Testament books are 1-39: their original is Hebrew. */
export function originalLanguage(passage: Passage): "Hebrew" | "Greek" {
  return passage.book <= 39 ? "Hebrew" : "Greek";
}

/** The lesson's own questions: its quiz, as questions to discuss rather
 * than choose between. */
export function lessonQuiz(lesson: Lesson): QuizQuestion[] {
  const check = lesson.steps.find((s) => s.check?.type === "quiz")?.check;
  return check?.type === "quiz" ? check.questions : [];
}

/** The passages a lesson reads and marks. */
export function lessonReadings(lesson: Lesson): Passage[] {
  const out: Passage[] = [];
  for (const s of lesson.steps) {
    if (s.check?.type === "highlight") out.push(s.check.passage);
  }
  return out;
}

/** The question the lesson opens with ("Before you read"), without what
 * the step goes on to tell a student working alone: up to its first
 * question mark, else its first paragraph. */
export function openingQuestion(lesson: Lesson): string | undefined {
  const text = lesson.steps.find((s) => s.id === "before")?.text;
  if (!text) return undefined;
  const para = text.split(/\n\s*\n/)[0];
  const q = para.indexOf("?");
  return q >= 0 ? para.slice(0, q + 1) : para;
}

export interface TeachInput {
  lesson: Lesson;
  /** The Catechism's questions and answers, in the lesson's order. */
  answers: { n: number; prompt: string; body: string }[];
  /** Larger Catechism and Confession sections on the subject ("WLC 70"). */
  parallels: string[];
}

function passageBlock(p: Passage): string {
  const start = p.verse ?? 1;
  const end = p.to ?? p.verse ?? start;
  // A passage with no verse means the chapter; a sermon block needs verses,
  // so it holds the first, and the teacher widens it in the editor.
  return `<div data-type="passage" data-book-id="${p.book}" data-chapter="${p.chapter}" data-verse-start="${start}" data-verse-end="${end}"></div>`;
}

/**
 * A lesson outline for whoever will teach this lesson to others, as a
 * Sermons manuscript: the Catechism's answer, the Scripture it rests on,
 * room for the explanation, the other Standards to consult, and the
 * lesson's questions under "Discussion questions", which the sermon handout
 * prints last with room to write.
 */
export function teachItManuscript({ lesson, answers, parallels }: TeachInput): { title: string; body: string } {
  const h = escapeHtml;
  const parts: string[] = [];
  const opening = openingQuestion(lesson);
  parts.push(`<h2>Opening question</h2>`, `<p>${h(opening ?? lesson.intro)}</p>`);
  parts.push(`<h2>The Catechism’s answer</h2>`);
  for (const a of answers) parts.push(`<p><strong>Q. ${a.n}. ${h(a.prompt)}</strong></p>`, `<p>${h(a.body)}</p>`);
  const readings = lessonReadings(lesson);
  if (readings.length) {
    parts.push(`<h2>The Scripture</h2>`);
    for (const r of readings) parts.push(passageBlock(r));
  }
  parts.push(`<h2>Explanation</h2>`, `<p>Take the answer phrase by phrase, with a proof text for each.</p>`);
  if (parallels.length) parts.push(`<h2>The other Standards</h2>`, `<p>${h(parallels.join("; "))}.</p>`);
  parts.push(`<h2>Application</h2>`, `<p></p>`);
  const quiz = lessonQuiz(lesson);
  if (quiz.length) {
    parts.push(`<h2>Discussion questions</h2>`, `<ol>${quiz.map((q) => `<li><p>${h(q.q)}</p></li>`).join("")}</ol>`);
  }
  return { title: `Catechism lesson: ${lesson.title} (${answers.map((a) => `Q${a.n}`).join(", ")})`, body: parts.join("") };
}

// ---------------------------------------------------------------------------
// Leading a class

/** Minutes a class might give each kind of step; work best done at home
 * (the classic reading, writing a note, the memory cards) is set for after. */
const CLASS_MINUTES: Record<string, number> = {
  before: 5,
  observe: 10,
  answer: 5,
  teaching: 10,
  check: 15,
  sing: 5,
  pray: 5,
};
const AT_HOME = new Set(["classic", "write", "keep"]);

export interface ClassPlanRow {
  step: Step;
  /** Minutes in class, or null for a step left for home. */
  minutes: number | null;
}

/** The lesson as a class: every step in order, with a suggested time, and
 * the steps for home marked. Steps of other kinds (a word study, a cross
 * reference) get five minutes; a review's steps get their own. */
export function classPlan(lesson: Lesson): { rows: ClassPlanRow[]; total: number } {
  const rows = lesson.steps.map((step): ClassPlanRow => {
    if (AT_HOME.has(step.id)) return { step, minutes: null };
    const base = step.id.replace(/-\d+$/, "");
    return { step, minutes: CLASS_MINUTES[base] ?? (step.check?.type === "reflect" ? 15 : 5) };
  });
  return { rows, total: rows.reduce((t, r) => t + (r.minutes ?? 0), 0) };
}
