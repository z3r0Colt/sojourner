import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Brain, MapPin, Play, Plus, Trash2 } from "lucide-react";
import { MemoryPracticeCard } from "./MemoryPracticeCard";
import { MemoryModeSelect } from "./MemoryModeSelect";
import { TranslationPick } from "./TranslationPick";
import { MemorySetsPanel } from "./MemorySetsPanel";
import { PassageList } from "./PassageList";
import { ListenToCards } from "./ListenToCards";
import { useAddToMemory } from "./useAddToMemory";
import { daysPractised, reviewDays } from "./memorySets";
import { Button, IconButton } from "../../components/ui/Button";
import { DayGrid } from "../../components/ui/DayGrid";
import { EmptyState } from "../../components/ui/EmptyState";
import { cardClass, checkboxClass, cx, inputClass, selectClass } from "../../components/ui/classes";
import { confirmDelete } from "../../components/ui/confirm";
import { toast } from "../../components/ui/toast";
import { useReaderTranslationId } from "../../state/workspaceStore";
import type { MemoryMode, MemoryVerse } from "../../api/types";
import {
  useBooks,
  useMemoryVerses,
  useDueMemoryVerses,
  useMemoryPassages,
  useMemoryReviewTimes,
  useSetMemoryVerseMode,
  useSetMemoryVerseTranslation,
  useSetMemoryVerseAskReference,
  useDeleteMemoryVerse,
  useSetMemoryVerseDoctrinalLink,
  useTranslations,
} from "../../api/queries";

/** How to learn a new reference: decided by its length, all at once, or in
 * parts of so many verses. */
type LearnAs = "auto" | "whole" | "1" | "2" | "3" | "4";

/** "No set", as a filter. */
const NO_SET = "\u0000";

/** Where the review calendar starts: far enough back for five weeks. */
function calendarSince(): string {
  const d = new Date();
  d.setDate(d.getDate() - 40);
  return d.toISOString();
}

