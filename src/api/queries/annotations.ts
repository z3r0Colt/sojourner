// What the reader writes on the text: highlights, notes, bookmarks, chapter notes, their tags, and the Trash.
// One part of the data hooks; import these from "api/queries" (index.ts).

import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { api } from "../client";
import type { TrashKind, NoteRefInput } from "../types";
import { toast } from "../../components/ui/toast";

export function useHighlights(bookId: number | null, chapter: number | null) {
  return useQuery({
    queryKey: ["highlights", bookId, chapter],
    queryFn: () => api.listHighlights(bookId as number, chapter as number),
    enabled: bookId != null && chapter != null,
  });
}

/** Every highlight, for the Highlights page. Kept fresh by the highlight
 * mutations below. */
export function useAllHighlights() {
  return useQuery({ queryKey: ["allHighlights"], queryFn: api.listAllHighlights });
}

export function useNotesForChapter(bookId: number | null, chapter: number | null) {
  return useQuery({
    queryKey: ["notes", bookId, chapter],
    queryFn: () => api.listNotesForChapter(bookId as number, chapter as number),
    enabled: bookId != null && chapter != null,
  });
}

export function useInvalidateChapterAnnotations() {
  const qc = useQueryClient();
  return (bookId: number, chapter: number) => {
    qc.invalidateQueries({ queryKey: ["highlights", bookId, chapter] });
    qc.invalidateQueries({ queryKey: ["notes", bookId, chapter] });
  };
}

export function useCreateHighlight() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createHighlight,
    onSuccess: (h) => {
      qc.invalidateQueries({ queryKey: ["highlights", h.book_id, h.chapter] });
      qc.invalidateQueries({ queryKey: ["allHighlights"] });
    },
  });
}

export function useDeleteHighlight() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.deleteHighlight,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["highlights"] });
      qc.invalidateQueries({ queryKey: ["allHighlights"] });
    },
  });
}

export function useUpdateHighlight() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: number; color: string; style: "highlight" | "underline" }) =>
      api.updateHighlight(input.id, input.color, input.style),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["highlights"] });
      qc.invalidateQueries({ queryKey: ["allHighlights"] });
    },
  });
}

/** Notes elsewhere that mention a passage in this chapter (backlinks,
 * F2.2). Kept fresh by every note mutation and the Trash actions. */
export function useBacklinks(bookId: number | null, chapter: number | null) {
  return useQuery({
    queryKey: ["backlinks", bookId, chapter],
    queryFn: () => api.listBacklinks(bookId as number, chapter as number),
    enabled: bookId != null && chapter != null,
  });
}

export function useCreateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { bookId: number; chapter: number; verseStart: number; verseEnd: number; body: string; highlightId?: number; refs?: NoteRefInput[] }) =>
      api.createNote(input.bookId, input.chapter, input.verseStart, input.verseEnd, input.body, input.highlightId, input.refs),
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ["notes", n.book_id, n.chapter] });
      qc.invalidateQueries({ queryKey: ["allNotes"] });
      qc.invalidateQueries({ queryKey: ["backlinks"] });
    },
  });
}

export function useUpdateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: number; body: string; refs?: NoteRefInput[] }) => api.updateNote(input.id, input.body, input.refs),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notes"] });
      qc.invalidateQueries({ queryKey: ["allNotes"] });
      qc.invalidateQueries({ queryKey: ["backlinks"] });
    },
  });
}

export function useDeleteNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.deleteNote,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notes"] });
      qc.invalidateQueries({ queryKey: ["allNotes"] });
      qc.invalidateQueries({ queryKey: ["allNoteTags"] });
      qc.invalidateQueries({ queryKey: ["allNoteTagsByNote"] });
      qc.invalidateQueries({ queryKey: ["backlinks"] });
      qc.invalidateQueries({ queryKey: ["trash"] });
    },
  });
}

export function useTrash() {
  return useQuery({ queryKey: ["trash"], queryFn: api.listTrash });
}

const TRASH_KIND_LISTS: Record<TrashKind, string[][]> = {
  note: [["notes"], ["allNotes"], ["allNoteTags"], ["allNoteTagsByNote"], ["backlinks"]],
  chapter_note: [["chapterNotes"], ["allChapterNotes"], ["allChapterNoteTags"], ["allChapterNoteTagsByNote"], ["backlinks"]],
  prayer_entry: [["prayerEntries"], ["prayerEntrySearch"], ["allPrayerEntryTags"], ["allPrayerEntryTagsByEntry"]],
  // An idea filed in a sermon is back in the inbox while that sermon is in
  // the Trash, so restoring one moves its ideas too.
  sermon: [["sermons"], ["sermon"], ["sermonSeries"], ["sermonsForChapter"], ["sermonTags"], ["speakingRate"], ["sermonIdeas"]],
  illustration: [["illustrations"], ["illustration"], ["illustrationUses"], ["illustrationTags"]],
};

/** Brings a soft-deleted item back; refreshes that kind's lists and the Trash. */
export function useRestoreTrashItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { kind: TrashKind; id: number }) => api.restoreTrashItem(input.kind, input.id),
    onSuccess: (_restored, input) => {
      for (const key of TRASH_KIND_LISTS[input.kind]) qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ["trash"] });
    },
  });
}

