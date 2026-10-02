import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { useBooks } from "../../api/queries";
import type { Book, Note, PrayerEntry } from "../../api/types";
import { bookName } from "../../lib/passage";
import { overlaps, questionsLabel, type GuideState, type HenryAsk, type Lesson, type Passage } from "./course";
import { classPlan, keyVerse, lessonQuiz, lessonReadings, openingQuestion } from "./deeper";
import { LESSONS } from "./lessons";
import { useCatechismAnswers, useHenryQuestions } from "./useGuideData";

/**
 * The guided study on paper: a lesson as a class handout or a leader's copy,
 * and the student's notebook. Each is mounted only for the print pass, on
 * <body> (see FamilyWeekSheet), and prints itself once its data is in.
 */

const page: React.CSSProperties = { fontFamily: "Georgia, serif", padding: "0.5in", color: "#000", fontSize: "11pt", lineHeight: 1.4 };
const h1: React.CSSProperties = { fontSize: "20pt", margin: "0 0 2pt" };
const sub: React.CSSProperties = { fontSize: "10pt", margin: 0, color: "#444" };
const h2: React.CSSProperties = {
  fontSize: "11pt",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  margin: "14pt 0 6pt",
  borderBottom: "1px solid #999",
  paddingBottom: "2pt",
};
const muted: React.CSSProperties = { color: "#555" };

function refLabel(books: Book[] | undefined, p: Passage): string {
  return `${bookName(books, p.book)} ${p.chapter}${p.verse ? `:${p.verse}${p.to ? `–${p.to}` : ""}` : ""}`;
}

/** Prints once `ready`, or after a few seconds whatever has loaded, so a
 * source missing from an older content.db never holds the sheet back. */
function usePrintWhen(ready: boolean, onDone: () => void) {
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setWaited(true), 4000);
    return () => window.clearTimeout(t);
  }, []);
  const go = ready || waited;
  useEffect(() => {
    if (!go) return;
    const id = requestAnimationFrame(() => {
      window.print();
      onDone();
    });
    return () => cancelAnimationFrame(id);
  }, [go, onDone]);
}

function Lines({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} style={{ borderBottom: "1px solid #bbb", height: "20pt" }} />
      ))}
    </>
  );
}

function henryAsks(lesson: Lesson): HenryAsk[] {
  const check = lesson.steps.find((s) => s.check?.type === "quiz")?.check;
  return check?.type === "quiz" ? (check.henry ?? []) : [];
}

// ---------------------------------------------------------------------------
// A lesson for a class

/**
 * One lesson for a class. The handout has the opening question, the
 * passages, the Catechism's answers, the lesson's questions to discuss with
 * room to write, and what to learn by heart. The leader's copy adds a plan
 * of the hour with times, what each step asks, and the answers.
 */
