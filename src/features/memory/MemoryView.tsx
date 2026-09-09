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
import type { MemoryVerse } from "../../api/types";

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
  const [reference, setReference] = useState("");
  const [newMode, setNewMode] = useState<"first-letter" | "blank-word">("first-letter");
  const [error, setError] = useState<string | null>(null);

  function bookName(id: number) {
    return books?.find((b) => b.id === id)?.name ?? `#${id}`;
  }

  function startPractice() {
    if (!due || due.length === 0) return;
    setQueue(due);
    setPracticing(true);
  }

  function nextCard() {
    setQueue((q) => {
      const rest = q.slice(1);
      if (rest.length === 0) setPracticing(false);
      return rest;
    });
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
          <button onClick={() => setPracticing(false)} className="text-sm text-gray-400 hover:underline">
            Stop
          </button>
        </div>
        <p className="mb-4 text-xs text-gray-400">{queue.length} card{queue.length === 1 ? "" : "s"} remaining</p>
        <MemoryPracticeCard key={queue[0].id} card={queue[0]} onDone={nextCard} />
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
            onChange={(e) => setNewMode(e.target.value as "first-letter" | "blank-word")}
            className="rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-950"
          >
            <option value="first-letter">First letter</option>
            <option value="blank-word">Blank word</option>
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
              <select
                value={v.mode}
                onChange={(e) => setMode.mutate({ id: v.id, mode: e.target.value as "first-letter" | "blank-word" })}
                className="rounded border border-gray-300 px-1.5 py-1 text-xs dark:border-gray-700 dark:bg-gray-950"
              >
                <option value="first-letter">First letter</option>
                <option value="blank-word">Blank word</option>
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
