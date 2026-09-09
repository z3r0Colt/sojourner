import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import {
  useSermonNotes,
  useBooks,
  useCreateSermonNote,
  useUpdateSermonNote,
  useDeleteSermonNote,
} from "../../api/queries";
import { useNavigationStore } from "../../state/navigationStore";
import { useNavigate } from "react-router-dom";
import { SermonNoteEditorModal } from "./SermonNoteEditorModal";
import type { SermonNote } from "../../api/types";

export function SermonNotesView() {
  const { data: notes } = useSermonNotes();
  const { data: books } = useBooks();
  const createNote = useCreateSermonNote();
  const updateNote = useUpdateSermonNote();
  const deleteNote = useDeleteSermonNote();
  const goTo = useNavigationStore((s) => s.goTo);
  const navigate = useNavigate();

  const [editing, setEditing] = useState<SermonNote | null | "new">(null);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);
  const { data: searchResults } = useQuery({
    queryKey: ["sermonNoteSearch", debounced],
    queryFn: () => api.searchSermonNotes(debounced, 50),
    enabled: debounced.trim().length > 1,
  });

  const list = debounced.trim().length > 1 ? searchResults : notes;

  function bookName(id: number) {
    return books?.find((b) => b.id === id)?.name ?? `#${id}`;
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Sermon Notes</h1>
        <button
          onClick={() => setEditing("new")}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
        >
          + New Sermon Note
        </button>
      </div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search sermon notes…"
        className="mb-4 w-full rounded border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-950"
      />

      {(!list || list.length === 0) && <p className="text-gray-400">No sermon notes yet.</p>}
      <ul className="space-y-3">
        {list?.map((n) => (
          <li key={n.id} className="rounded border border-gray-200 p-3 dark:border-gray-800">
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-sm font-semibold">{n.title || "(untitled)"}</span>
              <span className="text-xs text-gray-400">{n.date}</span>
            </div>
            <div className="mb-1 text-xs text-gray-500">
              {n.preacher && <span>{n.preacher}</span>}
              {n.preacher && n.passage_text && <span> · </span>}
              {n.passage_text && <span>{n.passage_text}</span>}
            </div>
            {n.outline && <p className="mb-1 whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">{n.outline}</p>}
            {n.passages.length > 0 && (
              <div className="mb-1 flex flex-wrap gap-1">
                {n.passages.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      goTo({ bookId: p.book_id, chapter: p.chapter, verse: p.verse_start ?? undefined });
                      navigate("/");
                    }}
                    className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    {bookName(p.book_id)} {p.chapter}
                    {p.verse_start ? `:${p.verse_start}` : ""}
                  </button>
                ))}
              </div>
            )}
            <div className="mt-2 flex gap-3 text-xs text-gray-400">
              <button onClick={() => setEditing(n)} className="hover:underline">
                Edit
              </button>
              <button onClick={() => deleteNote.mutate(n.id)} className="hover:underline">
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>

      {editing && (
        <SermonNoteEditorModal
          existing={editing === "new" ? null : editing}
          onSave={(input) => {
            if (editing === "new") {
              createNote.mutate(input);
              setEditing(null);
            } else {
              updateNote.mutate({ id: editing.id, ...input });
            }
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