export function LessonSheet({ lesson, leader, onDone }: { lesson: Lesson; leader: boolean; onDone: () => void }) {
  const { data: books } = useBooks();
  const answers = useCatechismAnswers(lesson.questions);
  const asks = useMemo(() => henryAsks(lesson), [lesson]);
  const henry = useHenryQuestions(asks);
  usePrintWhen(answers != null && !!henry.ready && books != null, onDone);

  const own = lessonQuiz(lesson);
  const opening = openingQuestion(lesson);
  const readings = lessonReadings(lesson);
  const verse = keyVerse(lesson);
  const plan = classPlan(lesson);
  const discuss = [...own, ...henry];

  return createPortal(
    <div className="print-root print-only" aria-hidden="true">
      <div style={page}>
        <h1 style={h1}>{lesson.title}</h1>
        <p style={sub}>
          The Westminster Shorter Catechism, {questionsLabel(lesson)}
          {leader ? " · Leader’s copy" : ""}
        </p>

        {leader && (
          <section>
            <h2 style={h2}>The hour · about {plan.total} minutes</h2>
            <p style={{ margin: "0 0 6pt" }}>{lesson.intro}</p>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10pt" }}>
              <tbody>
                {plan.rows.map(({ step, minutes }) => (
                  <tr key={step.id} style={{ verticalAlign: "top", breakInside: "avoid" }}>
                    <td style={{ width: "52pt", padding: "3pt 6pt 3pt 0", ...muted }}>{minutes == null ? "At home" : `${minutes} min`}</td>
                    <td style={{ padding: "3pt 0" }}>
                      <strong>{step.title}.</strong> {step.text.split(/\n\s*\n/).join(" ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {opening && (
          <section style={{ breakInside: "avoid" }}>
            <h2 style={h2}>To begin</h2>
            <p style={{ margin: 0 }}>{opening}</p>
            {!leader && <Lines count={3} />}
          </section>
        )}

        {readings.length > 0 && (
          <section style={{ breakInside: "avoid" }}>
            <h2 style={h2}>Read</h2>
            <p style={{ margin: 0 }}>{readings.map((r) => refLabel(books, r)).join("; ")}</p>
          </section>
        )}

        <section>
          <h2 style={h2}>The Catechism</h2>
          {lesson.questions.map((n) => {
            const s = answers?.get(n);
            if (!s) return null;
            return (
              <div key={n} style={{ margin: "0 0 6pt", breakInside: "avoid" }}>
                <div>
                  <span style={muted}>Q. {n}. </span>
                  <strong>{s.prompt}</strong>
                </div>
                <div style={{ whiteSpace: "pre-line" }}>A. {s.body}</div>
              </div>
            );
          })}
        </section>

        {discuss.length > 0 && (
          <section>
            <h2 style={h2}>Discuss</h2>
            <ol style={{ margin: 0, paddingLeft: "18pt", listStyle: "decimal" }}>
              {discuss.map((q, i) => (
                <li key={i} style={{ margin: "0 0 8pt", breakInside: "avoid" }}>
                  {q.q}
                  {leader ? (
                    <div style={{ fontSize: "10pt", ...muted }}>
                      <strong>{q.choices[q.answer]}.</strong> {q.why}
                    </div>
                  ) : (
                    <Lines count={2} />
                  )}
                </li>
              ))}
            </ol>
            {henry.length > 0 && (
              <p style={{ fontSize: "9pt", ...muted }}>Questions {own.length + 1}–{discuss.length} are Matthew Henry’s, from A Scripture Catechism (1703); answer each from Scripture.</p>
            )}
          </section>
        )}

        <section style={{ breakInside: "avoid" }}>
          <h2 style={h2}>Learn by heart</h2>
          <p style={{ margin: 0 }}>
            {lesson.questions.length === 1 ? `Question ${lesson.questions[0]}` : `Questions ${lesson.questions.join(", ")}`}, and {refLabel(books, verse)}.
          </p>
        </section>
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// The student's notebook

function textOf(html: string): string {
  return (new DOMParser().parseFromString(html, "text/html").body.textContent ?? "").trim();
}

function prayerText(p: PrayerEntry): string {
  if (p.mode === "free" || p.free_text) return (p.free_text ?? "").trim();
  return [
    ["Adoration", p.adoration],
    ["Confession", p.confession],
    ["Thanksgiving", p.thanksgiving],
    ["Supplication", p.supplication],
  ]
    .filter(([, t]) => t?.trim())
    .map(([label, t]) => `${label}: ${t!.trim()}`)
    .join("\n");
}

/** Whether something written at `createdAt` falls within the lesson: from
 * its start to its finish, or to now if it is unfinished. */
function inLesson(createdAt: string, startedAt: string, completedAt: string | undefined): boolean {
  const t = Date.parse(createdAt);
  return t >= Date.parse(startedAt) && (!completedAt || t <= Date.parse(completedAt));
}

export interface NotebookEntry {
  lesson: Lesson;
  notes: Note[];
  prayers: PrayerEntry[];
}

/**
 * What the student wrote for each lesson they have begun, in course order.
 * A note or prayer belongs to a lesson by its tag, or, untagged by any
 * lesson, by being written while the lesson was open -- a note only in the
 * passage the lesson asked for one on. The same rules the steps' checks use.
 */
export function notebookEntries(
  state: GuideState,
  notes: Note[],
  noteTags: [number, string][],
  prayers: PrayerEntry[],
  prayerTags: [number, string][],
  lessons: Lesson[] = LESSONS,
): NotebookEntry[] {
  const lessonIds = new Set(lessons.map((l) => l.id));
  const tagsOf = (pairs: [number, string][]) => {
    const m = new Map<number, string[]>();
    for (const [id, tag] of pairs) if (lessonIds.has(tag)) m.set(id, [...(m.get(id) ?? []), tag]);
    return m;
  };
  const noteLessons = tagsOf(noteTags);
  const prayerLessons = tagsOf(prayerTags);
  return lessons.flatMap((lesson) => {
    const p = state.lessons[lesson.id];
    if (!p) return [];
    const notePlace = lesson.steps.find((s) => s.check?.type === "note")?.check;
    const mine = notes.filter((n) => {
      if (n.deleted_at) return false;
      const tags = noteLessons.get(n.id);
      if (tags) return tags.includes(lesson.id);
      return (
        notePlace?.type === "note" &&
        overlaps(notePlace.passage, n.book_id, n.chapter, n.verse_start, n.verse_end) &&
        inLesson(n.created_at, p.startedAt, p.completedAt)
      );
    });
    const hasPrayer = lesson.steps.some((s) => s.check?.type === "prayer");
    const prayed = prayers.filter((e) => {
      if (e.deleted_at) return false;
      const tags = prayerLessons.get(e.id);
      if (tags) return tags.includes(lesson.id);
      return hasPrayer && inLesson(e.created_at, p.startedAt, p.completedAt);
    });
    return [{ lesson, notes: mine, prayers: prayed }];
  });
}

/**
 * The student's catechism notebook: for every lesson begun, the answers
 * learned, what they wrote before the lesson (and, in a review, what they
 * would say now), their notes and prayers, and how the check went.
 */
export function NotebookSheet({ state, onDone }: { state: GuideState; onDone: () => void }) {
  const { data: books } = useBooks();
  const notes = useQuery({ queryKey: ["allNotes"], queryFn: api.listAllNotes });
  const noteTags = useQuery({ queryKey: ["allNoteTagsByNote"], queryFn: api.listAllNoteTagsByNote });
  const prayers = useQuery({ queryKey: ["prayerEntries"], queryFn: api.listPrayerEntries });
  const prayerTags = useQuery({ queryKey: ["allPrayerEntryTagsByEntry"], queryFn: api.listAllPrayerEntryTagsByEntry });
  const entries = useMemo(
    () => notebookEntries(state, notes.data ?? [], noteTags.data ?? [], prayers.data ?? [], prayerTags.data ?? []),
    [state, notes.data, noteTags.data, prayers.data, prayerTags.data],
  );
  const questions = useMemo(() => [...new Set(entries.filter((e) => !e.lesson.review).flatMap((e) => e.lesson.questions))], [entries]);
  const answers = useCatechismAnswers(questions);
  const loaded = [notes, noteTags, prayers, prayerTags].every((q) => q.data != null || q.isError);
  usePrintWhen(loaded && answers != null && books != null, onDone);

  const today = new Date().toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });

  return createPortal(
    <div className="print-root print-only" aria-hidden="true">
      <div style={page}>
        <h1 style={h1}>My catechism notebook</h1>
        <p style={sub}>The Westminster Shorter Catechism · {today}</p>
        {entries.length === 0 && <p>No lessons begun yet.</p>}
        {entries.map(({ lesson, notes: mine, prayers: prayed }) => {
          const p = state.lessons[lesson.id]!;
          const quiz = Object.values(p.quiz)[0];
          return (
            <section key={lesson.id} style={{ breakInside: "avoid-page" }}>
              <h2 style={h2}>
                Lesson {lesson.number}. {lesson.title}
                <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: "normal" }}>
                  {" "}
                  · {lesson.review ? `Review of ${questionsLabel(lesson)}` : questionsLabel(lesson)}
                  {p.completedAt ? ` · finished ${new Date(p.completedAt).toLocaleDateString()}` : ""}
                </span>
              </h2>
              {!lesson.review &&
                lesson.questions.map((n) => {
                  const s = answers?.get(n);
                  return s ? (
                    <div key={n} style={{ margin: "0 0 4pt", breakInside: "avoid" }}>
                      <span style={muted}>Q. {n}. </span>
                      <strong>{s.prompt}</strong> {s.body}
                    </div>
                  ) : null;
                })}
              {p.answers.before?.trim() && (
                <p style={{ margin: "6pt 0 0" }}>
                  <em>Before the lesson I wrote:</em> {p.answers.before.trim()}
                </p>
              )}
              {p.answers.then?.trim() && (
                <p style={{ margin: "6pt 0 0" }}>
                  <em>Now I would say:</em> {p.answers.then.trim()}
                </p>
              )}
              {mine.map((n) => (
                <p key={n.id} style={{ margin: "6pt 0 0" }}>
                  <em>Note on {refLabel(books, { book: n.book_id, chapter: n.chapter, verse: n.verse_start, to: n.verse_end !== n.verse_start ? n.verse_end : undefined })}:</em>{" "}
                  {textOf(n.body)}
                </p>
              ))}
              {prayed.map((e) => (
                <p key={e.id} style={{ margin: "6pt 0 0", whiteSpace: "pre-line" }}>
                  <em>Prayer, {new Date(`${e.entry_date}T12:00:00`).toLocaleDateString()}:</em> {prayerText(e)}
                </p>
              ))}
              {quiz && (
                <p style={{ margin: "6pt 0 0", fontSize: "10pt", ...muted }}>
                  Check: {quiz.score} of {quiz.of} right.
                </p>
              )}
            </section>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}
