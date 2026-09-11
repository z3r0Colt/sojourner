import { useMemo, useState } from "react";
import { ArrowLeft, Brain, Flame, Play, Plus, Trash2 } from "lucide-react";
import {
  useBooks,
  useMemoryVerses,
  useDueMemoryVerses,
  useCreateMemoryVerse,
  useSetMemoryVerseMode,
  useDeleteMemoryVerse,
  useSetMemoryVerseDoctrinalLink,
} from "../../api/queries";
import { buildBookLookup, parseReference } from "../../hooks/useReferenceParser";
import { MemoryPracticeCard } from "./MemoryPracticeCard";
import { MemoryModeSelect } from "./MemoryModeSelect";
import type { MemoryMode, MemoryVerse } from "../../api/types";
import { Button, IconButton } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/EmptyState";
import { confirmDelete } from "../../components/ui/confirm";
import { toast } from "../../components/ui/toast";
import { cardClass, cx, inputClass } from "../../components/ui/classes";

/** Counts consecutive calendar days with at least one review, working
 * backward from today (a day is still "current" if the streak's last day
 * was yesterday -- it isn't broken until a full day passes with no review). */
function computeStreak(reviewDates: string[]): number {
  const days = new Set(reviewDates.map((d) => new Date(d).toDateString()));
  if (days.size === 0) return 0;
  let streak = 0;
  const cursor = new Date();
  if (!days.has(cursor.toDateString())) {
    cursor.setDate(cursor.getDate() - 1);
    if (!days.has(cursor.toDateString())) return 0;
  }
  while (days.has(cursor.toDateString())) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function MemoryView() {
  const { data: books } = useBooks();
  const { data: all } = useMemoryVerses();
  const { data: due } = useDueMemoryVerses();
  const createVerse = useCreateMemoryVerse();
  const setMode = useSetMemoryVerseMode();
  const deleteVerse = useDeleteMemoryVerse();
  const setDoctrinalLink = useSetMemoryVerseDoctrinalLink();
  const lookup = useMemo(() => buildBookLookup(books ?? []), [books]);

  const [practicing, setPracticing] = useState(false);
  const [queue, setQueue] = useState<MemoryVerse[]>([]);
  const [history, setHistory] = useState<MemoryVerse[]>([]);
  const [sessionSet, setSessionSet] = useState<MemoryVerse[]>([]);
  const [reference, setReference] = useState("");
  const [newMode, setNewMode] = useState<MemoryMode>("first-letter");
  const [error, setError] = useState<string | null>(null);

  const streak = useMemo(
    () => computeStreak((all ?? []).map((v) => v.last_reviewed_at).filter((d): d is string => d != null)),
    [all],
  );
  const mastered = (all ?? []).filter((v) => v.repetitions >= 5).length;

  function bookName(id: number) {
    return books?.find((b) => b.id === id)?.name ?? `#${id}`;
  }

  function startPractice() {
    if (!due || due.length === 0) return;
    setSessionSet(due);
    setQueue(due);
    setHistory([]);
    setPracticing(true);
  }

  function practiceOne(v: MemoryVerse) {
    setSessionSet([v]);
    setQueue([v]);
    setHistory([]);
    setPracticing(true);
  }

  function nextCard() {
    setQueue((q) => {
      const [done, ...rest] = q;
      if (done) setHistory((h) => [...h, done]);
      return rest;
    });
  }

  function previousCard() {
    setHistory((h) => {
      if (h.length === 0) return h;
      const last = h[h.length - 1];
      setQueue((q) => [last, ...q]);
      return h.slice(0, -1);
    });
  }

  function replaySession() {
    setQueue(sessionSet);
    setHistory([]);
  }

  function addVerse() {
    setError(null);
    const parsed = parseReference(reference, lookup);
    if (!parsed) {
      setError("Couldn't read that reference. Try something like “Philippians 4:6-7”.");
      return;
    }
    createVerse.mutate(
      {
        bookId: parsed.book.id,
        chapter: parsed.chapter,
        verseStart: parsed.verse ?? 1,
        verseEnd: parsed.verseEnd ?? parsed.verse ?? 1,
        translationId: undefined,
        mode: newMode,
      },
      { onSuccess: () => toast.success(`Added ${parsed.book.name} ${parsed.chapter}:${parsed.verse ?? 1}`) },
    );
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
          You reviewed {sessionSet.length} verse{sessionSet.length === 1 ? "" : "s"}.
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

  const hasAny = (all?.length ?? 0) > 0;

  return (
    <div>
      {hasAny && (
        <div className="mb-5 grid grid-cols-3 gap-3">
          {[
            { value: streak, label: "day streak", icon: streak > 0 ? Flame : undefined },
            { value: all?.length ?? 0, label: "verses in your deck" },
            { value: mastered, label: "mastered (5+ reviews)" },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border border-line bg-surface p-3 text-center">
              <div className="flex items-center justify-center gap-1 text-2xl font-semibold text-ink">
                {s.icon && <s.icon className="h-5 w-5 text-amber-500" aria-hidden="true" />}
                {s.value}
              </div>
              <div className="text-xs text-ink-3">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="mb-5 flex flex-wrap items-end gap-2 rounded-lg border border-line bg-surface-2 p-3">
        <label className="min-w-48 flex-1">
          <span className="mb-1 block text-xs font-medium text-ink-3">Add a verse or passage</span>
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addVerse()}
            placeholder="e.g. Philippians 4:6-7"
            className={cx(inputClass, "w-full")}
          />
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium text-ink-3">Practice mode</span>
          <MemoryModeSelect value={newMode} onChange={setNewMode} />
        </label>
        <Button variant="primary" icon={Plus} onClick={addVerse}>
          Add
        </Button>
        {error && <p className="w-full text-sm text-danger">{error}</p>}
      </div>

      {hasAny && (
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm text-ink-3">{due && due.length > 0 ? `${due.length} due for review today` : "Nothing due today"}</p>
          <Button variant="primary" icon={Play} onClick={startPractice} disabled={!due || due.length === 0}>
            Practice what's due
          </Button>
        </div>
      )}

      {!hasAny && (
        <EmptyState
          icon={Brain}
          title="Nothing to memorize yet"
          description="Add a reference above, or right-click any verse while reading and choose “Add to Scripture memory”. Verses come due on a schedule that spaces out as you get them right."
        />
      )}

      <ul className="space-y-2">
        {all?.map((v) => (
          <li key={v.id} className={cardClass}>
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-0 flex-1">
                <span className="font-medium text-ink">
                  {bookName(v.book_id)} {v.chapter}:{v.verse_start}
                  {v.verse_end !== v.verse_start ? `-${v.verse_end}` : ""}
                </span>
                <span className="ml-2 text-xs text-ink-3">
                  due {new Date(v.due_at).toLocaleDateString()} · {v.repetitions} review{v.repetitions === 1 ? "" : "s"}
                </span>
              </div>
              <Button size="sm" variant="secondary" icon={Play} onClick={() => practiceOne(v)}>
                Practice
              </Button>
              <MemoryModeSelect small value={v.mode} onChange={(mode) => setMode.mutate({ id: v.id, mode })} />
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
