import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BookOpenCheck, Check, ChevronLeft, CircleCheck, ExternalLink, LayoutPanelLeft, Lightbulb, Printer, Users } from "lucide-react";
import { api } from "../../api/client";
import {
  useAddNoteTag,
  useAddPrayerEntryTag,
  useBooks,
  useCommentarySources,
  useCreateCatechismMemory,
  useCreateNote,
  useCreatePrayerEntry,
} from "../../api/queries";
import { Button } from "../../components/ui/Button";
import { cardClass, cx, linkClass, pageClass, sectionLabelClass, textareaClass } from "../../components/ui/classes";
import { toast } from "../../components/ui/toast";
import { bookName } from "../../lib/passage";
import { escapeHtml } from "../../lib/escapeHtml";
import { usePane, usePaneParams } from "../../workspace/PaneContext";
import { useAddToMemory } from "../memory/useAddToMemory";
import { localDate } from "../family/familyWorship";
import {
  questionsLabel,
  unitOf,
  UNITS,
  lessonById,
  lessonTag,
  markDone,
  nextLesson,
  overlaps,
  scoreQuiz,
  sectionId,
  stepsDone,
  unmarkDone,
  type GuideState,
  type HenryAsk,
  type Lesson,
  type LessonProgress,
  type Passage,
  type QuizQuestion,
  type Step,
  type StepOpen,
} from "./course";
import { useLiveCheck } from "./checks";
import { layOutLesson, openStep } from "./openStep";
import { DeeperSection } from "./DeeperSection";
import { LessonSheet, NotebookSheet } from "./GuidePrint";
import { useGuide, useHenryQuestions } from "./useGuideData";

export function GuideView() {
  const [params] = usePaneParams("guide");
  const lesson = params.lessonId ? lessonById(params.lessonId) : undefined;
  return <div className="h-full overflow-y-auto">{lesson ? <LessonView lesson={lesson} /> : <CourseView />}</div>;
}

// ---------------------------------------------------------------------------
// The course

