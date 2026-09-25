import { useCallback, useMemo, useState } from "react";
import { BookOpen, HandHeart, HouseHeart, Maximize2, Music, Play, Printer, ScrollText } from "lucide-react";
import { useBooks, usePrayerListPeople, useReadingPlanDays, useReadingPlans } from "../../api/queries";
import { Page } from "../../components/ui/Page";
import { Button } from "../../components/ui/Button";
import { LoadingState } from "../../components/ui/EmptyState";
import { confirmDialog } from "../../components/ui/confirm";
import { cardClass, checkboxClass, cx, inputClass, linkClass, sectionLabelClass, selectClass } from "../../components/ui/classes";
import { openContent, openPassage, targetFor } from "../../workspace/openContent";
import { ReadingRefs } from "../plans/ReadingPlansView";
import { FamilySession } from "./FamilySession";
import { FamilyWeekSheet } from "./FamilyWeekSheet";
import { FamilyGuide, FurtherReading } from "./FamilyGuide";
import { useFamilySession } from "./sessionStore";
import { useFamilyWorship } from "./useFamilyWorship";
import {
  FAMILY_CATECHISMS,
  PACES,
  STARTER_PLAN,
  STARTER_PSALMS,
  STARTER_TITLES,
  customState,
  guessPrayerCategory,
  localDate,
  logSummary,
  logWeeks,
  nextPsalm,
  psalmWeekDue,
  starterState,
  upcomingDays,
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
        <Button icon={Printer} onClick={() => setPrinting(true)} title="Print the week: readings, the psalm, the catechism questions, and the names to pray for">
          Print this week
        </Button>
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
        <LogGrid log={log} />
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
            const ok = await confirmDialog({
              title: "Stop family worship?",
              message: "This clears the family's reading place, psalm and catechism. The log of days gathered is kept, and you can set it up again any time.",
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
  if (!state || !tonight) return null;
  const reading = tonight.planDone
    ? `${tonight.plan?.title ?? "The plan"} is finished`
    : tonight.day
      ? `${tonight.day.readings.map((r) => r.label).join("; ")}${tonight.readingTitle ? ` · ${tonight.readingTitle}` : ""}`
      : null;
  const rows: { icon: typeof BookOpen; label: string; text: string }[] = [];
  if (state.plan && reading) rows.push({ icon: BookOpen, label: "Read", text: reading });
  if (tonight.psalm != null) rows.push({ icon: Music, label: "Sing", text: `Psalm ${tonight.psalm}` });
  if (tonight.learning) rows.push({ icon: ScrollText, label: "Catechism", text: `${tonight.learning.heading} of the ${tonight.catechismTitle}` });
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
          <span className="min-w-0 flex-1 text-ink">{r.text}</span>
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

function LogGrid({ log }: { log: string[] }) {
  const today = localDate();
  const rows = useMemo(() => logWeeks(log, 5, today), [log, today]);
  const dayNames = ["S", "M", "T", "W", "T", "F", "S"];
  return (
    <div className="inline-grid grid-cols-7 gap-1.5" role="table" aria-label="Days gathered in the last five weeks">
      {dayNames.map((d, i) => (
        <span key={i} className="text-center text-[10px] text-ink-4" aria-hidden="true">
          {d}
        </span>
      ))}
      {rows.flat().map((cell, i) =>
        cell ? (
          <span
            key={cell.date}
            role="cell"
            title={`${new Date(cell.date + "T12:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}${cell.count ? `: gathered${cell.count > 1 ? ` ${cell.count} times` : ""}` : ""}`}
            className={cx(
              "flex h-6 w-6 items-center justify-center rounded-md border text-[10px]",
              cell.date === today ? "border-accent/50" : "border-line",
              cell.count ? "bg-accent-soft text-accent" : "text-ink-4",
            )}
          >
            {cell.count ? "●" : Number(cell.date.slice(8))}
          </span>
        ) : (
          <span key={`empty-${i}`} className="h-6 w-6" />
        ),
      )}
    </div>
  );
}

function FamilySettings({ fw }: { fw: FW }) {
  const state = fw.state!;
  const setState = fw.setState as (s: FamilyWorship) => void;
  const { data: plans } = useReadingPlans();
  const { data: people } = usePrayerListPeople();
  const categories = useMemo(
    () => [...new Set((people ?? []).map((p) => p.category?.trim()).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b)),
    [people],
  );
  const plan = plans?.find((p) => p.code === state.plan?.code);
  const available = FAMILY_CATECHISMS.filter((c) => fw.docs?.some((d) => d.code === c.code));
  const total = fw.tonight?.questions?.length;
  const row = "grid gap-1 sm:grid-cols-[9rem_1fr] sm:items-center";
  const label = "text-sm text-ink-3";

  return (
    <div className={cx(cardClass, "space-y-4 p-4")}>
      <div className={row}>
        <span className={label}>Reading plan</span>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className={cx(selectClass, "min-w-0 max-w-full")}
            value={state.plan?.code ?? ""}
            onChange={(e) =>
              setState({ ...state, plan: e.target.value ? { code: e.target.value, nextDay: 1 } : null, starter: state.starter && e.target.value === STARTER_PLAN })
            }
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
                onCommit={(n) => setState({ ...state, plan: { ...state.plan!, nextDay: n } })}
              />
              of {plan.length_days}
            </label>
          )}
        </div>
      </div>
      <p className="-mt-2 text-xs text-ink-4 sm:pl-[10rem]">
        The family keeps its own place, apart from your own reading plans. Build a plan of your own (a Gospel a chapter at a time, say) with New plan on the{" "}
        <button type="button" className={linkClass} onClick={(e) => openContent("plans", {}, { target: targetFor(e, "new") })}>
          Reading plans
        </button>{" "}
        page, then choose it here.
      </p>

      <div className={row}>
        <span className={label}>Psalm of the week</span>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-sm text-ink-2">
            <input type="checkbox" className={checkboxClass} checked={state.singing} onChange={(e) => setState({ ...state, singing: e.target.checked })} />
            Sing a psalm
          </label>
          {state.singing && (
            <label className="flex items-center gap-1.5 text-sm text-ink-3">
              Psalm
              <DraftNumber
                min={1}
                max={150}
                value={state.psalm?.number ?? 100}
                onCommit={(n) => setState({ ...state, psalm: { number: n, since: localDate() }, starter: false })}
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
            onChange={(e) =>
              setState({
                ...state,
                catechism: e.target.value ? { code: e.target.value, current: 0, pace: state.catechism?.pace ?? 2, timesOnCurrent: 0 } : null,
              })
            }
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
                  onCommit={(n) => setState({ ...state, catechism: { ...state.catechism!, current: n - 1, timesOnCurrent: 0 } })}
                />
                {total ? `of ${total}` : ""}
              </label>
              <select
                className={selectClass}
                value={state.catechism.pace}
                onChange={(e) => setState({ ...state, catechism: { ...state.catechism!, pace: Number(e.target.value) } })}
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
        <p className="-mt-2 text-xs text-ink-4 sm:pl-[10rem]">{FAMILY_CATECHISMS.find((c) => c.code === state.catechism!.code)?.note}</p>
      )}

      <div className={row}>
        <span className={label}>Pray for</span>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className={cx(selectClass, "min-w-0 max-w-full")}
            value={state.prayerCategory ?? ""}
            onChange={(e) => setState({ ...state, prayerCategory: e.target.value || null })}
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
