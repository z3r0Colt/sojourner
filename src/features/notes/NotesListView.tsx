import { useMemo, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { Download, NotebookPen, Pencil } from "lucide-react";
import { api } from "../../api/client";
import {
  useAllNotes,
  useAllChapterNotes,
  useBooks,
  usePassages,
  useUpdateNote,
  useDeleteNote,
  useUpdateChapterNote,
  useDeleteChapterNote,
  useAllNoteTags,
  useAllNoteTagsByNote,
  useAddNoteTag,
  useRemoveNoteTag,
  useAllChapterNoteTags,
  useAllChapterNoteTagsByNote,
  useAddChapterNoteTag,
  useRemoveChapterNoteTag,
  useTrashToast,
} from "../../api/queries";
import { usePaneNavigate } from "../../workspace/PaneContext";
import { openPassage, targetFor } from "../../workspace/openContent";
import { NoteEditorModal } from "./NoteEditorModal";
import { NoteBody } from "./NoteBody";
import { TagRow, TagFilterBar } from "../../components/TagRow";
import { Page } from "../../components/ui/Page";
import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/EmptyState";
import { toast } from "../../components/ui/toast";
import { cardClass, cx, inputClass, selectSmClass } from "../../components/ui/classes";
import { formatChapterRef, formatRef, refKey, toPassageRef, useBookName } from "../../lib/passage";
import type { Note, ChapterNote } from "../../api/types";

type SortMode = "newest" | "oldest" | "bible";

function formatDate(iso: string) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function NotesListView() {
  const { data: notes } = useAllNotes();
  const { data: chapterNotes } = useAllChapterNotes();
  const { data: books } = useBooks();
  const navigate = usePaneNavigate();
  const updateNote = useUpdateNote();
  const deleteNote = useDeleteNote();
  const updateChapterNote = useUpdateChapterNote();
  const deleteChapterNote = useDeleteChapterNote();
  const trashToast = useTrashToast();
  const [editing, setEditing] = useState<Note | null>(null);
  const [editingChapter, setEditingChapter] = useState<ChapterNote | null>(null);
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [sort, setSort] = useState<SortMode>("bible");

  const { data: noteTagPairs } = useAllNoteTagsByNote();
  const { data: chapterNoteTagPairs } = useAllChapterNoteTagsByNote();
  const { data: allNoteTags } = useAllNoteTags();
  const { data: allChapterNoteTags } = useAllChapterNoteTags();
  const addNoteTag = useAddNoteTag();
  const removeNoteTag = useRemoveNoteTag();
  const addChapterNoteTag = useAddChapterNoteTag();
  const removeChapterNoteTag = useRemoveChapterNoteTag();

  const noteTagsById = useMemo(() => {
    const m = new Map<number, string[]>();
    for (const [id, tag] of noteTagPairs ?? []) m.set(id, [...(m.get(id) ?? []), tag]);
    return m;
  }, [noteTagPairs]);
  const chapterNoteTagsById = useMemo(() => {
    const m = new Map<number, string[]>();
    for (const [id, tag] of chapterNoteTagPairs ?? []) m.set(id, [...(m.get(id) ?? []), tag]);
    return m;
  }, [chapterNoteTagPairs]);
  const allTags = useMemo(
    () => Array.from(new Set([...(allNoteTags ?? []), ...(allChapterNoteTags ?? [])])).sort(),
    [allNoteTags, allChapterNoteTags],
  );

  const bookName = useBookName();
  function bookOrder(id: number) {
    return books?.findIndex((b) => b.id === id) ?? 0;
  }

  async function exportNote(note: Note) {
    const destPath = await save({
      defaultPath: `${bookName(note.book_id)}-${note.chapter}-${note.verse_start}.md`.replace(/\s+/g, "-"),
      filters: [{ name: "Markdown", extensions: ["md"] }],
    });
    if (!destPath) return;
    await api.exportNote(note.id, destPath);
    toast.success("Note exported");
  }

  async function exportChapterNote(note: ChapterNote) {
    const destPath = await save({
      defaultPath: `${bookName(note.book_id)}-${note.chapter}.md`.replace(/\s+/g, "-"),
      filters: [{ name: "Markdown", extensions: ["md"] }],
    });
    if (!destPath) return;
    await api.exportChapterNote(note.id, destPath);
    toast.success("Chapter note exported");
  }

  const q = query.trim().toLowerCase();
  const filteredChapterNotes = (chapterNotes ?? []).filter((n) => {
    if (activeTag && !(chapterNoteTagsById.get(n.id) ?? []).includes(activeTag)) return false;
    if (q && !n.body.toLowerCase().includes(q)) return false;
    return true;
  });
  const filteredNotes = (notes ?? []).filter((n) => {
    if (activeTag && !(noteTagsById.get(n.id) ?? []).includes(activeTag)) return false;
    if (q && !n.body.toLowerCase().includes(q)) return false;
    return true;
  });

  const sortedNotes = useMemo(() => {
    const list = [...filteredNotes];
    if (sort === "newest") list.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    else if (sort === "oldest") list.sort((a, b) => a.updated_at.localeCompare(b.updated_at));
    else list.sort((a, b) => bookOrder(a.book_id) - bookOrder(b.book_id) || a.chapter - b.chapter || a.verse_start - b.verse_start);
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredNotes, sort, books]);

  // Verse excerpts: one round trip for every note shown, so a note reads as
  // "what it was about" without opening it.
  const excerptRefs = useMemo(() => {
    const seen = new Map<string, ReturnType<typeof toPassageRef>>();
    for (const n of sortedNotes) {
      const ref = toPassageRef(n.book_id, n.chapter, n.verse_start, n.verse_end);
      seen.set(refKey(ref), ref);
    }
    return [...seen.values()];
  }, [sortedNotes]);
  const { byKey: passagesByKey } = usePassages(excerptRefs);

  function excerpt(n: Note) {
    const text = passagesByKey.get(refKey(toPassageRef(n.book_id, n.chapter, n.verse_start, n.verse_end)))?.text;
    if (!text) return null;
    return text.length > 180 ? `${text.slice(0, 180).trimEnd()}…` : text;
  }

  // Group by book when sorted in Bible order.
  const groups = useMemo(() => {
    if (sort !== "bible") return [{ title: null as string | null, notes: sortedNotes }];
    const map = new Map<number, Note[]>();
    for (const n of sortedNotes) map.set(n.book_id, [...(map.get(n.book_id) ?? []), n]);
    return [...map.entries()].map(([bookId, list]) => ({ title: bookName(bookId), notes: list }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedNotes, sort, books]);

  const hasAny = (notes?.length ?? 0) > 0 || (chapterNotes?.length ?? 0) > 0;
  const nothingMatches = hasAny && filteredNotes.length === 0 && filteredChapterNotes.length === 0;

  return (
    <Page
      title="Notes"
      lead={hasAny ? `${notes?.length ?? 0} passage notes · ${chapterNotes?.length ?? 0} chapter notes` : undefined}
      actions={
        hasAny && (
          <select value={sort} onChange={(e) => setSort(e.target.value as SortMode)} className={selectSmClass} aria-label="Sort notes">
            <option value="bible">In Bible order</option>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        )
      }
    >
      {hasAny && (
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your notes…" className={cx(inputClass, "mb-3 w-full")} />
      )}
      <TagFilterBar tags={allTags} activeTag={activeTag} onSelect={setActiveTag} />

      {!hasAny && (
        <EmptyState
          icon={NotebookPen}
          title="No notes yet"
          description="While reading, select some text or right-click a verse and choose “Add a note”. Chapter-wide notes live behind the note icon in the reading toolbar."
          action={
            <Button variant="primary" onClick={(e) => navigate("/", e)}>
              Open the Bible
            </Button>
          }
        />
      )}
      {nothingMatches && <EmptyState compact title="No notes match your search or tag filter" />}

      {filteredChapterNotes.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">Chapter notes</h2>
          <ul className="space-y-3">
            {filteredChapterNotes.map((n) => (
              <li key={n.id} className={cardClass}>
                <div className="mb-1 flex items-baseline justify-between gap-3">
                  <button
                    type="button"
                    className="text-sm font-semibold text-accent hover:underline"
                    onClick={(e) => openPassage({ bookId: n.book_id, chapter: n.chapter }, { target: targetFor(e) })}
                  >
                    {formatChapterRef(books, n.book_id, n.chapter)}
                  </button>
                  <span className="text-xs text-ink-3">{formatDate(n.updated_at)}</span>
                </div>
                <NoteBody body={n.body} className="block whitespace-pre-wrap text-sm text-ink-2" />
                <TagRow
                  tags={chapterNoteTagsById.get(n.id) ?? []}
                  onAdd={(tag) => addChapterNoteTag.mutate({ chapterNoteId: n.id, tag })}
                  onRemove={(tag) => removeChapterNoteTag.mutate({ chapterNoteId: n.id, tag })}
                  onFilter={setActiveTag}
                  hint="e.g. doctrine, or conviction / comfort / duty"
                />
                <div className="mt-2 flex justify-end gap-1">
                  <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditingChapter(n)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" icon={Download} onClick={() => exportChapterNote(n)}>
                    Export
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {groups.map((g) =>
        g.notes.length === 0 ? null : (
          <section key={g.title ?? "all"} className="mb-8">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">{g.title ?? "Passage notes"}</h2>
            <ul className="space-y-3">
              {g.notes.map((n) => {
                const ex = excerpt(n);
                return (
                  <li key={n.id} className={cardClass}>
                    <div className="mb-1 flex items-baseline justify-between gap-3">
                      <button
                        type="button"
                        className="text-sm font-semibold text-accent hover:underline"
                        onClick={(e) => openPassage({ bookId: n.book_id, chapter: n.chapter, verse: n.verse_start }, { target: targetFor(e) })}
                      >
                        {formatRef(books, toPassageRef(n.book_id, n.chapter, n.verse_start, n.verse_end))}
                      </button>
                      <span className="text-xs text-ink-3">{formatDate(n.updated_at)}</span>
                    </div>
                    {ex && <p className="reading-font mb-2 border-l-2 border-line-2 pl-3 text-sm italic text-ink-3">{ex}</p>}
                    <NoteBody body={n.body} className="block whitespace-pre-wrap text-sm text-ink-2" />
                    <TagRow
                      tags={noteTagsById.get(n.id) ?? []}
                      onAdd={(tag) => addNoteTag.mutate({ noteId: n.id, tag })}
                      onRemove={(tag) => removeNoteTag.mutate({ noteId: n.id, tag })}
                      onFilter={setActiveTag}
                      hint="e.g. doctrine, or conviction / comfort / duty"
                    />
                    <div className="mt-2 flex justify-end gap-1">
                      <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(n)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="ghost" icon={Download} onClick={() => exportNote(n)}>
                        Export
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ),
      )}

      {editing && (
        <NoteEditorModal
          title={`Note on ${formatRef(books, toPassageRef(editing.book_id, editing.chapter, editing.verse_start, editing.verse_end))}`}
          initialBody={editing.body}
          onSave={(body) => {
            updateNote.mutate({ id: editing.id, body }, { onSuccess: () => toast.success("Note saved") });
            setEditing(null);
          }}
          onDelete={() => {
            const id = editing.id;
            deleteNote.mutate(id, { onSuccess: () => trashToast("note", id) });
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}

      {editingChapter && (
        <NoteEditorModal
          title={`Chapter note on ${formatChapterRef(books, editingChapter.book_id, editingChapter.chapter)}`}
          initialBody={editingChapter.body}
          onSave={(body) => {
            updateChapterNote.mutate({ id: editingChapter.id, body }, { onSuccess: () => toast.success("Note saved") });
            setEditingChapter(null);
          }}
          onDelete={() => {
            const id = editingChapter.id;
            deleteChapterNote.mutate(id, { onSuccess: () => trashToast("chapter_note", id) });
            setEditingChapter(null);
          }}
          onClose={() => setEditingChapter(null)}
        />
      )}
    </Page>
  );
}
