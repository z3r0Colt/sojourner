import { onDesktop } from "../../lib/platform";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, BookOpen, Brain, HandHeart, HouseHeart, Maximize2, Music, Play, Plus, Printer, ScrollText, X } from "lucide-react";
import { useBooks, usePrayerListPeople, useReadingPlanDays, useReadingPlans } from "../../api/queries";
import { Page } from "../../components/ui/Page";
import { Button, IconButton } from "../../components/ui/Button";
import { LoadingState } from "../../components/ui/EmptyState";
import { confirmDialog } from "../../components/ui/confirm";
import { cardClass, checkboxClass, cx, inputClass, linkClass, sectionLabelClass, selectClass } from "../../components/ui/classes";
import { openContent, openPassage, targetFor } from "../../workspace/openContent";
import { ReadingRefs } from "../plans/ReadingPlansView";
import { FamilySession } from "./FamilySession";
import { FamilyWeekSheet } from "./FamilyWeekSheet";
import { DayGrid } from "../../components/ui/DayGrid";
import { FamilyGuide, FurtherReading } from "./FamilyGuide";
import { useFamilySession } from "./sessionStore";
import { useFamilyWorship } from "./useFamilyWorship";
import { lessonForQuestion, wscQuestion, type Lesson } from "../guide/course";
import { toast } from "../../components/ui/toast";
import { parseReference, useBookLookup } from "../../hooks/useReferenceParser";
import { MEMORY_SETS } from "../memory/memorySets";
import { useAddToMemory } from "../memory/useAddToMemory";
import { api } from "../../api/client";
import { useReaderTranslationId } from "../../state/workspaceStore";
import {
  FAMILY_CATECHISMS,
  MAX_TALK_QUESTIONS,
  MAX_TALK_QUESTION_LENGTH,
  PACES,
  STARTER_PLAN,
  STARTER_PSALMS,
  STARTER_TITLES,
  addTalkQuestion,
  customState,
  editTalkQuestion,
  guessPrayerCategory,
  hasOwnTalkQuestions,
  insertTalkQuestion,
  localDate,
  logSummary,
  moveTalkQuestion,
  nextPsalm,
  psalmWeekDue,
  removeTalkQuestion,
  repeatedTalkQuestion,
  starterState,
  talkQuestionTag,
  talkQuestions,
  upcomingDays,
  withTalkQuestions,
  type FamilyWorship,
} from "./familyWorship";

/**
 * The Family worship page: set up once, then one place to begin each day's
 * gathering from -- tonight's reading, psalm, question and names, the week
 * ahead, a quiet log, and what the family uses. A family that has not set it
 * up yet gets the guide and the first four weeks in one step.
 */
export function FamilyWorshipView() {
  const fw = useFamilyWorship();
  const session = useFamilySession();

  if (!fw.isLoaded) return <LoadingState className="py-10" />;
  if (!fw.state) return <Welcome onStart={fw.setState} />;
  if (session.active && !session.large) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-6">
        <FamilySession large={false} />
      </div>
    );
  }
  return <Overview fw={fw} />;
}

type FW = ReturnType<typeof useFamilyWorship>;

