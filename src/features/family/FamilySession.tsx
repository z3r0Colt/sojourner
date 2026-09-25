import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Brain, Check, HandHeart, Maximize2, Minimize2, Minus, Music, Plus, ScrollText, X } from "lucide-react";
import { useBooks, useCreatePrayerListPerson, usePassages } from "../../api/queries";
import type { WestminsterSectionSummary } from "../../api/types";
import { Button, IconButton } from "../../components/ui/Button";
import { checkboxClass, cx, inputClass } from "../../components/ui/classes";
import { toast } from "../../components/ui/toast";
import { useReadingTypography, useUiStore } from "../../state/uiStore";
import { useWorkspaceStore } from "../../state/workspaceStore";
import { openContent } from "../../workspace/openContent";
import { refKey } from "../../lib/passage";
import { MetricalPsalmPanel } from "../reading/MetricalPsalmPanel";
import { ReadAloudButton } from "../tts/ReadAloudButton";
import { TALK_QUESTIONS, logSummary, memoryHint, type FamilyMemory } from "./familyWorship";
import { applyMemoryMode, memoryWords } from "../memory/memoryText";
import { useFamilySession } from "./sessionStore";
import { readingRefs, useCatechismQuestions, useFamilyWorship, type Tonight } from "./useFamilyWorship";

type StepId = "read" | "sing" | "catechism" | "memorize" | "pray";

const STEP_LABEL: Record<StepId, string> = { read: "Read", sing: "Sing", catechism: "Catechism", memorize: "Memorize", pray: "Pray" };

/** The Lord's Prayer as Matthew 6:9-13 gives it (KJV), for a family that
 * does not yet know what to pray. */
const LORDS_PRAYER =
  "Our Father which art in heaven, Hallowed be thy name. Thy kingdom come. Thy will be done in earth, as it is in heaven. Give us this day our daily bread. And forgive us our debts, as we forgive our debtors. And lead us not into temptation, but deliver us from evil: For thine is the kingdom, and the power, and the glory, for ever. Amen.";

/** What to pray, in the order the Directory for Family-Worship (1647, IX)
 * sets out its "materials of prayer", said plainly. */
const PRAYER_PROMPTS = [
  "Praise God for who he is, and ask him to help you pray.",
  "Confess your sins, and ask forgiveness for Christ's sake.",
  "Thank him for his mercies today, and for Christ.",
  "Ask for what the family needs, and pray for the church and for the people below.",
];

export function familySteps(tonight: Tonight | null, hasPlan: boolean, hasCatechism: boolean, hasMemory = false): StepId[] {
  const steps: StepId[] = [];
  if (hasPlan) steps.push("read");
  if (tonight?.psalm != null) steps.push("sing");
  if (hasCatechism) steps.push("catechism");
  if (hasMemory) steps.push("memorize");
  steps.push("pray");
  return steps;
}

/**
 * Tonight's family worship, a step at a time: read, sing, catechism, pray,
 * and Amen, which writes the gathering down. `large` is the gather-round
 * view: type sized to be read across a room, and the arrow keys to move on.
 */
