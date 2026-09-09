import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import { usePrayerEntries, useBooks, useCreatePrayerEntry, useUpdatePrayerEntry, useDeletePrayerEntry } from "../../api/queries";
import { useNavigationStore } from "../../state/navigationStore";
import { PrayerEntryEditorModal } from "./PrayerEntryEditorModal";
import type { PrayerEntry } from "../../api/types";

const SECTIONS: { key: "adoration" | "confession" | "thanksgiving" | "supplication"; label: string }[] = [
  { key: "adoration", label: "A · Adoration" },
  { key: "confession", label: "C · Confession" },
  { key: "thanksgiving", label: "T · Thanksgiving" },
  { key: "supplication", label: "S · Supplication" },
];

export function PrayerJournalView() {
  const { data: entries } = usePrayerEntries();
  const { data: books } = useBooks();
  const createEntry = useCreatePrayerEntry();
  const updateEntry = useUpdatePrayerEntry();
  const deleteEntry = useDeletePrayerEntry();
  const goTo = useNavigationStore((s) => s.goTo);
  const navigate = useNavigate();

  const [editing, setEditing] = useState<PrayerEntry | null | "new">(null);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);
  const { data: searchResults } = useQuery({
    queryKey: ["prayerEntrySearch", debounced],
    queryFn: () => api.searchPrayerEntries(debounced, 50),
    enabled: debounced.trim().length > 1,
  });

  const list = debounced.trim().length > 1 ? searchResults : entries;

  function bookName(id: number) {
    return books?.find((b) => b.id === id)?.name ?? `#${id}`;
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Prayer Journal</h1>
        <button
          onClick={() => setEditing("new")}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
        >
          + New Entry
        </button>
      </div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search prayer journal…"
        className="mb-4 w-full rounded border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-950"
      />

      {(!list || list.length === 0) && <p className="text-gray-400">No prayer entries yet.</p>}
      <ul className="space-y-3">
        {list?.map((e) => (
          <li key={e.id} className="rounded border border-gray-200 p-3 dark:border-gray-800">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-sm font-semibold">{e.entry_date}</span>
              {e.book_id != null && (
                <button
                  onClick={() => {
                    goTo({ bookId: e.book_id!, chapter: e.chapter!, verse: e.verse_start ?? undefined });
                    navigate("/");
                  }}
                  className="text-xs text-blue-600 hover:underline dark:text-blue-400"
                >
                  {bookName(e.book_id)} {e.chapter}
                  {e.verse_start ? `:${e.verse_start}` : ""}
                </button>
              )}
            </div>
            <div className="space-y-1.5">
              {SECTIONS.filter((s) => e[s.key]).map((s) => (
                <div key={s.key}>
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">{s.label}</div>
                  <p className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">{e[s.key]}</p>
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-3 text-xs text-gray-400">
              <button onClick={() => setEditing(e)} className="hover:underline">
                Edit
              </button>
              <button onClick={() => deleteEntry.mutate(e.id)} className="hover:underline">
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>

      {editing && (
        <PrayerEntryEditorModal
          existing={editing === "new" ? null : editing}
          onSave={(input) => {
            if (editing === "new") {
              createEntry.mutate(input);
            } else {
              updateEntry.mutate({ id: editing.id, ...input });
            }
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
