import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { useSermonNotes, useBooks, useCreateSermonNote, useUpdateSermonNote, useDeleteSermonNote, useSermonNoteTags } from "../../api/queries";
import { useNavigationStore } from "../../state/navigationStore";
import { useNavigate } from "react-router-dom";
import { SermonNoteEditorModal } from "./SermonNoteEditorModal";
import { NoteBody } from "../notes/NoteBody";
import type { SermonNote } from "../../api/types";

type GroupBy = "none" | "series" | "book";

const NO_SERIES = "No Series";
const UNSPECIFIED_BOOK = "Unspecified Book";

export function SermonNotesView() {
  const { data: notes } = useSermonNotes();
  const { data: books } = useBooks();
  const { data: allTags } = useSermonNoteTags();
  const createNote = useCreateSermonNote();
  const updateNote = useUpdateSermonNote();
  const deleteNote = useDeleteSermonNote();
  const goTo = useNavigationStore((s) => s.goTo);
  const navigate = useNavigate();

  const [editing, setEditing] = useState<SermonNote | null | "new">(null);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [groupBy, setGroupBy] = useState<GroupBy>("series");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);
  const { data: searchResults } = useQuery({
    queryKey: ["sermonNoteSearch", debounced],
    queryFn: () => api.searchSermonNotes(debounced, 50),
    enabled: debounced.trim().length > 1,
  });

  const baseList = debounced.trim().length > 1 ? searchResults : notes;
  const list = useMemo(
    () => (activeTag ? baseList?.filter((n) => n.tags.includes(activeTag)) : baseList),
    [baseList, activeTag],
  );

  function bookName(id: number) {
    return books?.find((b) => b.id === id)?.name ?? `#${id}`;
  }

  const groups = useMemo(() => {
    if (groupBy === "none" || !list) return null;
    const buckets = new Map<string, SermonNote[]>();
    for (const n of list) {
      const key =
        groupBy === "series"
          ? n.series?.trim() || NO_SERIES
          : n.passages[0]
            ? bookName(n.passages[0].book_id)
            : UNSPECIFIED_BOOK;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(n);
    }
    const fallback = groupBy === "series" ? NO_SERIES : UNSPECIFIED_BOOK;
    return [...buckets.entries()].sort(([a], [b]) => {
      if (a === fallback) return 1;
      if (b === fallback) return -1;
      return a.localeCompare(b);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, groupBy, books]);

  function renderNote(n: SermonNote) {
    return (
      <li key={n.id} className="rounded border border-gray-200 p-3 dark:border-gray-800">
        <div className="mb-1 flex items-baseline justify-between">
          <span className="text-sm font-semibold">{n.title || "(untitled)"}</span>
          <span className="text-xs text-gray-400">{n.date}</span>
        </div>
        <div className="mb-1 text-xs text-gray-500">
          {n.preacher && <span>{n.preacher}</span>}
          {n.preacher && n.passage_text && <span> · </span>}
          {n.passage_text && <span>{n.passage_text}</span>}
          {n.series && <span className="ml-1 text-gray-400">· {n.series}</span>}
        </div>
        {n.outline && <NoteBody body={n.outline} className="mb-1 block whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300" />}
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
        {n.tags.length > 0 && (
          <div className="mb-1 flex flex-wrap gap-1">
            {n.tags.map((t) => (
              <button
                key={t}
                onClick={() => setActiveTag(t)}
                className="rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-700 hover:bg-purple-200 dark:bg-purple-950/40 dark:text-purple-300"
              >
                #{t}
              </button>
            ))}
          </div>
        )}
        {n.confession_links.length > 0 && (
          <div className="mb-1 flex flex-wrap gap-1">
            {n.confession_links.map((l) => (
              <button
                key={l.id}
                onClick={() => navigate(`/westminster/${l.document_code}/${l.westminster_section_id}`)}
                className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700 hover:bg-amber-200 dark:bg-amber-950/40 dark:text-amber-300"
                title={l.document_title}
              >
                {l.document_code} {l.heading}
              </button>
            ))}
          </div>
        )}
        {n.word_studies.length > 0 && (
          <div className="mb-1 flex flex-wrap gap-1">
            {n.word_studies.map((w) => (
              <button
                key={w.id}
                onClick={() => navigate(`/lexicon/${w.strongs_id}`)}
                className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700 hover:bg-blue-200 dark:bg-blue-950/40 dark:text-blue-300"
                title={w.note ?? undefined}
              >
                {w.original_word ?? w.strongs_id}
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
    );
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
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search sermon notes…"
          className="min-w-0 flex-1 rounded border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-950"
        />
        <select
          value={groupBy}
          onChange={(e) => setGroupBy(e.target.value as GroupBy)}
          className="rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-950"
        >
          <option value="series">Group by series</option>
          <option value="book">Group by book</option>
          <option value="none">No grouping</option>
        </select>
      </div>
      {allTags && allTags.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-gray-400">Doctrine tags:</span>
          {allTags.map((t) => (
            <button
              key={t}
              onClick={() => setActiveTag(activeTag === t ? null : t)}
              className={`rounded-full px-2 py-0.5 ${
                activeTag === t
                  ? "bg-purple-600 text-white"
                  : "bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-950/40 dark:text-purple-300"
              }`}
            >
              #{t}
            </button>
          ))}
          {activeTag && (
            <button onClick={() => setActiveTag(null)} className="text-gray-400 hover:underline">
              Clear
            </button>
          )}
        </div>
      )}

      {(!list || list.length === 0) && <p className="text-gray-400">No sermon notes yet.</p>}

      {groups ? (
        <div className="space-y-5">
          {groups.map(([group, groupNotes]) => (
            <div key={group}>
              <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">{group}</h2>
              <ul className="space-y-3">{groupNotes.map(renderNote)}</ul>
            </div>
          ))}
        </div>
      ) : (
        <ul className="space-y-3">{list?.map(renderNote)}</ul>
      )}

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
