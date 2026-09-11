import { useMemo, useState } from "react";
import { ArrowUpRight, Highlighter, Pencil, Plus, StickyNote } from "lucide-react";
import {
  useBacklinks,
  useBooks,
  useChapterNotes,
  useCreateChapterNote,
  useCreateNote,
  useDeleteChapterNote,
  useDeleteNote,
  useHighlights,
  useNotesForChapter,
  usePassages,
  useTrashToast,
  useUpdateChapterNote,
  useUpdateNote,
} from "../../api/queries";
import type { Backlink, Book, ChapterNote, Highlight, Note } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/EmptyState";
import { toast } from "../../components/ui/toast";
import { cx, sectionLabelClass } from "../../components/ui/classes";
import { NoteBody } from "../notes/NoteBody";
import { NoteEditorModal } from "../notes/NoteEditorModal";
import { formatChapterRef, formatRef, refKey, toPassageRef } from "../../lib/passage";
import { refAttrs } from "../../lib/refAttr";
import { openPassage, targetFor } from "../../workspace/openContent";
import { highlightColorFor, highlightColorLabel, useHighlightLabels } from "./highlightColors";

/**
 * The "Mine" pane (F2.4): everything of the reader's own on the linked
 * chapter, in verse order, with the selected verse's items pinned to the
 * top, then the notes elsewhere that mention this chapter (backlinks,
 * F2.2). Presentational: the chapter's notes, chapter notes, highlights,
 * and backlinks are the same queries the Bible pane already runs.
 */

type Editing =
  | { kind: "note"; note: Note }
  | { kind: "new-note"; verse: number }
  | { kind: "chapter-note"; note: ChapterNote }
  | { kind: "new-chapter-note" }
  | { kind: "backlink"; link: Backlink };

/** Verse-ordered entries for one chapter: a note or a highlight. */
type Entry = { verse: number; verseEnd: number; key: string } & ({ type: "note"; note: Note } | { type: "highlight"; highlight: Highlight });

function verseLabel(start: number, end: number) {
  return `v. ${start}${end !== start ? `–${end}` : ""}`;
}

