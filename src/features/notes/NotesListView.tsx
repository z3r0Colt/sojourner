import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  useAllNotes,
  useAllChapterNotes,
  useBooks,
  useUpdateNote,
  useDeleteNote,
  useUpdateChapterNote,
  useDeleteChapterNote,
} from "../../api/queries";
import { useNavigationStore } from "../../state/navigationStore";
import { NoteEditorModal } from "./NoteEditorModal";
import { NoteBody } from "./NoteBody";
import type { Note, ChapterNote } from "../../api/types";

export function NotesListView() {
  const { data: notes } = useAllNotes();
  const { data: chapterNotes } = useAllChapterNotes();
  const { data: books } = useBooks();
  const goTo = useNavigationStore((s) => s.goTo);
  const navigate = useNavigate();
  const updateNote = useUpdateNote();
  const deleteNote = useDeleteNote();
  const updateChapterNote = useUpdateChapterNote();
  const deleteChapterNote = useDeleteChapterNote();
  const [editing, setEditing] = useState<Note | null>(null);
  const [editingChapter, setEditingChapter] = useState<ChapterNote | null>(null);

  function bookName(id: number) {
    return books?.find((b) => b.id === id)?.name ?? `#${id}`;
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-6">
      <h1 className="mb-4 text-xl font-semibold">My Notes</h1>

      {chapterNotes && chapterNotes.length > 0 && (
        <>
          <h2 className="mb-2 text-sm font-semibold uppercase text-gray-400">Chapter Notes</h2>
          <ul className="mb-6 space-y-3">
            {chapterNotes.map((n) => (
              <li key={n.id} className="rounded border border-gray-200 p-3 dark:border-gray-800">
                <button
                  className="mb-1 text-sm font-semibold text-blue-600 hover:underline dark:text-blue-400"
                  onClick={() => {
                    goTo({ bookId: n.book_id, chapter: n.chapter });
                    navigate("/");
                  }}
                >
                  {bookName(n.book_id)} {n.chapter}
                </button>
                <NoteBody body={n.body} className="block whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300" />
                <div className="mt-2 flex gap-3 text-xs text-gray-400">
                  <button onClick={() => setEditingChapter(n)} className="hover:underline">
                    Edit
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <h2 className="mb-2 text-sm font-semibold uppercase text-gray-400">Passage Notes</h2>
      {(!notes || notes.length === 0) && <p className="text-gray-400">No notes yet.</p>}
      <ul className="space-y-3">
        {notes?.map((n) => (
          <li key={n.id} className="rounded border border-gray-200 p-3 dark:border-gray-800">
            <button
              className="mb-1 text-sm font-semibold text-blue-600 hover:underline dark:text-blue-400"
              onClick={() => {
                goTo({ bookId: n.book_id, chapter: n.chapter, verse: n.verse_start });
                navigate("/");
              }}
            >
              {bookName(n.book_id)} {n.chapter}:{n.verse_start}
              {n.verse_end !== n.verse_start ? `-${n.verse_end}` : ""}
            </button>
            <NoteBody body={n.body} className="block whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300" />
            <div className="mt-2 flex gap-3 text-xs text-gray-400">
              <button onClick={() => setEditing(n)} className="hover:underline">
                Edit
              </button>
            </div>
          </li>
        ))}
      </ul>

      {editing && (
        <NoteEditorModal
          title={`Note on ${bookName(editing.book_id)} ${editing.chapter}:${editing.verse_start}`}
          initialBody={editing.body}
          onSave={(body) => {
            updateNote.mutate({ id: editing.id, body });
            setEditing(null);
          }}
          onDelete={() => {
            deleteNote.mutate(editing.id);
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}

      {editingChapter && (
        <NoteEditorModal
          title={`Chapter note on ${bookName(editingChapter.book_id)} ${editingChapter.chapter}`}
          initialBody={editingChapter.body}
          onSave={(body) => {
            updateChapterNote.mutate({ id: editingChapter.id, body });
            setEditingChapter(null);
          }}
          onDelete={() => {
            deleteChapterNote.mutate(editingChapter.id);
            setEditingChapter(null);
          }}
          onClose={() => setEditingChapter(null)}
        />
      )}
    </div>
  );
}