function Welcome({ onStart }: { onStart: (s: FamilyWorship) => void }) {
  const { data: people } = usePrayerListPeople();
  const [catechism, setCatechism] = useState("cyc");
  const category = guessPrayerCategory((people ?? []).map((p) => p.category));

  return (
    <Page title="Family worship" lead="A few minutes each day when the household gathers to hear God's word, sing his praise, learn the faith, and pray.">
      <section className={cx(cardClass, "mb-6 p-5")}>
        <div className="mb-3 flex items-center gap-2">
          <HouseHeart className="h-5 w-5 text-accent" aria-hidden="true" />
          <h2 className="text-base font-semibold text-ink">Start with the first four weeks</h2>
        </div>
        <ul className="mb-4 space-y-1.5 text-sm text-ink-2">
          <li className="flex gap-2">
            <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-ink-4" aria-hidden="true" />
            <span>
              <strong className="font-medium text-ink">Read:</strong> 28 short readings, the Bible's story from creation to the new creation, most of them ten to
              twenty verses.
            </span>
          </li>
          <li className="flex gap-2">
            <Music className="mt-0.5 h-4 w-4 shrink-0 text-ink-4" aria-hidden="true" />
            <span>
              <strong className="font-medium text-ink">Sing:</strong> one psalm a week from the 1650 Scottish Psalter: {STARTER_PSALMS.map((n) => `Psalm ${n}`).join(", ")}, with
              the tune to play and sing along to.
            </span>
          </li>
          <li className="flex gap-2">
            <ScrollText className="mt-0.5 h-4 w-4 shrink-0 text-ink-4" aria-hidden="true" />
            <span>
              <strong className="font-medium text-ink">Catechism:</strong> a new question every other time, going over the last few each time.
            </span>
          </li>
          <li className="flex gap-2">
            <HandHeart className="mt-0.5 h-4 w-4 shrink-0 text-ink-4" aria-hidden="true" />
            <span>
              <strong className="font-medium text-ink">Pray:</strong> a simple order to follow, and three names each time from your prayer list
              {category ? ` (the “${category}” category)` : ""}.
            </span>
          </li>
        </ul>
        <fieldset className="mb-4">
          <legend className={cx(sectionLabelClass, "mb-1.5")}>Which catechism?</legend>
          <div className="space-y-1.5">
            {FAMILY_CATECHISMS.slice(0, 2).map((c) => (
              <label key={c.code} className="flex cursor-pointer items-start gap-2 text-sm">
                <input type="radio" name="family-catechism" className="mt-1 accent-accent" checked={catechism === c.code} onChange={() => setCatechism(c.code)} />
                <span>
                  <span className="font-medium text-ink">{c.label}</span>
                  <span className="block text-ink-3">{c.note}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" icon={Play} onClick={() => onStart(starterState(catechism, category))}>
            Start the first four weeks
          </Button>
          <button type="button" className={cx(linkClass, "text-sm")} onClick={() => onStart(customState(category))}>
            Or choose our own reading, psalm and catechism
          </button>
        </div>
      </section>

      <section className="mb-6">
        <h2 className={cx(sectionLabelClass, "mb-3")}>New to family worship?</h2>
        <FamilyGuide columns />
      </section>

      <section>
        <h2 className={cx(sectionLabelClass, "mb-3")}>Further reading</h2>
        <FurtherReading />
      </section>
    </Page>
  );
}

function Overview({ fw }: { fw: FW }) {
  const { state, setState, tonight, log, gatheredToday } = fw;
  const begin = useFamilySession((s) => s.begin);
  const [printing, setPrinting] = useState(false);
  const donePrinting = useCallback(() => setPrinting(false), []);
  if (!state || !tonight) return null;

  return (
    <Page
      title="Family worship"
      lead={logSummary(log)}
      actions={
        // Printing is the desktop's: a browser on another device leaves it out.
        onDesktop && (
          <Button icon={Printer} onClick={() => setPrinting(true)} title="Print the week: readings, the psalm, the catechism questions, and the names to pray for">
            Print this week
          </Button>
        )
      }
    >
      <section className="mb-7">
        <h2 className={cx(sectionLabelClass, "mb-2")}>{gatheredToday ? "Gathered today · next time" : "Today"}</h2>
        <div className={cx(cardClass, "p-4")}>
          <TonightSummary fw={fw} />
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button variant="primary" icon={Play} onClick={() => begin()}>
              {gatheredToday ? "Gather again" : "Begin"}
            </Button>
            <Button icon={Maximize2} onClick={() => begin({ large: true })} title="Fill the screen with large type, for a table or a television">
              Gather round
            </Button>
            <span className="text-xs text-ink-3">Gather round fills the screen in large type, for the table or the television.</span>
          </div>
        </div>
        <Nudges fw={fw} />
      </section>

      <WeekAhead fw={fw} />

      <section className="mb-7">
        <h2 className={cx(sectionLabelClass, "mb-2")}>The last five weeks</h2>
        <DayGrid log={log} label="Days gathered in the last five weeks" did="gathered" />
        <p className="mt-1.5 text-xs text-ink-3">A dot for each day the family gathered. Missed days are just days; begin again whenever you can.</p>
      </section>

      <section className="mb-7">
        <h2 className={cx(sectionLabelClass, "mb-2")}>What we use</h2>
        <FamilySettings fw={fw} />
      </section>

      <details className="mb-7">
        <summary className={cx(sectionLabelClass, "cursor-pointer select-none")}>New to family worship? A few words of help</summary>
        <div className="mt-3">
          <FamilyGuide />
        </div>
      </details>

      <section className="mb-7">
        <h2 className={cx(sectionLabelClass, "mb-2")}>Further reading</h2>
        <FurtherReading />
      </section>

      <div className="border-t border-line pt-4">
        <Button
          size="sm"
          variant="danger-ghost"
          onClick={async () => {
            // A family's own questions are words it wrote, not a place kept,
            // and a new setup begins on faith, love and hope; say so.
            const ownQuestions = hasOwnTalkQuestions(state) ? ", and your own questions to talk about" : "";
            const ok = await confirmDialog({
              title: "Stop family worship?",
              message: `This clears the family's reading place, psalm and catechism${ownQuestions}. The log of days gathered is kept, and you can set it up again any time.`,
              confirmLabel: "Stop",
            });
            if (ok) setState(null);
          }}
        >
          Start over
        </Button>
      </div>

      {printing && <FamilyWeekSheet onDone={donePrinting} />}
    </Page>
  );
}

/** Tonight at a glance: each part on a line of its own. */
export function TonightSummary({ fw, compact }: { fw: FW; compact?: boolean }) {
  const { state, tonight } = fw;
  const { data: books } = useBooks();
  if (!state || !tonight) return null;
  const reading = tonight.planDone
    ? `${tonight.plan?.title ?? "The plan"} is finished`
    : tonight.day
      ? `${tonight.day.readings.map((r) => r.label).join("; ")}${tonight.readingTitle ? ` · ${tonight.readingTitle}` : ""}`
      : null;
  const rows: { icon: typeof BookOpen; label: string; text: string; lesson?: Lesson }[] = [];
  if (state.plan && reading) rows.push({ icon: BookOpen, label: "Read", text: reading });
  if (tonight.psalm != null) rows.push({ icon: Music, label: "Sing", text: `Psalm ${tonight.psalm}` });
  if (tonight.learning) {
    // The Shorter Catechism's question is taught in the guided study, for
    // whoever leads to prepare from.
    const question = state.catechism?.code === "wsc" ? wscQuestion(tonight.learning.id) : null;
    const lesson = question != null ? lessonForQuestion(question) : undefined;
    rows.push({ icon: ScrollText, label: "Catechism", text: `${tonight.learning.heading} of the ${tonight.catechismTitle}`, lesson });
  }
  if (state.memory) {
    const m = state.memory;
    const book = books?.find((b) => b.id === m.bookId)?.name ?? "";
    rows.push({ icon: Brain, label: "Memorize", text: `${book} ${m.chapter}:${m.verseStart}${m.verseEnd !== m.verseStart ? `-${m.verseEnd}` : ""}` });
  }
  rows.push({
    icon: HandHeart,
    label: "Pray",
    text: tonight.prayFor.length ? `for ${tonight.prayFor.map((p) => p.name).join(", ")}` : "Add names to pray for on the Pray step",
  });
  return (
    <ul className={cx("space-y-1", compact ? "text-sm" : "text-sm sm:text-base")}>
      {rows.map((r) => (
        <li key={r.label} className="flex items-start gap-2">
          <r.icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-4" aria-hidden="true" />
          <span className="w-20 shrink-0 text-ink-3">{r.label}</span>
          <span className="min-w-0 flex-1 text-ink">
            {r.text}
            {r.lesson && (
              <>
                {" · "}
                <button
                  type="button"
                  className={cx(linkClass, "text-sm")}
                  title="Study this question first in the guided study, or print its lesson as a handout"
                  onClick={(e) => openContent("guide", { lessonId: r.lesson!.id }, { target: targetFor(e, "new") })}
                >
                  Lesson {r.lesson.number} in the guided study
                </button>
              </>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The few times the family has a choice to make: a psalm sung a week, a
 * plan or a catechism finished. Offered, never pressed. */
function Nudges({ fw }: { fw: FW }) {
  const { state, setState, tonight } = fw;
  const { data: plans } = useReadingPlans();
  const [nextPlan, setNextPlan] = useState("");
  if (!state || !tonight) return null;
  const out: React.ReactNode[] = [];

  if (state.singing && state.psalm && psalmWeekDue(state)) {
    const n = state.psalm.number;
    out.push(
      <div key="psalm" className="flex flex-wrap items-center gap-2">
        <Music className="h-4 w-4 text-ink-4" aria-hidden="true" />
        <span className="flex-1">You have been singing Psalm {n} for a week or more. Keep it until it is learned, or move on.</span>
        <Button size="sm" onClick={() => setState({ ...state, psalm: { number: nextPsalm(n), since: localDate() } })}>
          Move on to Psalm {nextPsalm(n)}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setState({ ...state, psalm: { number: n, since: localDate() } })}>
          Keep Psalm {n}
        </Button>
      </div>,
    );
  }

  if (tonight.planDone) {
    const others = (plans ?? []).filter((p) => p.code !== state.plan?.code);
    out.push(
      <div key="plan" className="flex flex-wrap items-center gap-2">
        <BookOpen className="h-4 w-4 text-ink-4" aria-hidden="true" />
        <span className="flex-1">
          You have read all of {tonight.plan?.title}.{" "}
          {state.plan?.code === STARTER_PLAN && "Well done. Next, try Psalms and Wisdom, a Gospel a chapter at a time (New plan on the Reading plans page), or another of the plans."}
        </span>
        <select className={selectClass} value={nextPlan} onChange={(e) => setNextPlan(e.target.value)} aria-label="Next plan">
          <option value="">Choose what to read next…</option>
          {others.map((p) => (
            <option key={p.code} value={p.code}>
              {p.title}
            </option>
          ))}
        </select>
        <Button size="sm" variant="primary" disabled={!nextPlan} onClick={() => setState({ ...state, plan: { code: nextPlan, nextDay: 1 }, starter: false })}>
          Start it
        </Button>
      </div>,
    );
  }

  if (tonight.catechismDone && state.catechism) {
    const cat = state.catechism;
    const next = FAMILY_CATECHISMS[FAMILY_CATECHISMS.findIndex((c) => c.code === cat.code) + 1];
    out.push(
      <div key="catechism" className="flex flex-wrap items-center gap-2">
        <ScrollText className="h-4 w-4 text-ink-4" aria-hidden="true" />
        <span className="flex-1">The family has been through the whole {tonight.catechismTitle}.</span>
        <Button size="sm" onClick={() => setState({ ...state, catechism: { ...cat, current: 0, timesOnCurrent: 0 } })}>
          Go through it again
        </Button>
        {next && (
          <Button size="sm" variant="primary" onClick={() => setState({ ...state, catechism: { ...cat, code: next.code, current: 0, timesOnCurrent: 0 } })}>
            Begin the {next.label}
          </Button>
        )}
      </div>,
    );
  }

  if (out.length === 0) return null;
  return <div className="mt-2 space-y-2 rounded-lg border border-accent/30 bg-accent-soft p-3 text-sm text-ink-2">{out}</div>;
}

function WeekAhead({ fw }: { fw: FW }) {
  const { state, tonight } = fw;
  const { data: books } = useBooks();
  const { data: days } = useReadingPlanDays(state?.plan?.code ?? null);
  if (!state?.plan || !tonight?.plan) return null;
  const upcoming = upcomingDays(state, tonight.plan.length_days, 7).slice(1);
  if (upcoming.length === 0) return null;
  return (
    <section className="mb-7">
      <h2 className={cx(sectionLabelClass, "mb-2")}>Coming up</h2>
      <ul className="divide-y divide-line rounded-lg border border-line bg-surface text-sm">
        {upcoming.map((n) => {
          const day = days?.find((d) => d.day_number === n);
          const title = state.plan?.code === STARTER_PLAN ? STARTER_TITLES[n - 1] : null;
          return (
            <li key={n} className="flex items-baseline gap-3 px-3 py-1.5">
              <span className="w-14 shrink-0 text-xs text-ink-3">Day {n}</span>
              <span className="min-w-0 flex-1">
                {day && (
                  <ReadingRefs
                    readings={day.readings}
                    books={books}
                    onNavigate={(bookId, chapter, verse, e) => openPassage({ bookId, chapter, verse }, { target: targetFor(e, "new") })}
                  />
                )}
                {title && <span className="ml-2 text-ink-3">{title}</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function FamilySettings({ fw }: { fw: FW }) {
  const state = fw.state!;
  // Every change here is worked out from the stored setup at the moment it is
  // saved, not from the one this render drew. A question reworded and saved
  // as its box loses focus, followed at once by a click on a checkbox or a
  // Move up, can reach the click before the page has drawn the new words;
  // built from `state` the click would save the old words back over them.
  // For the same reason an Undo pressed after other settings have changed
  // puts back only what it undoes.
  const update = useCallback(
    (change: (s: FamilyWorship) => FamilyWorship) => fw.setState((prev) => (prev ? change(prev) : prev)),
    [fw.setState],
  );
  const { data: plans } = useReadingPlans();
  const { data: people } = usePrayerListPeople();
  const categories = useMemo(
    () => [...new Set((people ?? []).map((p) => p.category?.trim()).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b)),
    [people],
  );
  const plan = plans?.find((p) => p.code === state.plan?.code);
  const available = FAMILY_CATECHISMS.filter((c) => fw.docs?.some((d) => d.code === c.code));
  const total = fw.tonight?.questions?.length;
  // The label column only where the card is wide enough to spare it: `@2xl`
  // is the card's own width, which in a pane beside the Bible is far less
  // than the window's -- a `sm:` column there left each question 170px.
  const row = "grid gap-1 @2xl:grid-cols-[9rem_1fr] @2xl:items-center";
  const label = "text-sm text-ink-3";

  return (
    <div className={cx(cardClass, "@container space-y-4 p-4")}>
      <div className={row}>
        <span className={label}>Reading plan</span>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className={cx(selectClass, "min-w-0 max-w-full")}
            value={state.plan?.code ?? ""}
            onChange={(e) => {
              const code = e.target.value;
              update((s) => ({ ...s, plan: code ? { code, nextDay: 1 } : null, starter: s.starter && code === STARTER_PLAN }));
            }}
            aria-label="Reading plan"
          >
            <option value="">No reading</option>
            {(plans ?? []).map((p) => (
              <option key={p.code} value={p.code}>
                {p.title}
                {p.custom ? " (your own)" : ""}
              </option>
            ))}
          </select>
          {state.plan && plan && (
            <label className="flex items-center gap-1.5 text-sm text-ink-3">
              next day
              <DraftNumber
                min={1}
                max={plan.length_days}
                value={state.plan.nextDay}
                onCommit={(n) => update((s) => ({ ...s, plan: s.plan && { ...s.plan, nextDay: n } }))}
              />
              of {plan.length_days}
            </label>
          )}
        </div>
      </div>
      <p className="-mt-2 text-xs text-ink-4 @2xl:pl-[10rem]">
        The family keeps its own place, apart from your own reading plans. Build a plan of your own (a Gospel a chapter at a time, say) with New plan on the{" "}
        <button type="button" className={linkClass} onClick={(e) => openContent("plans", {}, { target: targetFor(e, "new") })}>
          Reading plans
        </button>{" "}
        page, then choose it here.
      </p>

      <TalkQuestionsRow state={state} update={update} label={label} />

      <div className={row}>
        <span className={label}>Psalm of the week</span>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-sm text-ink-2">
            <input
              type="checkbox"
              className={checkboxClass}
              checked={state.singing}
              onChange={(e) => {
                const singing = e.target.checked;
                update((s) => ({ ...s, singing }));
              }}
            />
            Sing a psalm
          </label>
          {state.singing && (
            <label className="flex items-center gap-1.5 text-sm text-ink-3">
              Psalm
              <DraftNumber
                min={1}
                max={150}
                value={state.psalm?.number ?? 100}
                onCommit={(n) => update((s) => ({ ...s, psalm: { number: n, since: localDate() }, starter: false }))}
              />
            </label>
          )}
          {state.starter && <span className="text-xs text-ink-4">On the first four weeks, the psalm changes each week by itself.</span>}
        </div>
      </div>

      <div className={row}>
        <span className={label}>Catechism</span>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className={cx(selectClass, "min-w-0 max-w-full")}
            value={state.catechism?.code ?? ""}
            onChange={(e) => {
              const code = e.target.value;
              update((s) => ({ ...s, catechism: code ? { code, current: 0, pace: s.catechism?.pace ?? 2, timesOnCurrent: 0 } : null }));
            }}
            aria-label="Catechism"
          >
            <option value="">No catechism</option>
            {available.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
          {state.catechism && (
            <>
              <label className="flex items-center gap-1.5 text-sm text-ink-3">
                question
                <DraftNumber
                  min={1}
                  max={total ?? 999}
                  value={state.catechism.current + 1}
                  onCommit={(n) => update((s) => ({ ...s, catechism: s.catechism && { ...s.catechism, current: n - 1, timesOnCurrent: 0 } }))}
                />
                {total ? `of ${total}` : ""}
              </label>
              <select
                className={selectClass}
                value={state.catechism.pace}
                onChange={(e) => {
                  const pace = Number(e.target.value);
                  update((s) => ({ ...s, catechism: s.catechism && { ...s.catechism, pace } }));
                }}
                aria-label="How often a new question"
              >
                {PACES.map((p) => (
                  <option key={p.value} value={p.value}>
                    New question: {p.label.toLowerCase()}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
      </div>
      {state.catechism && (
        <p className="-mt-2 text-xs text-ink-4 @2xl:pl-[10rem]">{FAMILY_CATECHISMS.find((c) => c.code === state.catechism!.code)?.note}</p>
      )}

      <FamilyMemoryRow state={state} update={update} row={row} label={label} />

      <div className={row}>
        <span className={label}>Pray for</span>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className={cx(selectClass, "min-w-0 max-w-full")}
            value={state.prayerCategory ?? ""}
            onChange={(e) => {
              const category = e.target.value || null;
              update((s) => ({ ...s, prayerCategory: category }));
            }}
            aria-label="Prayer list category"
          >
            <option value="">Everyone on the prayer list</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                The “{c}” category
              </option>
            ))}
            {state.prayerCategory && !categories.includes(state.prayerCategory) && <option value={state.prayerCategory}>The “{state.prayerCategory}” category</option>}
          </select>
          <button type="button" className={cx(linkClass, "text-sm")} onClick={(e) => openContent("prayer", {}, { target: targetFor(e, "new") })}>
            Open the prayer list
          </button>
        </div>
      </div>
    </div>
  );
}

/** A number field that takes effect on Enter or on leaving it, so it can be
 * cleared and retyped: set on every keystroke, clearing "100" to type "23"
 * would pass through 1 and land on 123, and each step would move the psalm's
 * week or the question's count on. Esc puts the old value back. */
function DraftNumber({ value, min, max, onCommit }: { value: number; min: number; max: number; onCommit: (n: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  function commit() {
    if (draft == null) return;
    setDraft(null);
    const n = Math.round(Number(draft));
    if (draft.trim() === "" || !Number.isFinite(n)) return;
    const clamped = Math.max(min, Math.min(max, n));
    if (clamped !== value) onCommit(clamped);
  }
  return (
    <input
      type="number"
      min={min}
      max={max}
      className={cx(inputClass, "w-20")}
      value={draft ?? String(value)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") {
          setDraft(null);
        }
      }}
    />
  );
}

/** A line of text that takes effect on Enter or on leaving it, like
 * DraftNumber. Saved on every keystroke, each letter would be a write to
 * user.db, and the list is trimmed as it is saved: the space typed between
 * two words would vanish before the second could be typed. Esc puts the old
 * words back.
 *
 * The box wraps and grows to show the whole question however narrow the
 * pane, as a question half hidden cannot be read over before it is asked.
 * It is still one line of text: Enter saves rather than breaking the line.
 * `onCommit` answers false when it will not take the words (they repeat
 * another question); they then stay in the box, marked, to be changed. */
function DraftText({
  value,
  label,
  problem,
  onCommit,
  onEscape,
}: {
  value: string;
  label: string;
  /** Id of the note saying what is wrong with the words in the box. */
  problem?: string;
  onCommit: (text: string) => boolean;
  onEscape?: () => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  function commit() {
    if (draft == null) return;
    if (draft.trim() === value) {
      setDraft(null);
      return;
    }
    if (onCommit(draft)) setDraft(null);
  }
  return (
    <textarea
      rows={1}
      value={draft ?? value}
      maxLength={MAX_TALK_QUESTION_LENGTH}
      aria-label={label}
      aria-invalid={problem ? true : undefined}
      aria-describedby={problem}
      data-control="text"
      className={cx(inputClass, "min-w-0 flex-1 resize-none [field-sizing:content]", problem && "border-danger focus:border-danger")}
      onChange={(e) => setDraft(e.target.value.replace(/\s*\n\s*/g, " "))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") {
          setDraft(null);
          onEscape?.();
        }
      }}
    />
  );
}

/** The controls on a question's row, named so that keyboard focus can be
 * sent to the right one once the list has been saved and drawn again. */
type TalkControl = "text" | "up" | "down" | "remove";

/**
 * The questions talked over after every reading (the Read step's "Talk about
 * it") and printed under the week's readings: faith, love and hope until the
 * family writes its own. Any change saves the whole list as the family's own,
 * and a list edited back to the three word for word is the defaults again
 * (see withTalkQuestions). A cleared box keeps its old words and the last
 * question cannot be removed, so there is always something to ask.
 */
function TalkQuestionsRow({
  state,
  update,
  label,
}: {
  state: FamilyWorship;
  update: (change: (s: FamilyWorship) => FamilyWorship) => void;
  label: string;
}) {
  const [draft, setDraft] = useState("");
  const questions = talkQuestions(state);
  const own = hasOwnTalkQuestions(state);
  const full = questions.length >= MAX_TALK_QUESTIONS;
  // The Faith / Love / Hope column only while a default is on the list.
  const tagged = questions.some((q) => talkQuestionTag(q) != null);

  // Words not taken, and why, said under the list: an edit that only snapped
  // back would look lost. `kept` when the words are still in their box (a
  // repeat of another question), waiting to be changed or put back with Esc.
  const [note, setNote] = useState<{ row: number | "new"; text: string; kept: boolean } | null>(null);
  const noteId = useId();
  // Bumped to empty the boxes when the list is reordered or shortened while
  // words are kept in one: the rows are keyed by place, and the words would
  // otherwise stay with a place that now holds another question.
  const [generation, setGeneration] = useState(0);
  function clearNote() {
    if (note?.kept && note.row !== "new") setGeneration((g) => g + 1);
    setNote(null);
  }

  // Where keyboard focus goes once a move or a removal has been saved and the
  // list drawn again. The rows are keyed by place, so the focused Move up
  // button would otherwise stay on its row and belong to the question just
  // pushed down: pressing it again would swap the two back, and a question
  // could never be walked to the top.
  const listRef = useRef<HTMLOListElement>(null);
  const focusAfter = useRef<{ row: number; controls: TalkControl[] } | null>(null);
  const listKey = questions.join("\n");
  useEffect(() => {
    const want = focusAfter.current;
    if (!want) return;
    focusAfter.current = null;
    const row = listRef.current?.querySelector(`[data-row="${want.row}"]`);
    for (const control of want.controls) {
      const el = row?.querySelector<HTMLTextAreaElement | HTMLButtonElement>(`[data-control="${control}"]`);
      if (el && !el.disabled) {
        el.focus();
        return;
      }
    }
  }, [listKey, generation]);

  /**
   * One edit, made to the list as it is stored rather than as this render
   * drew it: a reworded question saved as its box loses focus, then a Move
   * up clicked at once, can reach the click before the page has drawn the
   * new words, and the move would put the old words back. The edits hand
   * back the list they were given when nothing changes (a repeat, a blank, a
   * move past either end); the new list comes back, or null for no change.
   */
  function save(edit: (list: string[]) => string[]): string[] | null {
    let saved: string[] | null = null;
    update((s) => {
      const current = talkQuestions(s);
      const next = edit(current);
      if (next === current) return s;
      saved = next;
      return withTalkQuestions(s, next);
    });
    return saved;
  }

  /** Rewords question `index`; false when the words repeat another
   * question, and so stay in the box to be changed. */
  function reword(index: number, text: string): boolean {
    const repeat = { of: -1 };
    save((list) => {
      repeat.of = repeatedTalkQuestion(list, text, index);
      return editTalkQuestion(list, index, text);
    });
    if (repeat.of >= 0) {
      setNote({ row: index, kept: true, text: `Question ${repeat.of + 1} already asks that. Change the words, or press Esc to keep the old ones.` });
      return false;
    }
    if (!text.trim()) setNote({ row: index, kept: false, text: "A question cannot be left empty, so it keeps its words. To take it away, use its ×." });
    else setNote((n) => (n?.kept && n.row !== index ? n : null));
    return true;
  }

  function add() {
    const repeat = { of: -1 };
    save((list) => {
      repeat.of = repeatedTalkQuestion(list, draft);
      return addTalkQuestion(list, draft);
    });
    if (repeat.of >= 0) {
      // Left in the box, to be seen and changed, rather than cleared away.
      setNote({ row: "new", kept: true, text: `Question ${repeat.of + 1} already asks that.` });
      return;
    }
    setNote((n) => (n?.row === "new" ? null : n));
    setDraft("");
  }

  function move(index: number, by: -1 | 1) {
    if (!save((list) => moveTalkQuestion(list, index, by))) return;
    clearNote();
    // Focus goes with the question, to the same button on its new row, or
    // to the other arrow once it has reached the top or the bottom.
    focusAfter.current = { row: index + by, controls: by < 0 ? ["up", "down"] : ["down", "up"] };
  }

  function remove(index: number) {
    const taken = { words: "" };
    const next = save((list) => {
      taken.words = list[index] ?? "";
      return removeTalkQuestion(list, index);
    });
    if (!next) return;
    clearNote();
    // To the question that moved up into its place, or the one above when
    // the last was removed; to its words when only one is left to ask.
    focusAfter.current = { row: Math.min(index, next.length - 1), controls: ["remove", "text"] };
    // The family's own words are gone at one click on a small button beside
    // Move down, so the removal can be taken back, as Reset can. The
    // question goes back to its place in the list as it then stands.
    const words = taken.words.length > 48 ? `${taken.words.slice(0, 47).trimEnd()}…` : taken.words;
    toast.success(`Removed “${words}”`, {
      label: "Undo",
      onClick: () => {
        const full = { now: false };
        const back = save((list) => {
          full.now = list.length >= MAX_TALK_QUESTIONS && !list.includes(taken.words);
          return insertTalkQuestion(list, index, taken.words);
        });
        if (back) setGeneration((g) => g + 1);
        else if (full.now) toast.info("The list is full. Remove a question to put that one back.");
      },
    });
  }

  function reset() {
    // The list an Undo puts back is read as the reset is saved, like the
    // edits above, so it is the words as they last stood.
    let before: string[] | null = null;
    update((s) => {
      before = s.talkQuestions ?? null;
      return withTalkQuestions(s, null);
    });
    clearNote();
    toast.success("Back to faith, love and hope.", { label: "Undo", onClick: () => update((s) => withTalkQuestions(s, before)) });
  }

  return (
    <>
      <div className="grid gap-1 @2xl:grid-cols-[9rem_1fr] @2xl:items-start">
        <span className={cx(label, "@2xl:pt-1.5")}>Talk about it</span>
        <div className="min-w-0 space-y-1.5">
          <ol ref={listRef} className="space-y-1.5">
            {questions.map((q, i) => (
              // By place, not by words: a question being reworded keeps its
              // box. Each button names its question's number, so a screen
              // reader can tell one row's Move up from the next.
              <li key={`${generation}:${i}`} data-row={i} className="flex items-start gap-1">
                {tagged && <span className="w-10 shrink-0 pt-2 text-xs font-medium text-ink-3">{talkQuestionTag(q) ?? ""}</span>}
                <DraftText
                  value={q}
                  label={`Question ${i + 1}`}
                  problem={note?.kept && note.row === i ? noteId : undefined}
                  onCommit={(text) => reword(i, text)}
                  onEscape={() => setNote((n) => (n?.row === i ? null : n))}
                />
                <IconButton icon={ArrowUp} label={`Move question ${i + 1} up`} size="sm" data-control="up" disabled={i === 0} onClick={() => move(i, -1)} />
                <IconButton
                  icon={ArrowDown}
                  label={`Move question ${i + 1} down`}
                  size="sm"
                  data-control="down"
                  disabled={i === questions.length - 1}
                  onClick={() => move(i, 1)}
                />
                <IconButton
                  icon={X}
                  label={`Remove question ${i + 1}`}
                  size="sm"
                  data-control="remove"
                  disabled={questions.length <= 1}
                  onClick={() => remove(i)}
                />
              </li>
            ))}
          </ol>
          <div className={cx("flex items-center gap-2", tagged && "pl-11")}>
            <input
              value={draft}
              maxLength={MAX_TALK_QUESTION_LENGTH}
              disabled={full}
              onChange={(e) => {
                setDraft(e.target.value);
                if (note?.row === "new") setNote(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && draft.trim() && add()}
              placeholder={full ? "The list is full; remove a question to add another" : "Add a question of your own"}
              aria-label="Add a question to talk about"
              aria-invalid={note?.row === "new" ? true : undefined}
              aria-describedby={note?.row === "new" ? noteId : undefined}
              className={cx(inputClass, "min-w-0 flex-1", note?.row === "new" && "border-danger focus:border-danger")}
            />
            <Button size="sm" icon={Plus} onClick={add} disabled={full || !draft.trim()}>
              Add
            </Button>
          </div>
          <p id={noteId} role="status" className={cx("text-xs", note?.kept ? "text-danger" : "text-ink-3", !note && "sr-only")}>
            {note?.text}
          </p>
        </div>
      </div>
      <p className="-mt-2 text-xs text-ink-4 @2xl:pl-[10rem]">
        Asked after every reading, and printed under the week's readings.{" "}
        {own ? (
          <button type="button" className={linkClass} onClick={reset}>
            Reset to the defaults
          </button>
        ) : (
          "Faith, love and hope: change the words, or add questions of your own."
        )}
      </p>
    </>
  );
}

/** The family's memory verse: chosen here, said at every gathering (see
 * MemorizeStep), and kept in the Family set of the Memory deck once it is
 * learned, so it is not forgotten when the next one comes. */
function FamilyMemoryRow({
  state,
  update,
  row,
  label,
}: {
  state: FamilyWorship;
  update: (change: (s: FamilyWorship) => FamilyWorship) => void;
  row: string;
  label: string;
}) {
  const { data: books } = useBooks();
  const lookup = useBookLookup();
  const addToMemory = useAddToMemory();
  const readerTranslationId = useReaderTranslationId();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const memory = state.memory ?? null;
  const name = (id: number) => books?.find((b) => b.id === id)?.name ?? "";
  const current = memory ? `${name(memory.bookId)} ${memory.chapter}:${memory.verseStart}${memory.verseEnd !== memory.verseStart ? `-${memory.verseEnd}` : ""}` : null;
  const suggestions = MEMORY_SETS.find((s) => s.name === "For little ones")?.refs ?? [];

  async function choose(reference: string) {
    const parsed = parseReference(reference, lookup);
    if (!parsed || parsed.verse == null) {
      setError("Give a verse, like “Psalm 119:105” or “Proverbs 3:5-6”.");
      return;
    }
    // A verse past the chapter's end would be a Memorize step with no words.
    const verses = readerTranslationId != null ? await api.getChapter(readerTranslationId, parsed.book.id, parsed.chapter) : [];
    const last = verses.reduce((m, v) => Math.max(m, v.verse), 0);
    if (last && parsed.verse > last) {
      setError(`${parsed.book.name} ${parsed.chapter} has ${last} verses.`);
      return;
    }
    const verseEnd = Math.min(parsed.verseEnd ?? parsed.verse, last || Infinity);
    if (verseEnd - parsed.verse > 3) {
      setError("Keep it to a few verses; a longer passage is better learned on the Memory page, a part at a time.");
      return;
    }
    setError(null);
    setDraft("");
    // From the stored setup: the chapter was looked up in between, and the
    // family may have changed something else while it was.
    const chosen = { bookId: parsed.book.id, chapter: parsed.chapter, verseStart: parsed.verse, verseEnd, since: localDate(), times: 0 };
    update((s) => ({ ...s, memory: chosen }));
  }

  async function keep() {
    if (!current) return;
    const result = await addToMemory(current, { setName: "Family", asPassage: false });
    if (result.ok) toast.success(`${current} is in the Family set on the Memory page`);
    else toast.info(result.error);
  }

  return (
    <>
      <div className={row}>
        <span className={label}>Memory verse</span>
        <div className="flex flex-wrap items-center gap-2">
          {current && (
            <>
              <span className="text-sm font-medium text-ink">{current}</span>
              <span className="text-xs text-ink-4">
                said {memory!.times} time{memory!.times === 1 ? "" : "s"}
              </span>
              <Button size="sm" variant="ghost" onClick={() => void keep()} title="Put it in the Memory deck, in the Family set, so it keeps coming round">
                Keep it in the Memory deck
              </Button>
              <Button size="sm" variant="ghost" onClick={() => update((s) => ({ ...s, memory: null }))}>
                Stop
              </Button>
            </>
          )}
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void choose(draft)}
            placeholder={current ? "Next verse, e.g. John 3:16" : "A verse to learn together, e.g. Psalm 119:105"}
            aria-label="Memory verse"
            className={cx(inputClass, "min-w-56 flex-1")}
          />
          <Button size="sm" onClick={() => void choose(draft)} disabled={!draft.trim()}>
            {current ? "Move on to it" : "Learn it"}
          </Button>
        </div>
      </div>
      <div className="-mt-2 flex flex-wrap items-center gap-1.5 text-xs text-ink-4 @2xl:pl-[10rem]">
        {error ? (
          <span className="text-danger">{error}</span>
        ) : (
          <>
            Said at every gathering, with a few more words hidden each time. For little ones:
            {suggestions.map((r) => (
              <button key={r} type="button" className={linkClass} onClick={() => void choose(r)}>
                {r}
              </button>
            ))}
          </>
        )}
      </div>
    </>
  );
}