export function MemoryView() {
  const { data: books } = useBooks();
  const { data: all } = useMemoryVerses();
  const { data: due } = useDueMemoryVerses();
  const { data: passages } = useMemoryPassages();
  const [since] = useState(calendarSince);
  const { data: reviewTimes } = useMemoryReviewTimes(since);
  const setMode = useSetMemoryVerseMode();
  const deleteVerse = useDeleteMemoryVerse();
  const setDoctrinalLink = useSetMemoryVerseDoctrinalLink();
  const setTranslation = useSetMemoryVerseTranslation();
  const setAskReference = useSetMemoryVerseAskReference();
  const addToMemory = useAddToMemory();
  const { data: translations } = useTranslations();
  const readerTranslationId = useReaderTranslationId();

  const [practicing, setPracticing] = useState(false);
  const [queue, setQueue] = useState<MemoryVerse[]>([]);
  const [history, setHistory] = useState<MemoryVerse[]>([]);
  const [sessionSet, setSessionSet] = useState<MemoryVerse[]>([]);
  const [reference, setReference] = useState("");
  const [newMode, setNewMode] = useState<MemoryMode>("first-letter");
  const [learnAs, setLearnAs] = useState<LearnAs>("auto");
  const [askWhere, setAskWhere] = useState(false);
  // The translation a new card is learned in. Starts on the one being
  // read, and follows it until the reader picks one here by hand.
  const [newTranslationId, setNewTranslationId] = useState<number | null>(readerTranslationId);
  const [translationTouched, setTranslationTouched] = useState(false);
  useEffect(() => {
    if (!translationTouched) setNewTranslationId(readerTranslationId);
  }, [readerTranslationId, translationTouched]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string | null>(null);

  const log = useMemo(() => reviewDays(reviewTimes ?? []), [reviewTimes]);
  const practisedDays = daysPractised(log, 30);
  const mastered = (all ?? []).filter((v) => v.repetitions >= 5).length;

  // The sets in the deck, from its cards and its passages.
  const setNames = useMemo(() => {
    const names = new Set<string>();
    for (const c of all ?? []) if (c.set_name) names.add(c.set_name);
    for (const p of passages ?? []) if (p.set_name) names.add(p.set_name);
    return names;
  }, [all, passages]);
  const hasUnset = (all ?? []).some((c) => !c.set_name);
  const inFilter = (setName: string | null) => filter == null || (filter === NO_SET ? !setName : setName === filter);
  const shownPassages = (passages ?? []).filter((p) => inFilter(p.set_name));
  // A passage's parts are listed under it, not again among the cards.
  const shownCards = (all ?? []).filter((c) => c.passage_id == null && inFilter(c.set_name));
  const dueHere = (due ?? []).filter((c) => inFilter(c.set_name));

  function bookName(id: number) {
    return books?.find((b) => b.id === id)?.name ?? `#${id}`;
  }

  function practise(cards: MemoryVerse[]) {
    if (cards.length === 0) return;
    setSessionSet(cards);
    setQueue(cards);
    setHistory([]);
    setPracticing(true);
  }

  // Both step the queue from the current render's state rather than from
  // inside a setState updater: React runs updaters twice in development
  // (StrictMode), which duplicated the card when one setState was nested
  // in another's updater.
  function nextCard() {
    const [done, ...rest] = queue;
    if (!done) return;
    setHistory((h) => [...h, done]);
    setQueue(rest);
  }

  function previousCard() {
    const last = history[history.length - 1];
    if (!last) return;
    setHistory((h) => h.slice(0, -1));
    setQueue((q) => [last, ...q]);
  }

  function replaySession() {
    setQueue(sessionSet);
    setHistory([]);
  }

  async function addVerse() {
    setError(null);
    const result = await addToMemory(reference, {
      translationId: newTranslationId,
      mode: newMode,
      askReference: askWhere,
      asPassage: learnAs === "auto" ? undefined : learnAs !== "whole",
      chunkSize: learnAs === "auto" || learnAs === "whole" ? undefined : Number(learnAs),
      setName: filter && filter !== NO_SET ? filter : null,
    });
    if (!result.ok) {
      setError(result.error === "Couldn't read that reference." ? "Couldn't read that reference. Try something like “Philippians 4:6-7” or “Psalm 23”." : result.error);
      return;
    }
    const code = translations?.find((t) => t.id === newTranslationId)?.code;
    toast.success(`Added ${result.label}${code ? ` (${code})` : ""}${result.passage ? ", a part at a time" : ""}`);
    setReference("");
  }

  if (practicing && queue.length > 0) {
    return (
      <div className="py-4">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-sm text-ink-3">
            {queue.length} card{queue.length === 1 ? "" : "s"} remaining
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" icon={ArrowLeft} onClick={previousCard} disabled={history.length === 0} title="Previous card (Backspace)">
              Back
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPracticing(false)}>
              Stop
            </Button>
          </div>
        </div>
        <MemoryPracticeCard key={queue[0].id} card={queue[0]} onDone={nextCard} onBack={history.length > 0 ? previousCard : undefined} />
      </div>
    );
  }

  if (practicing && queue.length === 0) {
    return (
      <div className="py-10 text-center">
        <h2 className="mb-2 text-xl font-semibold text-ink">Session complete</h2>
        <p className="mb-6 text-sm text-ink-3">
          You reviewed {sessionSet.length} card{sessionSet.length === 1 ? "" : "s"}.
        </p>
        <div className="flex justify-center gap-2">
          <Button variant="primary" onClick={replaySession}>
            Practice again
          </Button>
          <Button onClick={() => setPracticing(false)}>Done</Button>
        </div>
      </div>
    );
  }

  const hasAny = (all?.length ?? 0) > 0 || (passages?.length ?? 0) > 0;

  return (
    <div>
      {hasAny && (
        <div className="mb-5 flex flex-wrap items-start gap-4">
          <div className="grid min-w-64 flex-1 grid-cols-3 gap-3">
            {[
              { value: practisedDays, label: "days practised in the last 30" },
              { value: all?.length ?? 0, label: "cards in your deck" },
              { value: mastered, label: "mastered (5+ reviews)" },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border border-line bg-surface p-3 text-center">
                <div className="text-2xl font-semibold text-ink">{s.value}</div>
                <div className="text-xs text-ink-3">{s.label}</div>
              </div>
            ))}
          </div>
          {/* A calendar, not a streak: a missed day is just a day. */}
          <DayGrid log={log} label="Days you practised, the last five weeks" did="practised" />
        </div>
      )}

      <div className="mb-5 flex flex-wrap items-end gap-2 rounded-lg border border-line bg-surface-2 p-3">
        <label className="min-w-48 flex-1">
          <span className="mb-1 block text-xs font-medium text-ink-3">Add a verse, a passage, or a whole psalm</span>
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void addVerse()}
            placeholder="e.g. Philippians 4:6-7, or Psalm 23"
            className={cx(inputClass, "w-full")}
          />
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium text-ink-3">Translation</span>
          <select
            value={newTranslationId ?? ""}
            onChange={(e) => {
              setTranslationTouched(true);
              setNewTranslationId(e.target.value ? Number(e.target.value) : null);
            }}
            className={selectClass}
            aria-label="Translation to memorize in"
          >
            <option value="">Reader's translation</option>
            {translations?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.code} · {t.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium text-ink-3">Practice mode</span>
          <MemoryModeSelect value={newMode} onChange={setNewMode} />
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium text-ink-3">Learn it</span>
          <select value={learnAs} onChange={(e) => setLearnAs(e.target.value as LearnAs)} className={selectClass} aria-label="How to learn it">
            <option value="auto">As suits its length</option>
            <option value="whole">All at once</option>
            <option value="1">A verse at a time</option>
            <option value="2">Two verses at a time</option>
            <option value="3">Three verses at a time</option>
            <option value="4">Four verses at a time</option>
          </select>
        </label>
        <Button variant="primary" icon={Plus} onClick={() => void addVerse()}>
          Add
        </Button>
        <label className="flex w-full items-center gap-2 text-xs text-ink-2">
          <input type="checkbox" className={checkboxClass} checked={askWhere} onChange={(e) => setAskWhere(e.target.checked)} />
          Also practise where it is: every other time, see the words and say the reference
        </label>
        <p className="w-full text-xs text-ink-4">
          The words you learn are the words of that translation. Four verses or more, or a whole chapter, are learned a part at a time: the next part comes
          once you have the one before, and the whole passage last.
        </p>
        {error && <p className="w-full text-sm text-danger">{error}</p>}
      </div>

      <MemorySetsPanel setsInDeck={setNames} translationId={newTranslationId} deckEmpty={all == null || passages == null ? null : !hasAny} />

      {hasAny && (setNames.size > 0 || filter != null) && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="Show a set">
          {[
            { key: null as string | null, label: "Everything" },
            ...[...setNames].sort().map((n) => ({ key: n as string | null, label: n })),
            ...(hasUnset ? [{ key: NO_SET as string | null, label: "Not in a set" }] : []),
          ].map((f) => (
            <button
              key={f.label}
              type="button"
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={cx(
                "rounded-full border px-2.5 py-0.5 text-xs",
                filter === f.key ? "border-accent bg-accent-soft text-accent" : "border-line text-ink-2 hover:bg-hover",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {hasAny && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <p className="mr-auto text-sm text-ink-3">{dueHere.length > 0 ? `${dueHere.length} due for review today` : "Nothing due today"}</p>
          {dueHere.length > 0 && <ListenToCards cards={dueHere} title="Memory: what's due" />}
          <Button variant="primary" icon={Play} onClick={() => practise(dueHere)} disabled={dueHere.length === 0}>
            Practice what's due
          </Button>
        </div>
      )}

      {!hasAny && (
        <EmptyState
          icon={Brain}
          title="Nothing to memorize yet"
          description="Add a reference above, pick a ready-made set, or right-click any verse while reading and choose “Add to Scripture memory”. Verses come due on a schedule that spaces out as you get them right."
        />
      )}

      <PassageList passages={shownPassages} cards={all ?? []} onPractise={practise} />

      <ul className="space-y-2">
        {shownCards.map((v) => (
          <li key={v.id} className={cardClass}>
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-0 flex-1">
                <span className="font-medium text-ink">
                  {bookName(v.book_id)} {v.chapter}:{v.verse_start}
                  {v.verse_end !== v.verse_start ? `-${v.verse_end}` : ""}
                </span>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-3">
                  {v.set_name && <span className="whitespace-nowrap rounded-full bg-surface-2 px-2 py-0.5">{v.set_name}</span>}
                  <span>
                    due {new Date(v.due_at).toLocaleDateString()} · {v.repetitions} review{v.repetitions === 1 ? "" : "s"}
                  </span>
                </div>
              </div>
              <TranslationPick
                value={v.translation_id}
                onChange={(translationId) =>
                  setTranslation.mutate({ id: v.id, translationId }, { onError: (e) => toast.error(e instanceof Error ? e.message : String(e)) })
                }
              />
              <Button size="sm" variant="secondary" icon={Play} onClick={() => practise([v])}>
                Practice
              </Button>
              <MemoryModeSelect small value={v.mode} onChange={(mode) => setMode.mutate({ id: v.id, mode })} />
              <button
                type="button"
                aria-pressed={v.ask_reference}
                onClick={() => setAskReference.mutate({ id: v.id, askReference: !v.ask_reference })}
                title={v.ask_reference ? "Also practising where it is: click to stop" : "Also practise where it is: every other time, see the words and say the reference"}
                className={cx(
                  "inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs",
                  v.ask_reference ? "border-accent bg-accent-soft text-accent" : "border-line text-ink-3 hover:bg-hover",
                )}
              >
                <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                Where
              </button>
              <IconButton
                icon={Trash2}
                label="Remove from deck"
                size="sm"
                onClick={async () => {
                  if (await confirmDelete(`${bookName(v.book_id)} ${v.chapter}:${v.verse_start} from your deck`, "Your review history for it is lost.")) {
                    deleteVerse.mutate(v.id, { onSuccess: () => toast.info("Removed from deck") });
                  }
                }}
              />
            </div>
            <input
              defaultValue={v.doctrinal_note ?? ""}
              onBlur={(e) => {
                const note = e.target.value.trim();
                if (note === (v.doctrinal_note ?? "")) return;
                setDoctrinalLink.mutate({ id: v.id, westminsterSectionId: v.westminster_section_id, doctrinalNote: note || null });
              }}
              placeholder="Add a doctrinal note or catechism connection (meditate on the sense)…"
              aria-label="Doctrinal note"
              className="mt-2 w-full rounded-md border border-dashed border-line-2 bg-transparent px-2 py-1 text-sm italic text-ink-2 placeholder:text-ink-4 focus:border-solid focus:border-accent"
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
