import { useMemo, useState } from "react";
import {
  useBooks,
  useMemoryVerses,
  useDueMemoryVerses,
  useCreateMemoryVerse,
  useSetMemoryVerseMode,
  useDeleteMemoryVerse,
} from "../../api/queries";
import { buildBookLookup, parseReference } from "../../hooks/useReferenceParser";
import { MemoryPracticeCard } from "./MemoryPracticeCard";
import type { MemoryMode, MemoryVerse } from "../../api/types";

const MODE_LABELS: Record<MemoryMode, string> = {
  "first-letter": "First letter",
  "blank-word": "Blank word",
  "type-it": "Type it",
};

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
      setError("Couldn't parse that reference.");
      return;
    }
    createVerse.mutate({
      bookId: parsed.book.id,
      chapter: parsed.chapter,
      verseStart: parsed.verse ?? 1,
      verseEnd: parsed.verseEnd ?? parsed.verse ?? 1,
      translationId: undefined,
      mode: newMode,
    });
    setReference("");
  }

  if (practicing && queue.length > 0) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold">Practice</h1>
          <div className="flex items-center gap-3">
            <button
              onClick={previousCard}
              disabled={history.length === 0}
              className="text-sm text-gray-400 hover:underline disabled:opacity-30 disabled:hover:no-underline"
            >
              ← Back
            </button>
            <button onClick={() => setPracticing(false)} className="text-sm text-gray-400 hover:underline">
              Stop
            </button>
          </div>
        </div>
        <p className="mb-4 text-xs text-gray-400">{queue.length} card{queue.length === 1 ? "" : "s"} remaining</p>
        <MemoryPracticeCard key={queue[0].id} card={queue[0]} onDone={nextCard} />
      </div>
    );
  }

  if (practicing && queue.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10 text-center">
        <h1 className="mb-2 text-xl font-semibold">Session complete 🎉</h1>
        <p className="mb-6 text-sm text-gray-400">
          You reviewed {sessionSet.length} verse{sessionSet.length === 1 ? "" : "s"}.
        </p>
        <div className="flex justify-center gap-3">
          <button
            onClick={replaySession}
            className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
          >
            Practice again
          </button>
          <button
            onClick={() => setPracticing(false)}
            className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Scripture Memory</h1>
        <button
          onClick={startPractice}
          disabled={!due || due.length === 0}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-40"
        >
          Practice{due && due.length > 0 ? ` (${due.length} due)` : ""}
        </button>
      </div>

      <div className="mb-6 flex gap-4 rounded border border-gray-200 p-3 text-center text-sm dark:border-gray-800">
        <div className="flex-1">
          <div className="text-xl font-semibold">{streak}</div>
          <div className="text-xs text-gray-400">day streak{streak > 0 ? " 🔥" : ""}</div>
        </div>
        <div className="flex-1 border-l border-gray-200 dark:border-gray-800">
          <div className="text-xl font-semibold">{all?.length ?? 0}</div>
          <div className="text-xs text-gray-400">verses memorized</div>
        </div>
        <div className="flex-1 border-l border-gray-200 dark:border-gray-800">
          <div className="text-xl font-semibold">{mastered}</div>
          <div className="text-xs text-gray-400">mastered (5+ reps)</div>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-end gap-2 rounded border border-gray-200 p-3 dark:border-gray-800">
        <label className="flex-1">
          <span className="mb-1 block text-xs font-semibold text-gray-500">Add a verse</span>
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addVerse()}
            placeholder="e.g. Philippians 4:6-7"
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-950"
          />
        </label>
        <label>
          <span className="mb-1 block text-xs font-semibold text-gray-500">Mode</span>
          <select
            value={newMode}
            onChange={(e) => setNewMode(e.target.value as MemoryMode)}
            className="rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-950"
          >
            {(Object.keys(MODE_LABELS) as MemoryMode[]).map((m) => (
              <option key={m} value={m}>
                {MODE_LABELS[m]}
              </option>
            ))}
          </select>
        </label>
        <button onClick={addVerse} className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700">
          Add
        </button>
      </div>
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {(!all || all.length === 0) && <p className="text-gray-400">No memory verses yet.</p>}
      <ul className="space-y-2">
        {all?.map((v) => (
          <li
            key={v.id}
            className="flex items-center justify-between rounded border border-gray-200 px-3 py-2 text-sm dark:border-gray-800"
          >
            <div>
              <span className="font-medium">
                {bookName(v.book_id)} {v.chapter}:{v.verse_start}
                {v.verse_end !== v.verse_start ? `-${v.verse_end}` : ""}
              </span>
              <span className="ml-2 text-xs text-gray-400">
                due {new Date(v.due_at).toLocaleDateString()} · reps {v.repetitions}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => practiceOne(v)}
                className="rounded border border-blue-300 px-2 py-1 text-xs text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-950/40"
                title="Practice this verse"
              >
                ▶ Practice
              </button>
              <select
                value={v.mode}
                onChange={(e) => setMode.mutate({ id: v.id, mode: e.target.value as MemoryMode })}
                className="rounded border border-gray-300 px-1.5 py-1 text-xs dark:border-gray-700 dark:bg-gray-950"
              >
                {(Object.keys(MODE_LABELS) as MemoryMode[]).map((m) => (
                  <option key={m} value={m}>
                    {MODE_LABELS[m]}
                  </option>
                ))}
              </select>
              <button onClick={() => deleteVerse.mutate(v.id)} className="text-xs text-gray-400 hover:underline">
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