export function MyNotesPane({ book, chapter, activeVerse }: { book: Book; chapter: number; activeVerse: number | null }) {
  const { data: books } = useBooks();
  const { data: notes } = useNotesForChapter(book.id, chapter);
  const { data: chapterNotes } = useChapterNotes(book.id, chapter);
  const { data: highlights } = useHighlights(book.id, chapter);
  const { data: backlinks } = useBacklinks(book.id, chapter);
  const [labels] = useHighlightLabels();
  const createNote = useCreateNote();
  const updateNote = useUpdateNote();
  const deleteNote = useDeleteNote();
  const createChapterNote = useCreateChapterNote();
  const updateChapterNote = useUpdateChapterNote();
  const deleteChapterNote = useDeleteChapterNote();
  const trashToast = useTrashToast();
  const [editing, setEditing] = useState<Editing | null>(null);

  const entries = useMemo<Entry[]>(() => {
    const list: Entry[] = [
      ...(notes ?? []).map<Entry>((n) => ({ type: "note", note: n, verse: n.verse_start, verseEnd: n.verse_end, key: `n${n.id}` })),
      ...(highlights ?? []).map<Entry>((h) => ({ type: "highlight", highlight: h, verse: h.verse_start, verseEnd: h.verse_end, key: `h${h.id}` })),
    ];
    // Verse order; at the same verse, notes before highlights.
    return list.sort((a, b) => a.verse - b.verse || a.verseEnd - b.verseEnd || (a.type === b.type ? 0 : a.type === "note" ? -1 : 1));
  }, [notes, highlights]);

  const pinned = activeVerse != null ? entries.filter((e) => activeVerse >= e.verse && activeVerse <= e.verseEnd) : [];
  const rest = activeVerse != null ? entries.filter((e) => !(activeVerse >= e.verse && activeVerse <= e.verseEnd)) : entries;

  // Highlight excerpts: one round trip for every highlighted range shown.
  const excerptRefs = useMemo(() => {
    const seen = new Map<string, ReturnType<typeof toPassageRef>>();
    for (const h of highlights ?? []) {
      const ref = toPassageRef(h.book_id, h.chapter, h.verse_start, h.verse_end);
      seen.set(refKey(ref), ref);
    }
    return [...seen.values()];
  }, [highlights]);
  const { byKey: passagesByKey } = usePassages(excerptRefs);

  const empty = entries.length === 0 && (chapterNotes?.length ?? 0) === 0 && (backlinks?.length ?? 0) === 0;
  const loaded = notes && chapterNotes && highlights;

  function jump(e: React.MouseEvent, verse: number) {
    openPassage({ bookId: book.id, chapter, verse }, { target: targetFor(e) });
  }

  function renderEntry(e: Entry) {
    if (e.type === "note") {
      const n = e.note;
      return (
        <li key={e.key} className="rounded-md border border-line bg-surface p-2">
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <button type="button" className="text-xs font-semibold text-accent hover:underline" onClick={(ev) => jump(ev, n.verse_start)} {...refAttrs(toPassageRef(n.book_id, n.chapter, n.verse_start, n.verse_end))}>
              {verseLabel(n.verse_start, n.verse_end)}
            </button>
            <span className="inline-flex items-center gap-0.5 text-xs text-ink-4">
              <StickyNote className="h-3 w-3" aria-hidden="true" /> Note
            </span>
          </div>
          <NoteBody body={n.body} className="block text-sm text-ink-2" />
          <div className="mt-1.5 flex justify-end gap-0.5">
            <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing({ kind: "note", note: n })}>
              Edit
            </Button>
            <Button size="sm" variant="ghost" icon={ArrowUpRight} onClick={(ev) => jump(ev, n.verse_start)} title="Show this verse in the linked Bible pane (Ctrl+click for a new pane)">
              Jump
            </Button>
          </div>
        </li>
      );
    }
    const h = e.highlight;
    const color = highlightColorFor(h.color);
    const name = color ? highlightColorLabel(color, labels) : h.style === "underline" ? "Underline" : "Highlight";
    const text = passagesByKey.get(refKey(toPassageRef(h.book_id, h.chapter, h.verse_start, h.verse_end)))?.text;
    const excerpt = text ? (text.length > 140 ? `${text.slice(0, 140).trimEnd()}…` : text) : null;
    return (
      <li key={e.key} className="rounded-md border border-line bg-surface p-2">
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <button type="button" className="text-xs font-semibold text-accent hover:underline" onClick={(ev) => jump(ev, h.verse_start)} {...refAttrs(toPassageRef(h.book_id, h.chapter, h.verse_start, h.verse_end))}>
            {verseLabel(h.verse_start, h.verse_end)}
          </button>
          <span className="inline-flex items-center gap-1 text-xs text-ink-4">
            <span
              aria-hidden="true"
              className={cx("inline-block h-3 w-3 rounded-sm", h.style === "underline" && "h-0.5 w-4 rounded-full")}
              style={{ backgroundColor: h.color }}
            />
            {name}
          </span>
        </div>
        {excerpt && (
          <p className="reading-font text-sm text-ink-2">
            <mark className={h.style === "underline" ? "underline-only" : "highlight"} style={{ ["--hl-color" as string]: h.color }}>
              {excerpt}
            </mark>
          </p>
        )}
      </li>
    );
  }

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2 text-xs text-ink-3">
        <span className="truncate">
          Mine · {book.name} {chapter}
          {activeVerse ? `:${activeVerse}` : ""}
        </span>
        <Button
          size="sm"
          variant="ghost"
          icon={Plus}
          onClick={() => setEditing(activeVerse != null ? { kind: "new-note", verse: activeVerse } : { kind: "new-chapter-note" })}
          title={activeVerse != null ? `Write a note on ${book.name} ${chapter}:${activeVerse}` : `Write a note on the whole of ${book.name} ${chapter}`}
        >
          {activeVerse != null ? `New note for v. ${activeVerse}` : "New chapter note"}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2 text-sm">
        {loaded && empty && (
          <EmptyState
            compact
            icon={StickyNote}
            title={`Nothing of yours on ${book.name} ${chapter} yet`}
            description="Notes, chapter notes, and highlights you make on this chapter gather here, along with any note elsewhere that mentions it."
          />
        )}

        {pinned.length > 0 && (
          <section className="mb-4">
            <h3 className={cx(sectionLabelClass, "mb-1.5 px-1")}>Verse {activeVerse}</h3>
            <ul className="space-y-1.5">{pinned.map(renderEntry)}</ul>
          </section>
        )}

        {(chapterNotes?.length ?? 0) > 0 && (
          <section className="mb-4">
            <h3 className={cx(sectionLabelClass, "mb-1.5 px-1")}>Chapter notes</h3>
            <ul className="space-y-1.5">
              {chapterNotes!.map((n) => (
                <li key={n.id} className="rounded-md border border-line bg-surface p-2">
                  <NoteBody body={n.body} className="block text-sm text-ink-2" />
                  <div className="mt-1.5 flex justify-end gap-0.5">
                    <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing({ kind: "chapter-note", note: n })}>
                      Edit
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {rest.length > 0 && (
          <section className="mb-4">
            <h3 className={cx(sectionLabelClass, "mb-1.5 px-1")}>{pinned.length > 0 || activeVerse != null ? "Elsewhere in this chapter" : "This chapter"}</h3>
            <ul className="space-y-1.5">{rest.map(renderEntry)}</ul>
          </section>
        )}

        {(backlinks?.length ?? 0) > 0 && (
          <section className="mb-2">
            <h3 className={cx(sectionLabelClass, "mb-1.5 px-1")}>Mentioned in</h3>
            <ul className="space-y-1.5">
              {backlinks!.map((l) => {
                const where = l.kind === "note" && l.verse_start != null ? formatRef(books, toPassageRef(l.book_id, l.chapter, l.verse_start, l.verse_end)) : `${formatChapterRef(books, l.book_id, l.chapter)} (chapter note)`;
                const mentions = l.ref_verse_start == null ? "mentions this chapter" : `mentions ${verseLabel(l.ref_verse_start, l.ref_verse_end ?? l.ref_verse_start)}`;
                const isPinned = activeVerse != null && l.ref_verse_start != null && activeVerse >= l.ref_verse_start && activeVerse <= (l.ref_verse_end ?? l.ref_verse_start);
                return (
                  <li key={`${l.kind}-${l.id}-${l.ref_verse_start ?? 0}`} className={cx("rounded-md border bg-surface p-2", isPinned ? "border-accent/40" : "border-line")}>
                    <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-2">
                      <button
                        type="button"
                        className="text-xs font-semibold text-accent hover:underline"
                        onClick={() => setEditing({ kind: "backlink", link: l })}
                        title="Open this note"
                      >
                        {where}
                      </button>
                      <span className="text-xs text-ink-4">{mentions}</span>
                    </div>
                    <NoteBody body={l.body} className="block max-h-24 overflow-hidden text-sm text-ink-2" />
                    <div className="mt-1.5 flex justify-end gap-0.5">
                      <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing({ kind: "backlink", link: l })}>
                        Open
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={ArrowUpRight}
                        onClick={(ev) => openPassage({ bookId: l.book_id, chapter: l.chapter, verse: l.verse_start ?? undefined }, { target: targetFor(ev) })}
                        title="Go to the passage that note is on (Ctrl+click for a new pane)"
                      >
                        Jump
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {loaded && !empty && entries.length === 0 && (chapterNotes?.length ?? 0) === 0 && (
          <p className="px-1 py-2 text-xs text-ink-4 inline-flex items-center gap-1">
            <Highlighter className="h-3 w-3" aria-hidden="true" /> No notes or highlights on this chapter itself.
          </p>
        )}
      </div>

      {editing?.kind === "note" && (
        <NoteEditorModal
          title={`Note on ${formatRef(books, toPassageRef(editing.note.book_id, editing.note.chapter, editing.note.verse_start, editing.note.verse_end))}`}
          initialBody={editing.note.body}
          onSave={(body, refs) => {
            updateNote.mutate({ id: editing.note.id, body, refs }, { onSuccess: () => toast.success("Note saved") });
            setEditing(null);
          }}
          onDelete={() => {
            const id = editing.note.id;
            deleteNote.mutate(id, { onSuccess: () => trashToast("note", id) });
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}
      {editing?.kind === "new-note" && (
        <NoteEditorModal
          title={`Note on ${book.name} ${chapter}:${editing.verse}`}
          onSave={(body, refs) => {
            if (body.replace(/<p><\/p>/g, "").trim()) {
              createNote.mutate({ bookId: book.id, chapter, verseStart: editing.verse, verseEnd: editing.verse, body, refs }, { onSuccess: () => toast.success("Note saved") });
            }
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}
      {editing?.kind === "chapter-note" && (
        <NoteEditorModal
          title={`Chapter note on ${book.name} ${chapter}`}
          initialBody={editing.note.body}
          onSave={(body, refs) => {
            updateChapterNote.mutate({ id: editing.note.id, body, refs }, { onSuccess: () => toast.success("Note saved") });
            setEditing(null);
          }}
          onDelete={() => {
            const id = editing.note.id;
            deleteChapterNote.mutate(id, { onSuccess: () => trashToast("chapter_note", id) });
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}
      {editing?.kind === "new-chapter-note" && (
        <NoteEditorModal
          title={`Chapter note on ${book.name} ${chapter}`}
          onSave={(body, refs) => {
            if (body.replace(/<p><\/p>/g, "").trim()) {
              createChapterNote.mutate({ bookId: book.id, chapter, body, refs }, { onSuccess: () => toast.success("Note saved") });
            }
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}
      {editing?.kind === "backlink" && (
        <NoteEditorModal
          title={
            editing.link.kind === "note" && editing.link.verse_start != null
              ? `Note on ${formatRef(books, toPassageRef(editing.link.book_id, editing.link.chapter, editing.link.verse_start, editing.link.verse_end))}`
              : `Chapter note on ${formatChapterRef(books, editing.link.book_id, editing.link.chapter)}`
          }
          initialBody={editing.link.body}
          onSave={(body, refs) => {
            if (editing.link.kind === "note") updateNote.mutate({ id: editing.link.id, body, refs }, { onSuccess: () => toast.success("Note saved") });
            else updateChapterNote.mutate({ id: editing.link.id, body, refs }, { onSuccess: () => toast.success("Note saved") });
            setEditing(null);
          }}
          onDelete={() => {
            const { kind, id } = editing.link;
            if (kind === "note") deleteNote.mutate(id, { onSuccess: () => trashToast("note", id) });
            else deleteChapterNote.mutate(id, { onSuccess: () => trashToast("chapter_note", id) });
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