export function FamilySession({ large }: { large: boolean }) {
  const { state, tonight, finish, log, isLoaded } = useFamilyWorship();
  const session = useFamilySession();
  const familyFontSize = useUiStore((s) => s.familyFontSize);
  const setFamilyFontSize = useUiStore((s) => s.setFamilyFontSize);

  const steps = familySteps(tonight, !!state?.plan, !!state?.catechism, !!state?.memory);
  const index = Math.min(session.step, steps.length - 1);
  const step = steps[index];
  const last = index === steps.length - 1;

  function amen() {
    finish(session.unticked);
    session.markFinished();
  }

  function leave() {
    // Out of full screen, the session carries on in the Family worship pane
    // if one is open; with none open there is nowhere for it to go.
    const paneOpen = useWorkspaceStore.getState().panes.some((p) => p.kind === "family");
    if (large && paneOpen && !session.finished) session.setLarge(false);
    else session.end();
  }

  useEffect(() => {
    if (!large) return;
    function onKeyDown(e: KeyboardEvent) {
      // Leave the keys to a field being typed in -- but not to a checkbox,
      // which has no use for the arrows (the names on the Pray step).
      const target = e.target as HTMLElement | null;
      const typing =
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable ||
        (target instanceof HTMLInputElement && target.type !== "checkbox" && target.type !== "radio");
      if (typing) return;
      if (e.key === "Escape") {
        e.preventDefault();
        leave();
      } else if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        if (!session.finished && !last) session.setStep(index + 1);
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        if (!session.finished) session.setStep(index - 1);
      } else if (e.ctrlKey && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        setFamilyFontSize(familyFontSize + 2);
      } else if (e.ctrlKey && e.key === "-") {
        e.preventDefault();
        setFamilyFontSize(familyFontSize - 2);
      }
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  });

  if (!state || !tonight) {
    // Gather round from the command palette before the family has set up:
    // say so, rather than fill the screen with nothing.
    if (!large || !isLoaded || state) return null;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-xl text-ink">Family worship is not set up yet.</p>
        <p className="max-w-md text-ink-3">Choose a reading, a psalm and a catechism on the Family worship page, or start with the first four weeks.</p>
        <div className="flex gap-2">
          <Button
            variant="primary"
            onClick={() => {
              session.end();
              openContent("family", {});
            }}
          >
            Set it up
          </Button>
          <Button onClick={() => session.end()}>Close</Button>
        </div>
      </div>
    );
  }

  return (
    <div className={cx("flex min-h-0 flex-col", large ? "h-full" : "")} style={{ fontSize: large ? familyFontSize : 16 }}>
      <div className={cx("flex shrink-0 flex-wrap items-center gap-1 border-b border-line", large ? "px-[4vw] py-3" : "pb-3")}>
        {!session.finished &&
          steps.map((s, i) => (
            <button
              key={s}
              type="button"
              onClick={() => session.setStep(i)}
              className={cx(
                "rounded-full px-3 py-1 text-sm",
                i === index ? "bg-accent-soft font-medium text-accent" : i < index ? "text-ink-2 hover:bg-hover" : "text-ink-4 hover:bg-hover",
              )}
              aria-current={i === index ? "step" : undefined}
            >
              {i < index && <Check className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />}
              {STEP_LABEL[s]}
            </button>
          ))}
        <span className="flex-1" />
        {large && (
          <>
            <IconButton icon={Minus} label="Smaller text (Ctrl+-)" size="sm" onClick={() => setFamilyFontSize(familyFontSize - 2)} />
            <IconButton icon={Plus} label="Larger text (Ctrl+=)" size="sm" onClick={() => setFamilyFontSize(familyFontSize + 2)} />
          </>
        )}
        {!session.finished && (
          <IconButton
            icon={large ? Minimize2 : Maximize2}
            label={large ? "Leave full screen (Esc)" : "Gather round: fill the screen"}
            size="sm"
            onClick={() => (large ? leave() : session.setLarge(true))}
          />
        )}
        <IconButton icon={X} label="Close family worship" size="sm" onClick={() => session.end()} />
      </div>

      <div className={cx("min-h-0 flex-1", large && "overflow-y-auto px-[6vw] py-[4vh]")}>
        <div className={cx("mx-auto", large ? "max-w-[46em]" : "max-w-none pt-4")}>
          {session.finished ? (
            <Finished log={log} large={large} />
          ) : step === "read" ? (
            <ReadStep tonight={tonight} large={large} />
          ) : step === "sing" && tonight.psalm != null ? (
            <SingStep psalm={tonight.psalm} large={large} fontSize={large ? familyFontSize : undefined} />
          ) : step === "catechism" ? (
            <CatechismStep tonight={tonight} />
          ) : step === "memorize" && state.memory ? (
            <MemorizeStep memory={state.memory} large={large} />
          ) : (
            <PrayStep tonight={tonight} prayerCategory={state.prayerCategory} />
          )}
        </div>
      </div>

      {!session.finished && (
        <div className={cx("flex shrink-0 items-center gap-2 border-t border-line", large ? "px-[4vw] py-3" : "mt-4 pt-3")}>
          <Button icon={ArrowLeft} disabled={index === 0} onClick={() => session.setStep(index - 1)}>
            Back
          </Button>
          <span className="flex-1 text-center text-xs text-ink-4">{large && "← → to move, Esc to leave full screen"}</span>
          {last ? (
            <Button variant="primary" icon={Check} onClick={amen} title="Write tonight down, and move the reading and the catechism on">
              Amen
            </Button>
          ) : (
            <Button variant="primary" onClick={() => session.setStep(index + 1)}>
              Next: {STEP_LABEL[steps[index + 1]]}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function StepHeading({ icon: Icon, kicker, title, sub }: { icon: typeof BookOpen; kicker: string; title: string; sub?: string | null }) {
  return (
    <header className="mb-[0.8em]">
      <p className="flex items-center gap-1.5 text-[0.7em] font-semibold uppercase tracking-wide text-ink-3">
        <Icon className="h-[1em] w-[1em]" aria-hidden="true" />
        {kicker}
      </p>
      <h2 className="text-[1.5em] font-semibold leading-tight text-ink">{title}</h2>
      {sub && <p className="mt-0.5 text-[0.85em] text-ink-3">{sub}</p>}
    </header>
  );
}

function ReadStep({ tonight, large }: { tonight: Tonight; large: boolean }) {
  const { data: books } = useBooks();
  const typography = useReadingTypography(1);
  const readings = tonight.day?.readings ?? [];
  const refs = useMemo(() => readings.flatMap(readingRefs), [readings]);
  const { byKey, isLoading } = usePassages(refs);
  const label = readings.map((r) => r.label).join("; ");
  const bookName = (id: number) => books?.find((b) => b.id === id)?.name ?? "";
  const segments = refs.flatMap((ref) =>
    (byKey.get(refKey(ref))?.verses ?? []).map((v) => ({ id: `${v.chapter}:${v.verse}`, text: v.text, label: `${bookName(v.book_id)} ${v.chapter}:${v.verse}` })),
  );

  if (tonight.planDone || !tonight.day) {
    return (
      <div>
        <StepHeading icon={BookOpen} kicker="Read" title={tonight.planDone ? `You have finished ${tonight.plan?.title ?? "the plan"}` : "No reading"} />
        <p className="text-ink-2">
          {tonight.planDone
            ? "Choose what to read next on the Family worship page. For tonight, read a psalm together, or go straight on."
            : "Choose a reading plan on the Family worship page."}
        </p>
      </div>
    );
  }

  const multiChapter = refs.length > 1;
  return (
    <div>
      <StepHeading
        icon={BookOpen}
        kicker={`Read · ${tonight.plan?.title ?? ""}, day ${tonight.day.day_number}`}
        title={tonight.readingTitle ?? label}
        sub={tonight.readingTitle ? label : null}
      />
      <div className="mb-[0.6em]">
        <ReadAloudButton title={`Family worship: ${label}`} sourceKind="scripture" segments={segments} />
      </div>
      <div className="reading-font text-ink" style={large ? { lineHeight: 1.55 } : typography}>
        {isLoading && <p className="text-ink-3">Loading…</p>}
        {refs.map((ref) => {
          const passage = byKey.get(refKey(ref));
          return (
            <div key={refKey(ref)} className="mb-[0.8em]">
              {multiChapter && (
                <p className="mb-[0.2em] font-sans text-[0.7em] font-semibold text-ink-3">
                  {bookName(ref.book_id)} {ref.chapter}
                </p>
              )}
              <p>
                {passage?.verses.map((v) => (
                  <span key={v.verse}>
                    <sup className="mr-[0.2em] select-none font-sans text-[0.6em] font-semibold text-ink-4">{v.verse}</sup>
                    {v.text}{" "}
                  </span>
                ))}
              </p>
            </div>
          );
        })}
      </div>
      <section className="mt-[1em] rounded-lg border border-line bg-surface-2 p-[0.8em]">
        <h3 className="mb-[0.3em] text-[0.75em] font-semibold uppercase tracking-wide text-ink-3">Talk about it</h3>
        <ol className="list-decimal space-y-[0.2em] pl-[1.3em] text-[0.95em] text-ink-2">
          {TALK_QUESTIONS.map((q) => (
            <li key={q}>{q}</li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function SingStep({ psalm, large, fontSize }: { psalm: number; large: boolean; fontSize?: number }) {
  return (
    <div>
      <StepHeading icon={Music} kicker="Sing" title={`Psalm ${psalm}`} sub="Press Play to hear the tune, then sing along. A new tune? Sing the first stanza twice." />
      <div className={cx("overflow-hidden rounded-lg border border-line bg-surface", large ? "h-[62vh]" : "h-[30rem]")}>
        <MetricalPsalmPanel psalm={psalm} fontSize={fontSize} />
      </div>
    </div>
  );
}

function QuestionCard({ summary, question, lead }: { summary: WestminsterSectionSummary; question: { prompt: string | null; body: string } | undefined; lead?: boolean }) {
  const [shown, setShown] = useState(false);
  useEffect(() => setShown(false), [summary.id]);
  return (
    <div className={cx("rounded-lg border border-line bg-surface", lead ? "p-[0.9em]" : "p-[0.6em]")}>
      <p className="text-[0.7em] font-semibold text-ink-4">{summary.heading}</p>
      <p className={cx("font-medium text-ink", lead ? "text-[1.3em] leading-snug" : "text-[1em]")}>{question?.prompt ?? summary.heading}</p>
      {shown ? (
        <p className={cx("reading-font mt-[0.3em] whitespace-pre-line text-ink-2", lead ? "text-[1.15em]" : "text-[0.95em]")}>{question?.body}</p>
      ) : (
        <button type="button" onClick={() => setShown(true)} className="mt-[0.3em] text-[0.85em] text-accent hover:underline">
          Show the answer
        </button>
      )}
    </div>
  );
}

function CatechismStep({ tonight }: { tonight: Tonight }) {
  const ids = [tonight.learning, ...tonight.review].filter(Boolean).map((s) => s!.id);
  const full = useCatechismQuestions(ids);
  if (!tonight.learning) {
    return (
      <div>
        <StepHeading icon={ScrollText} kicker="Catechism" title="Loading the catechism…" />
      </div>
    );
  }
  return (
    <div>
      <StepHeading
        icon={ScrollText}
        kicker={`Catechism · ${tonight.catechismTitle ?? ""}`}
        title={tonight.catechismDone ? "The whole catechism, learned" : "Tonight's question"}
        sub={
          tonight.catechismDone
            ? "You have come to the end. Keep going over it, or choose another on the Family worship page."
            : "Ask the question and let the children answer. Say the answer together until they have it."
        }
      />
      <QuestionCard summary={tonight.learning} question={full.get(tonight.learning.id)} lead />
      {tonight.review.length > 0 && (
        <>
          <h3 className="mb-[0.3em] mt-[1em] text-[0.75em] font-semibold uppercase tracking-wide text-ink-3">Go over</h3>
          <div className="space-y-[0.5em]">
            {tonight.review.map((s) => (
              <QuestionCard key={s.id} summary={s} question={full.get(s.id)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** The family's verse, said together: whole at first, then with words
 * hidden a few more each time they gather (memoryHint), and "show the
 * words" for when it will not come. */
function MemorizeStep({ memory, large }: { memory: FamilyMemory; large: boolean }) {
  const { data: books } = useBooks();
  const typography = useReadingTypography(1);
  const ref = { book_id: memory.bookId, chapter: memory.chapter, verse_start: memory.verseStart, verse_end: memory.verseEnd };
  const { byKey } = usePassages([ref]);
  const text = byKey.get(refKey(ref))?.verses.map((v) => memoryWords(v.text)).join(" ");
  const hint = memoryHint(memory.times);
  const [shown, setShown] = useState(hint === "full");
  const name = books?.find((b) => b.id === memory.bookId)?.name ?? "";
  const label = `${name} ${memory.chapter}:${memory.verseStart}${memory.verseEnd !== memory.verseStart ? `-${memory.verseEnd}` : ""}`;
  return (
    <div>
      <StepHeading
        icon={Brain}
        kicker="Memorize"
        title={label}
        sub={
          hint === "full"
            ? "Read it together, then say it together. Each time you gather, a few more words are hidden."
            : "Say it together. Only the first letters of some words are left; show the words if it will not come."
        }
      />
      <div className="mb-[0.6em]">
        <ReadAloudButton title={`Family worship: ${label}`} sourceKind="scripture" segments={text ? [{ id: "family-memory", text: `${label}. ${text}` }] : []} />
      </div>
      <p className="reading-font mb-[0.8em] text-ink" style={large ? { lineHeight: 1.55 } : typography}>
        {text == null ? "Loading…" : shown || hint === "full" ? text : applyMemoryMode(text, hint)}
      </p>
      {hint !== "full" && (
        <Button onClick={() => setShown((v) => !v)}>{shown ? "Hide the words again" : "Show the words"}</Button>
      )}
    </div>
  );
}

function PrayStep({ tonight, prayerCategory }: { tonight: Tonight; prayerCategory: string | null }) {
  const unticked = useFamilySession((s) => s.unticked);
  const toggle = useFamilySession((s) => s.toggleTicked);
  const create = useCreatePrayerListPerson();
  const [name, setName] = useState("");
  const [showLordsPrayer, setShowLordsPrayer] = useState(false);

  function add() {
    const trimmed = name.trim();
    if (!trimmed) return;
    create.mutate(
      { name: trimmed, category: prayerCategory ?? "Family" },
      { onSuccess: () => toast.success(`Added ${trimmed} to the prayer list`) },
    );
    setName("");
  }

  return (
    <div>
      <StepHeading icon={HandHeart} kicker="Pray" title="Pray together" sub="A parent can pray, or each one in turn, a sentence each." />
      <ol className="mb-[1em] list-decimal space-y-[0.2em] pl-[1.3em] text-[0.95em] text-ink-2">
        {PRAYER_PROMPTS.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ol>

      <h3 className="mb-[0.3em] text-[0.75em] font-semibold uppercase tracking-wide text-ink-3">Pray for</h3>
      {tonight.prayFor.length > 0 ? (
        <ul className="mb-[0.6em] space-y-[0.3em]">
          {tonight.prayFor.map((p) => (
            <li key={p.id}>
              <label className="flex cursor-pointer items-start gap-[0.5em]">
                <input
                  type="checkbox"
                  className={cx(checkboxClass, "mt-[0.3em] h-[0.9em] w-[0.9em] shrink-0")}
                  checked={!unticked.includes(p.id)}
                  onChange={() => toggle(p.id)}
                />
                <span>
                  <span className="text-[1.1em] font-medium text-ink">{p.name}</span>
                  {p.notes && <span className="block text-[0.85em] text-ink-3">{p.notes}</span>}
                </span>
              </label>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-[0.4em] text-[0.9em] text-ink-3">
          {prayerCategory ? `No one in “${prayerCategory}” on the prayer list yet.` : "No one on the prayer list yet."} Add the people your family prays for:
          grandparents, friends, a missionary, the pastor.
        </p>
      )}
      <div className="mb-[1em] flex gap-2 text-sm">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Add a name to pray for"
          className={cx(inputClass, "min-w-0 flex-1")}
          aria-label="Add a name to pray for"
        />
        <Button icon={Plus} onClick={add} disabled={!name.trim()}>
          Add
        </Button>
      </div>
      {tonight.prayFor.length > 0 && <p className="mb-[1em] text-[0.75em] text-ink-4">Amen logs a prayer for each name still ticked; the rest come up again next time.</p>}

      <button type="button" className="text-[0.85em] text-accent hover:underline" onClick={() => setShowLordsPrayer((v) => !v)} aria-expanded={showLordsPrayer}>
        {showLordsPrayer ? "Hide the Lord's Prayer" : "Not sure what to say? Pray the Lord's Prayer together"}
      </button>
      {showLordsPrayer && <p className="reading-font mt-[0.4em] text-[1.05em] text-ink">{LORDS_PRAYER}</p>}
    </div>
  );
}

function Finished({ log, large }: { log: string[]; large: boolean }) {
  const end = useFamilySession((s) => s.end);
  return (
    <div className={cx("text-center", large ? "pt-[10vh]" : "py-6")}>
      <p className="reading-font text-[2em] text-ink">Amen.</p>
      <p className="mt-[0.4em] text-ink-2">That is family worship. The reading and the catechism pick up here next time.</p>
      <p className="mt-[0.4em] text-[0.8em] text-ink-3">{logSummary(log)}</p>
      <div className="mt-[1.2em]">
        <Button variant="primary" onClick={end}>
          Close
        </Button>
      </div>
    </div>
  );
}