function CourseView() {
  const { state, setState } = useGuide();
  const [, setParams] = usePaneParams("guide");
  const [printing, setPrinting] = useState(false);
  const next = nextLesson(state);
  const nextStarted = next ? state.lessons[next.id] : undefined;
  const begun = Object.keys(state.lessons).length > 0;

  return (
    <div className={pageClass}>
      <p className={sectionLabelClass}>Guided study</p>
      <h1 className="reading-font mb-2 text-2xl font-semibold text-ink">The Westminster Shorter Catechism</h1>
      <p className="mb-6 text-sm text-ink-2">
        A course through the Catechism, question by question. Each lesson walks you through the Scripture behind an answer with the app’s own
        tools: the Bible, word study, cross references, the Confessions, the old commentators, notes, memory and prayer. Take a lesson when you have
        time; nothing here keeps count of days.
      </p>

      {next && (
        <div className={cx(cardClass, "mb-8 flex flex-wrap items-center gap-3")}>
          <div className="min-w-[12rem] flex-1">
            <p className="text-xs text-ink-3">{nextStarted ? "Continue" : "Begin"}</p>
            <p className="font-medium text-ink">
              Lesson {next.number}: {next.title}
            </p>
            {nextStarted && (
              <p className="text-xs text-ink-3">
                {stepsDone(next, nextStarted).done} of {stepsDone(next, nextStarted).of} steps done
              </p>
            )}
          </div>
          <Button variant="primary" icon={ArrowRight} onClick={() => setParams({ lessonId: next.id })}>
            {nextStarted ? "Continue" : "Begin"}
          </Button>
        </div>
      )}

      <div className="mb-8 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button
          icon={Printer}
          disabled={!begun}
          onClick={() => setPrinting(true)}
          title={begun ? "Print the answers you have learned, with what you wrote, your notes and prayers, lesson by lesson" : "Begin a lesson first"}
        >
          Print my notebook
        </Button>
        <label className="flex items-center gap-2 text-sm text-ink-2">
          <input
            type="checkbox"
            className="accent-accent"
            checked={!!state.leader}
            onChange={(e) => setState((prev) => ({ ...prev, leader: e.target.checked }))}
          />
          <Users className="h-4 w-4 text-ink-4" aria-hidden="true" />I lead a class or family through these lessons
        </label>
      </div>
      {printing && <NotebookSheet state={state} onDone={() => setPrinting(false)} />}

      {UNITS.map((unit, i) => (
        <section key={unit.title} className="mb-6">
          <h2 className="mb-0.5 text-base font-semibold text-ink">
            Unit {i + 1}. {unit.title}
          </h2>
          <p className="mb-2 text-sm text-ink-3">{unit.summary}</p>
          {unit.lessons.length === 0 ? (
            <p className="text-sm italic text-ink-4">Lessons still being written.</p>
          ) : (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {unit.lessons.map((l) => {
                const p = state.lessons[l.id];
                const { done, of } = stepsDone(l, p);
                return (
                  <li key={l.id}>
                    <button
                      type="button"
                      onClick={() => setParams({ lessonId: l.id })}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-hover"
                    >
                      <span className="w-6 shrink-0 text-right text-sm tabular-nums text-ink-3">{l.number}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-ink">{l.title}</span>
                        <span className="block text-xs text-ink-3">{l.review ? `Review of ${questionsLabel(l)}` : questionsLabel(l)}</span>
                      </span>
                      {p?.completedAt ? (
                        <CircleCheck className="h-4 w-4 shrink-0 text-accent" aria-label="Finished" />
                      ) : p ? (
                        <span className="shrink-0 text-xs tabular-nums text-ink-3">
                          {done}/{of}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// One lesson

function LessonView({ lesson }: { lesson: Lesson }) {
  const { state, setState, isLoaded, update } = useGuide();
  const [printing, setPrinting] = useState<"class" | "leader" | null>(null);
  const [, setParams] = usePaneParams("guide");
  const { data: commentarySources } = useCommentarySources();
  const progress = state.lessons[lesson.id];

  // Opening a lesson starts it (its start time is what "written since the
  // lesson began" means) and makes it the one to continue. Only once the
  // stored progress has loaded, or the default would be written over it.
  useEffect(() => {
    if (isLoaded && (!state.lessons[lesson.id] || state.current !== lesson.id)) update(lesson.id, (p) => p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, lesson.id]);

  const { done, of } = stepsDone(lesson, progress);
  const after = UNITS.flatMap((u) => u.lessons).find((l) => l.number === lesson.number + 1);

  return (
    <div className={pageClass}>
      <button type="button" onClick={() => setParams({ lessonId: null })} className={cx(linkClass, "mb-3 inline-flex items-center gap-1 text-sm")}>
        <ChevronLeft className="h-4 w-4" aria-hidden="true" /> All lessons
      </button>
      <p className={sectionLabelClass}>
        Lesson {lesson.number} · {lesson.review ? "Review of" : "Shorter Catechism"} {questionsLabel(lesson)}
      </p>
      <h1 className="reading-font mb-2 text-2xl font-semibold text-ink">{lesson.title}</h1>
      <p className="mb-4 text-sm text-ink-2">{lesson.intro}</p>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Button variant="primary" icon={LayoutPanelLeft} onClick={() => layOutLesson(lesson, commentarySources)}>
          Lay out the panes for this lesson
        </Button>
        <span className="text-sm tabular-nums text-ink-3">
          {done} of {of} steps done
        </span>
      </div>
      {state.leader && !lesson.review && (
        <div className={cx(cardClass, "mb-6")}>
          <p className="flex items-center gap-2 text-sm font-medium text-ink">
            <Users className="h-4 w-4 text-ink-4" aria-hidden="true" /> Leading this lesson
          </p>
          <p className="mt-1 text-sm text-ink-2">
            The handout has the opening question, the passages, the Catechism’s answers, the lesson’s questions with room to write, and what to learn by
            heart. Your copy adds a plan for the hour and the answers.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" icon={Printer} onClick={() => setPrinting("class")}>
              Print the handout
            </Button>
            <Button size="sm" icon={BookOpenCheck} onClick={() => setPrinting("leader")}>
              Print the leader’s copy
            </Button>
          </div>
        </div>
      )}
      {printing && <LessonSheet lesson={lesson} leader={printing === "leader"} onDone={() => setPrinting(null)} />}

      <ol className="space-y-3">
        {lesson.steps.map((step, i) => (
          <StepCard key={step.id} lesson={lesson} step={step} index={i} guide={state} progress={progress} update={(c) => update(lesson.id, c)} />
        ))}
      </ol>

      <DeeperSection
        lesson={lesson}
        open={!!state.deeper}
        onToggle={() => setState((prev) => ({ ...prev, deeper: !prev.deeper }))}
        progress={progress}
        update={(c) => update(lesson.id, c)}
      />

      <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-4">
        {progress?.completedAt ? (
          <p className="flex items-center gap-1.5 text-sm text-ink-2">
            <CircleCheck className="h-4 w-4 text-accent" aria-hidden="true" /> Finished {new Date(progress.completedAt).toLocaleDateString()}
          </p>
        ) : (
          <Button
            variant={done === of ? "primary" : "secondary"}
            icon={Check}
            onClick={() => update(lesson.id, (p) => ({ ...p, completedAt: new Date().toISOString() }))}
          >
            Finish this lesson
          </Button>
        )}
        {after && (
          <Button variant="ghost" icon={ArrowRight} onClick={() => setParams({ lessonId: after.id })}>
            Lesson {after.number}: {after.title}
          </Button>
        )}
      </div>
    </div>
  );
}

function openLabel(open: StepOpen, books: ReturnType<typeof useBooks>["data"]): string {
  const ref = (p: Passage) => `${bookName(books, p.book)} ${p.chapter}${p.verse ? `:${p.verse}${p.to ? `–${p.to}` : ""}` : ""}`;
  switch (open.pane) {
    case "bible":
      return `Open ${ref(open.passage)}`;
    case "interlinear":
      return `Interlinear on ${ref(open.passage)}`;
    case "crossrefs":
      return `Cross references on ${ref(open.passage)}`;
    case "confession-for-passage":
      return `Confessions on ${ref(open.passage)}`;
    case "westminster":
      return `Open ${open.doc.toUpperCase()} ${open.n}${open.section ? `.${open.section}` : ""}`;
    case "wordstudy":
      return `Word study ${open.strongs}`;
    case "lexicon":
      return `Lexicon ${open.strongs}`;
    case "webster":
      return `Webster: “${open.word}”`;
    case "psalter":
      return `Psalm ${open.psalm}`;
    case "search":
      return `Search “${open.query.replace(/"/g, "")}”`;
    case "book":
      return `Open ${open.title}`;
    case "commentary":
      return `Commentary on ${ref(open.passage)}`;
    case "citations":
      return `Cited in your library: ${ref(open.passage)}`;
    case "factbook-for-passage":
      return `People and places in ${ref(open.passage)}`;
    case "timeline-for-passage":
      return `Timeline for ${ref(open.passage)}`;
    case "encyclopedia-for-passage":
      return `Encyclopedia on ${ref(open.passage)}`;
    case "factbook":
      return "Open the Factbook";
    case "atlas":
      return "Open the Atlas";
    case "encyclopedia":
      return "Open the encyclopedia";
    case "timeline":
      return "Open the Timeline";
    case "memory":
      return "Open Memory";
    case "prayer":
      return "Open the prayer journal";
    case "notes":
      return "Open Notes";
    case "highlights":
      return "Open Highlights";
    case "harmony":
      return "Open the Harmony";
    case "sermons":
      return "Open Sermons";
  }
}

function StepCard({
  lesson,
  step,
  index,
  guide,
  progress,
  update,
}: {
  lesson: Lesson;
  step: Step;
  index: number;
  guide: GuideState;
  progress: LessonProgress | undefined;
  update: (change: (p: LessonProgress) => LessonProgress) => void;
}) {
  const { id: paneId } = usePane();
  const { data: books } = useBooks();
  const live = useLiveCheck(step.check, progress?.startedAt);
  const done = !!progress?.done[step.id];
  const now = () => new Date().toISOString();

  // Work found in the student's own content ticks the step, and it stays
  // ticked: deleting the highlight later does not undo a lesson.
  useEffect(() => {
    if (live && progress && !done) update((p) => markDone(p, step.id, now()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, !!progress, done]);

  const open = step.open;
  return (
    <li className={cx(cardClass, done && "border-accent/30")}>
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => update((p) => (done ? unmarkDone(p, step.id) : markDone(p, step.id, now())))}
          className={cx(
            "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums",
            done ? "border-accent bg-accent text-white" : "border-line text-ink-3 hover:border-accent hover:text-accent",
          )}
          title={done ? "Done (click to undo)" : "Mark done"}
          aria-label={done ? `Step ${index + 1} done; mark not done` : `Mark step ${index + 1} done`}
          aria-pressed={done}
        >
          {done ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : index + 1}
        </button>
        <div className="min-w-0 flex-1">
          <h3 className="font-medium text-ink">
            {step.title}
            {step.optional && <span className="ml-2 text-xs font-normal text-ink-4">optional</span>}
          </h3>
          {step.text.split(/\n\s*\n/).map((para, i) => (
            <p key={i} className="mt-1 text-sm text-ink-2">
              {para}
            </p>
          ))}
          {step.tip && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-ink-3">
              <Lightbulb className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {step.tip}
            </p>
          )}
          {open && (
            <div className="mt-2">
              <Button
                size="sm"
                icon={ExternalLink}
                onClick={async () => {
                  await openStep(open, paneId);
                  if (step.check?.type === "opened") update((p) => markDone(p, step.id, now()));
                }}
              >
                {step.openLabel ?? openLabel(open, books)}
              </Button>
            </div>
          )}
          {step.check?.type === "reflect" && <Then lesson={lesson} guide={guide} />}
          {(step.check?.type === "answer" || step.check?.type === "reflect") && (
            <AnswerBox
              initial={progress?.answers[step.id] ?? ""}
              placeholder={step.check.type === "answer" ? step.check.placeholder : "Now I would say…"}
              onSave={(text) =>
                update((p) => {
                  const next = { ...p, answers: { ...p.answers, [step.id]: text } };
                  return text.trim() ? markDone(next, step.id, now()) : unmarkDone(next, step.id);
                })
              }
            />
          )}
          {step.check?.type === "quiz" && (
            <Quiz
              questions={step.check.questions}
              henry={step.check.henry ?? []}
              saved={progress?.quiz[step.id]?.picks}
              onSubmit={(picks, questions) =>
                update((p) => markDone({ ...p, quiz: { ...p.quiz, [step.id]: scoreQuiz(questions, picks) } }, step.id, now()))
              }
            />
          )}
          {step.check?.type === "note" && !done && <QuickNote passage={step.check.passage} tag={step.check.tag} />}
          {step.check?.type === "memory" && <MemoryButtons questions={step.check.questions ?? []} verse={step.check.verse} />}
          {step.check?.type === "prayer" && !done && <QuickPrayer tag={lessonTag(lesson)} />}
        </div>
      </div>
    </li>
  );
}

/** What the student wrote before each lesson of the unit. */
function Then({ lesson, guide }: { lesson: Lesson; guide: GuideState }) {
  const lessons = (unitOf(lesson)?.lessons ?? []).filter((l) => !l.review);
  const written = lessons.filter((l) => guide.lessons[l.id]?.answers.before?.trim());
  if (written.length === 0) return <p className="mt-2 text-sm italic text-ink-3">You have no “before you read” answers in this unit yet.</p>;
  return (
    <ul className="mt-2 space-y-2">
      {written.map((l) => (
        <li key={l.id} className="rounded-md bg-surface-2 px-3 py-2 text-sm">
          <span className="block text-xs text-ink-3">
            Lesson {l.number}: {l.title}
          </span>
          <span className="text-ink-2">“{guide.lessons[l.id]!.answers.before.trim()}”</span>
        </li>
      ))}
    </ul>
  );
}

function AnswerBox({ initial, placeholder, onSave }: { initial: string; placeholder?: string; onSave: (text: string) => void }) {
  const [text, setText] = useState(initial);
  useEffect(() => setText(initial), [initial]);
  return (
    <textarea
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => text !== initial && onSave(text)}
      placeholder={placeholder}
      rows={3}
      className={cx(textareaClass, "mt-2 w-full")}
      aria-label="Your answer"
    />
  );
}

function Quiz({
  questions: own,
  henry,
  saved,
  onSubmit,
}: {
  questions: QuizQuestion[];
  henry: HenryAsk[];
  saved: number[] | undefined;
  onSubmit: (picks: number[], questions: QuizQuestion[]) => void;
}) {
  const henryQuestions = useHenryQuestions(henry);
  const questions = useMemo(() => [...own, ...henryQuestions], [own, henryQuestions]);
  const [picks, setPicks] = useState<number[]>(saved ?? []);
  const [shown, setShown] = useState(saved != null);
  const all = questions.every((_, i) => picks[i] != null);
  const score = questions.filter((q, i) => picks[i] === q.answer).length;

  return (
    <div className="mt-3 space-y-4">
      {questions.map((q, qi) => (
        <fieldset key={qi}>
          <legend className="mb-1 text-sm font-medium text-ink">
            {qi + 1}. {q.q}
          </legend>
          <div className="space-y-1">
            {q.choices.map((c, ci) => {
              const picked = picks[qi] === ci;
              const right = shown && ci === q.answer;
              const wrong = shown && picked && ci !== q.answer;
              return (
                <label
                  key={ci}
                  className={cx(
                    "flex cursor-pointer items-start gap-2 rounded-md px-2 py-1 text-sm",
                    right ? "bg-accent-soft text-ink" : wrong ? "bg-warn-soft text-ink" : "text-ink-2 hover:bg-hover",
                  )}
                >
                  <input
                    type="radio"
                    name={`q${qi}`}
                    className="mt-1 accent-accent"
                    checked={picked}
                    onChange={() => {
                      setPicks((prev) => Object.assign([...prev], { [qi]: ci }));
                      setShown(false);
                    }}
                  />
                  {c}
                </label>
              );
            })}
          </div>
          {shown && q.why && <p className="mt-1 pl-2 text-xs text-ink-3">{q.why}</p>}
        </fieldset>
      ))}
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          disabled={!all}
          onClick={() => {
            setShown(true);
            onSubmit(picks, questions);
          }}
        >
          Check answers
        </Button>
        {shown && (
          <span className="text-sm text-ink-2">
            {score} of {questions.length} right
          </span>
        )}
      </div>
    </div>
  );
}

/** Writing the step's note without leaving the Guide: an ordinary verse
 * note, tagged with the lesson. */
function QuickNote({ passage, tag }: { passage: Passage; tag: string }) {
  const [text, setText] = useState("");
  const createNote = useCreateNote();
  const addTag = useAddNoteTag();
  const save = async () => {
    const verse = passage.verse ?? 1;
    const body = text
      .split(/\n\s*\n/)
      .map((p) => `<p>${escapeHtml(p.trim())}</p>`)
      .join("");
    const note = await createNote.mutateAsync({ bookId: passage.book, chapter: passage.chapter, verseStart: verse, verseEnd: passage.to ?? verse, body });
    await addTag.mutateAsync({ noteId: note.id, tag });
    setText("");
  };
  return (
    <details className="mt-2 text-sm">
      <summary className={cx(linkClass, "cursor-pointer")}>Or write it here</summary>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} className={cx(textareaClass, "mt-2 w-full")} aria-label="Your note" />
      <Button size="sm" className="mt-1" disabled={!text.trim() || createNote.isPending} onClick={save}>
        Save as a note
      </Button>
    </details>
  );
}

function MemoryButtons({ questions, verse }: { questions: number[]; verse?: Passage }) {
  const { data: books } = useBooks();
  const { data: catechismCards } = useQuery({ queryKey: ["catechismMemory"], queryFn: api.listCatechismMemory });
  const { data: verseCards } = useQuery({ queryKey: ["memoryVerses"], queryFn: api.listMemoryVerses });
  const createCatechism = useCreateCatechismMemory();
  const addToMemory = useAddToMemory();
  const learning = new Set((catechismCards ?? []).map((c) => c.westminster_section_id));
  const hasVerse = verse != null && (verseCards ?? []).some((c) => overlaps(verse, c.book_id, c.chapter, c.verse_start, c.verse_end));
  const verseLabel = verse
    ? `${bookName(books, verse.book)} ${verse.chapter}${verse.verse ? `:${verse.verse}${verse.to ? `-${verse.to}` : ""}` : ""}`
    : "";

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {questions.map((question) => {
        const has = learning.has(sectionId("wsc", question));
        return (
          <Button
            key={question}
            size="sm"
            icon={has ? Check : undefined}
            disabled={has || createCatechism.isPending || !catechismCards}
            onClick={() => createCatechism.mutate({ westminsterSectionId: sectionId("wsc", question), mode: "first-letter" })}
          >
            {has ? `Question ${question} is in your memory` : `Learn Question ${question}`}
          </Button>
        );
      })}
      {verse && (
        <Button
          size="sm"
          icon={hasVerse ? Check : undefined}
          disabled={hasVerse || !books || !verseCards}
          onClick={async () => {
            const r = await addToMemory(verseLabel, { setName: "Guided study" });
            if (!r.ok) toast.error(r.error);
          }}
        >
          {hasVerse ? `${verseLabel} is in your memory` : `Learn ${verseLabel}`}
        </Button>
      )}
    </div>
  );
}

/** A prayer written here goes into the prayer journal, tagged with the lesson. */
function QuickPrayer({ tag }: { tag: string }) {
  const [text, setText] = useState("");
  const createEntry = useCreatePrayerEntry();
  const addTag = useAddPrayerEntryTag();
  const save = async () => {
    const entry = await createEntry.mutateAsync({ entryDate: localDate(), mode: "free", freeText: text.trim() });
    await addTag.mutateAsync({ prayerEntryId: entry.id, tag });
    setText("");
  };
  return (
    <details className="mt-2 text-sm">
      <summary className={cx(linkClass, "cursor-pointer")}>Or write it here</summary>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} className={cx(textareaClass, "mt-2 w-full")} aria-label="Your prayer" />
      <Button size="sm" className="mt-1" disabled={!text.trim() || createEntry.isPending} onClick={save}>
        Save to the prayer journal
      </Button>
    </details>
  );
}