export function usePurgeTrashItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { kind: TrashKind; id: number }) => api.purgeTrashItem(input.kind, input.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["trash"] }),
  });
}

const TRASH_KIND_LABEL: Record<TrashKind, string> = {
  note: "Note",
  chapter_note: "Chapter note",
  prayer_entry: "Entry",
  sermon: "Sermon",
  illustration: "Illustration",
};

/** The toast every soft delete shows: "<Kind> moved to Trash" with an Undo
 * action that restores it in place. Use as a delete mutation's onSuccess. */
export function useTrashToast() {
  const restore = useRestoreTrashItem();
  return (kind: TrashKind, id: number) =>
    toast.info(`${TRASH_KIND_LABEL[kind]} moved to Trash`, {
      label: "Undo",
      onClick: () => restore.mutate({ kind, id }, { onSuccess: () => toast.success(`${TRASH_KIND_LABEL[kind]} restored`) }),
    });
}

export function useAllNotes() {
  return useQuery({ queryKey: ["allNotes"], queryFn: api.listAllNotes });
}

export function useBookmarks() {
  return useQuery({ queryKey: ["bookmarks"], queryFn: api.listBookmarks });
}

export function useCreateBookmark() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { bookId: number; chapter: number; verse?: number; label?: string }) =>
      api.createBookmark(input.bookId, input.chapter, input.verse, input.label),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bookmarks"] }),
  });
}

export function useDeleteBookmark() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.deleteBookmark,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bookmarks"] }),
  });
}

export function useChapterNotes(bookId: number | null, chapter: number | null) {
  return useQuery({
    queryKey: ["chapterNotes", bookId, chapter],
    queryFn: () => api.listChapterNotes(bookId as number, chapter as number),
    enabled: bookId != null && chapter != null,
  });
}

export function useAllChapterNotes() {
  return useQuery({ queryKey: ["allChapterNotes"], queryFn: api.listAllChapterNotes });
}

export function useCreateChapterNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { bookId: number; chapter: number; body: string; refs?: NoteRefInput[] }) =>
      api.createChapterNote(input.bookId, input.chapter, input.body, input.refs),
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ["chapterNotes", n.book_id, n.chapter] });
      qc.invalidateQueries({ queryKey: ["allChapterNotes"] });
      qc.invalidateQueries({ queryKey: ["backlinks"] });
    },
  });
}

export function useUpdateChapterNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: number; body: string; refs?: NoteRefInput[] }) => api.updateChapterNote(input.id, input.body, input.refs),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chapterNotes"] });
      qc.invalidateQueries({ queryKey: ["allChapterNotes"] });
      qc.invalidateQueries({ queryKey: ["backlinks"] });
    },
  });
}

export function useDeleteChapterNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.deleteChapterNote,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chapterNotes"] });
      qc.invalidateQueries({ queryKey: ["allChapterNotes"] });
      qc.invalidateQueries({ queryKey: ["allChapterNoteTags"] });
      qc.invalidateQueries({ queryKey: ["allChapterNoteTagsByNote"] });
      qc.invalidateQueries({ queryKey: ["backlinks"] });
      qc.invalidateQueries({ queryKey: ["trash"] });
    },
  });
}

export function useAllNoteTags() {
  return useQuery({ queryKey: ["allNoteTags"], queryFn: api.listAllNoteTags });
}

export function useAllNoteTagsByNote() {
  return useQuery({ queryKey: ["allNoteTagsByNote"], queryFn: api.listAllNoteTagsByNote });
}

export function useAddNoteTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { noteId: number; tag: string }) => api.addNoteTag(input.noteId, input.tag),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["allNoteTags"] });
      qc.invalidateQueries({ queryKey: ["allNoteTagsByNote"] });
    },
  });
}

export function useRemoveNoteTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { noteId: number; tag: string }) => api.removeNoteTag(input.noteId, input.tag),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["allNoteTags"] });
      qc.invalidateQueries({ queryKey: ["allNoteTagsByNote"] });
    },
  });
}

export function useAllChapterNoteTags() {
  return useQuery({ queryKey: ["allChapterNoteTags"], queryFn: api.listAllChapterNoteTags });
}

export function useAllChapterNoteTagsByNote() {
  return useQuery({ queryKey: ["allChapterNoteTagsByNote"], queryFn: api.listAllChapterNoteTagsByNote });
}

export function useAddChapterNoteTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { chapterNoteId: number; tag: string }) => api.addChapterNoteTag(input.chapterNoteId, input.tag),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["allChapterNoteTags"] });
      qc.invalidateQueries({ queryKey: ["allChapterNoteTagsByNote"] });
    },
  });
}

export function useRemoveChapterNoteTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { chapterNoteId: number; tag: string }) => api.removeChapterNoteTag(input.chapterNoteId, input.tag),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["allChapterNoteTags"] });
      qc.invalidateQueries({ queryKey: ["allChapterNoteTagsByNote"] });
    },
  });
}
