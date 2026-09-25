import { useMemo } from "react";
import { useQuery, useQueries, useQueryClient, useMutation } from "@tanstack/react-query";
import { api } from "./client";
import type {
  Verse,
  Passage,
  PassageRef,
  PrayerEntryMode,
  MemoryMode,
  TrashKind,
  NoteRefInput,
  PlanReadingInput,
  ScheduleEntry,
  SermonFilter,
  SermonInput,
  SermonStage,
  IllustrationFilter,
  IllustrationInput,
  SermonIdeaInput,
} from "./types";
import { toast } from "../components/ui/toast";
import { useReaderTranslationId } from "../state/workspaceStore";
import { pinnedKey, refKey } from "../lib/passage";

export function useBooks() {
  return useQuery({ queryKey: ["books"], queryFn: api.listBooks, staleTime: Infinity });
}

export function useBookAliases() {
  return useQuery({ queryKey: ["bookAliases"], queryFn: api.listBookAliases, staleTime: Infinity });
}

/** Which chapters of each book `translationId` covers -- null while no translation is selected. */
export function useTranslationCoverage(translationId: number | null) {
  return useQuery({
    queryKey: ["translationCoverage", translationId],
    queryFn: () => api.getTranslationCoverage(translationId as number),
    enabled: translationId != null,
    staleTime: Infinity,
  });
}

export function useTranslations() {
  return useQuery({ queryKey: ["translations"], queryFn: api.listTranslations });
}

export function useCommentarySources() {
  return useQuery({ queryKey: ["commentarySources"], queryFn: api.listCommentarySources });
}

export function useChapter(translationId: number | null, bookId: number | null, chapter: number | null) {
  return useQuery({
    queryKey: ["chapter", translationId, bookId, chapter],
    queryFn: () => api.getChapter(translationId as number, bookId as number, chapter as number),
    enabled: translationId != null && bookId != null && chapter != null,
  });
}

const PASSAGE_STALE_MS = 5 * 60_000;

/** Text for many verse ranges in one round trip, in the reader's primary
 * translation. Returns a `Map` keyed by `refKey(ref)` so callers look up
 * each item without caring about order. Empty `refs` fetches nothing. */
export function usePassages(refs: PassageRef[]) {
  const translationId = useReaderTranslationId();
  const keys = refs.map(refKey).join(",");
  const query = useQuery({
    queryKey: ["passages", translationId, keys],
    queryFn: () => api.getPassages(translationId as number, refs),
    enabled: translationId != null && refs.length > 0,
    staleTime: PASSAGE_STALE_MS,
  });
  const byKey = useMemo(() => {
    const m = new Map<string, Passage>();
    for (const p of query.data ?? []) m.set(refKey(p.ref), p);
    return m;
  }, [query.data]);
  return { ...query, byKey };
}

/** Like `usePassages`, but in a translation the caller names rather than the
 * reader's own -- a sermon's passage blocks all render in the sermon's
 * translation, whichever Bible pane happens to be open beside them. */
export function usePassagesIn(translationId: number | null, refs: PassageRef[]) {
  const keys = refs.map(refKey).join(",");
  const query = useQuery({
    queryKey: ["passages", translationId, keys],
    queryFn: () => api.getPassages(translationId as number, refs),
    enabled: translationId != null && refs.length > 0,
    staleTime: PASSAGE_STALE_MS,
  });
  const byKey = useMemo(() => {
    const m = new Map<string, Passage>();
    for (const p of query.data ?? []) m.set(refKey(p.ref), p);
    return m;
  }, [query.data]);
  return { ...query, byKey };
}

/** The words of passage blocks pinned to translations of their own, keyed
 * by `pinnedKey(translationId, ref)` -- one query per translation, each the
 * same cached query `usePassagesIn` would make for it. */
export function usePinnedPassages(blocks: { ref: PassageRef; translationId: number }[]) {
  const byTranslation = new Map<number, PassageRef[]>();
  for (const b of blocks) byTranslation.set(b.translationId, [...(byTranslation.get(b.translationId) ?? []), b.ref]);
  const groups = [...byTranslation.entries()];
  const results = useQueries({
    queries: groups.map(([translationId, refs]) => ({
      queryKey: ["passages", translationId, refs.map(refKey).join(",")],
      queryFn: () => api.getPassages(translationId, refs),
      staleTime: PASSAGE_STALE_MS,
    })),
  });
  const stamp = results.map((r) => r.dataUpdatedAt).join(",");
  return useMemo(() => {
    const m = new Map<string, Passage>();
    results.forEach((r, i) => {
      for (const p of r.data ?? []) m.set(pinnedKey(groups[i][0], p.ref), p);
    });
    return m;
    // `results` is a new array every render; the stamp says when any changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamp, groups.map(([t]) => t).join(",")]);
}

/** Text for a single verse range in the reader's primary translation.
 * Each reference is cached on its own key, so repeated hovers over the
 * same reference never refetch. `null` disables the query. */
export function usePassageText(ref: PassageRef | null) {
  const translationId = useReaderTranslationId();
  return useQuery({
    queryKey: ["passage", translationId, ref ? refKey(ref) : null],
    queryFn: async () => (await api.getPassages(translationId as number, [ref as PassageRef]))[0] ?? null,
    enabled: translationId != null && ref != null,
    staleTime: PASSAGE_STALE_MS,
  });
}

/** The saved reading position (the Today page's "Continue reading"). The
 * focused Bible pane invalidates this after each save. */
export function useReadingPosition() {
  return useQuery({ queryKey: ["readingPosition"], queryFn: api.getReadingPosition });
}

/** Recently read chapters from the reading log (F3.1), newest first. */
export function useReadingLog(limit = 12) {
  return useQuery({ queryKey: ["readingLog", limit], queryFn: () => api.listReadingLog(limit) });
}

export function useCompareVerse(bookId: number | null, chapter: number | null, verse: number | null) {
  return useQuery({
    queryKey: ["compareVerse", bookId, chapter, verse],
    queryFn: () => api.compareVerse(bookId as number, chapter as number, verse as number),
    enabled: bookId != null && chapter != null && verse != null,
  });
}

export function useCommentaryForPassage(
  sourceId: number | null,
  bookId: number | null,
  chapter: number | null,
  verse?: number,
) {
  return useQuery({
    queryKey: ["commentaryForPassage", sourceId, bookId, chapter, verse],
    queryFn: () => api.getCommentaryForPassage(sourceId as number, bookId as number, chapter as number, verse),
    enabled: sourceId != null && bookId != null && chapter != null,
  });
}

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

export function useCrossReferences(bookId: number | null, chapter: number | null, verse: number | null) {
  return useQuery({
    queryKey: ["crossReferences", bookId, chapter, verse],
    queryFn: () => api.getCrossReferences(bookId as number, chapter as number, verse as number),
    enabled: bookId != null && chapter != null && verse != null,
  });
}

export function useConfessionForPassage(bookId: number | null, chapter: number | null, verse: number | null) {
  return useQuery({
    queryKey: ["confessionForPassage", bookId, chapter, verse],
    queryFn: () => api.getConfessionForPassage(bookId as number, chapter as number, verse as number),
    enabled: bookId != null && chapter != null && verse != null,
  });
}

export function useMetricalPsalm(psalm: number | null) {
  return useQuery({
    queryKey: ["metricalPsalm", psalm],
    queryFn: () => api.getMetricalPsalm(psalm as number),
    enabled: psalm != null,
    staleTime: Infinity,
  });
}

/** Every tune the app carries, for the tune index. */
export function useAllPsalmTunes() {
  return useQuery({
    queryKey: ["psalmTunes", "all"],
    queryFn: () => api.listPsalmTunes(),
    staleTime: Infinity,
  });
}

/** The tunes a psalm in this metre can be sung to. Metre is the whole of the
 *  match: any Common Metre tune carries any Common Metre psalm. */
export function usePsalmTunes(metre: string | null) {
  return useQuery({
    queryKey: ["psalmTunes", metre],
    queryFn: () => api.listPsalmTunes(metre ?? undefined),
    enabled: metre != null,
    staleTime: Infinity,
  });
}

export function useWestminsterDocuments() {
  return useQuery({ queryKey: ["westminsterDocuments"], queryFn: api.listWestminsterDocuments, staleTime: Infinity });
}

export function useWestminsterSections(documentId: number | null) {
  return useQuery({
    queryKey: ["westminsterSections", documentId],
    queryFn: () => api.listWestminsterSections(documentId as number),
    enabled: documentId != null,
    staleTime: Infinity,
  });
}

export function useWestminsterSection(id: number | null) {
  return useQuery({
    queryKey: ["westminsterSection", id],
    queryFn: () => api.getWestminsterSection(id as number),
    enabled: id != null,
  });
}

export function useDoctrineTopics() {
  return useQuery({ queryKey: ["doctrineTopics"], queryFn: api.listDoctrineTopics, staleTime: Infinity });
}

export function useDoctrineTopic(id: number | null) {
  return useQuery({
    queryKey: ["doctrineTopic", id],
    queryFn: () => api.getDoctrineTopic(id as number),
    enabled: id != null,
  });
}

export function useWestminsterCommentarySources() {
  return useQuery({
    queryKey: ["westminsterCommentarySources"],
    queryFn: api.listWestminsterCommentarySources,
    staleTime: Infinity,
  });
}

export function useWestminsterCommentary(sourceId: number | null, chapter: number | null) {
  return useQuery({
    queryKey: ["westminsterCommentary", sourceId, chapter],
    queryFn: () => api.getWestminsterCommentary(sourceId as number, chapter as number),
    enabled: sourceId != null && chapter != null,
  });
}

export function useResources() {
  return useQuery({ queryKey: ["resources"], queryFn: api.listResources });
}

/** Every shipped book's shelf and subject, by file name. */
export function useLibraryCatalog() {
  return useQuery({
    queryKey: ["libraryCatalog"],
    queryFn: async () => new Map((await api.libraryCatalog()).map((e) => [e.file_name, e])),
    staleTime: Infinity,
  });
}

export function useResource(id: number | null) {
  return useQuery({
    queryKey: ["resource", id],
    queryFn: () => api.getResource(id as number),
    enabled: id != null,
  });
}

export function useResourceText(id: number | null) {
  return useQuery({
    queryKey: ["resourceText", id],
    queryFn: () => api.getResourceText(id as number),
    enabled: id != null,
    staleTime: Infinity,
  });
}

export function useAddResource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { token: string; title: string; author?: string }) =>
      api.addResource(input.token, input.title, input.author),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["resources"] }),
  });
}

export function useDeleteResource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.deleteResource,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["resources"] }),
  });
}

/** Renames a resource and sets or clears its author. */
export function useUpdateResource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: number; title: string; author: string | null }) => api.updateResource(input.id, input.title, input.author),
    onSuccess: (_, input) => {
      qc.invalidateQueries({ queryKey: ["resources"] });
      qc.invalidateQueries({ queryKey: ["resource", input.id] });
    },
  });
}

/** One author for several resources at once. */
export function useSetAuthorForResources() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { ids: number[]; author: string | null }) => api.setAuthorForResources(input.ids, input.author),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["resources"] }),
  });
}

/** Reads a resource's text out of its file again; see `reextract_resource`. */
export function useReextractResource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.reextractResource,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["resources"] }),
  });
}

export function useResourcePassageLinksForChapter(bookId: number | null, chapter: number | null) {
  return useQuery({
    queryKey: ["resourcePassageLinks", bookId, chapter],
    queryFn: () => api.listResourcePassageLinksForChapter(bookId as number, chapter as number),
    enabled: bookId != null && chapter != null,
  });
}

export function useResourcePassageLinksForResource(resourceId: number | null) {
  return useQuery({
    queryKey: ["resourcePassageLinksForResource", resourceId],
    queryFn: () => api.listResourcePassageLinksForResource(resourceId as number),
    enabled: resourceId != null,
  });
}

export function useSuggestedResourcesForPassage(bookId: number | null, chapter: number | null) {
  return useQuery({
    queryKey: ["suggestedResources", bookId, chapter],
    queryFn: () => api.suggestResourcesForPassage(bookId as number, chapter as number),
    enabled: bookId != null && chapter != null,
  });
}

export function useSuggestedResourcesForTopic(topicId: number | null) {
  return useQuery({
    queryKey: ["suggestedResourcesForTopic", topicId],
    queryFn: () => api.suggestResourcesForTopic(topicId as number),
    enabled: topicId != null,
  });
}

export function useAllResourceTags() {
  return useQuery({ queryKey: ["allResourceTags"], queryFn: api.listAllResourceTags });
}

export function useAllResourceTagsByResource() {
  return useQuery({ queryKey: ["allResourceTagsByResource"], queryFn: api.listAllResourceTagsByResource });
}

export function useAddResourceTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { resourceId: number; tag: string }) => api.addResourceTag(input.resourceId, input.tag),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["allResourceTags"] });
      qc.invalidateQueries({ queryKey: ["allResourceTagsByResource"] });
    },
  });
}

export function useRemoveResourceTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { resourceId: number; tag: string }) => api.removeResourceTag(input.resourceId, input.tag),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["allResourceTags"] });
      qc.invalidateQueries({ queryKey: ["allResourceTagsByResource"] });
    },
  });
}

export function useStrongsEntry(id: string | null) {
  return useQuery({
    queryKey: ["strongs", id],
    queryFn: () => api.getStrongsEntry(id as string),
    enabled: id != null,
    staleTime: Infinity,
  });
}

/** All verses using a given Strong's-tagged word, with KJV context -- not
 * fetched until the concordance section is actually opened ( `enabled`),
 * since a common word's occurrence list can be large and most lexicon
 * lookups never open it. */
export function useConcordance(strongsId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["concordance", strongsId],
    queryFn: () => api.getConcordance(strongsId as string),
    enabled: enabled && strongsId != null,
    staleTime: Infinity,
  });
}

export function useDictionaryIndex() {
  return useQuery({ queryKey: ["dictionaryIndex"], queryFn: api.listDictionaryIndex, staleTime: Infinity });
}

export function useDictionaryEntry(slug: string | null) {
  return useQuery({
    queryKey: ["dictionaryEntry", slug],
    queryFn: () => api.getDictionaryEntry(slug as string),
    enabled: slug != null,
  });
}

export function useDictionaryEntryByTerm(term: string | null) {
  return useQuery({
    queryKey: ["dictionaryEntryByTerm", term],
    queryFn: () => api.findDictionaryEntryByTerm(term as string),
    enabled: term != null,
  });
}

export function useIsbeIndex() {
  return useQuery({ queryKey: ["isbeIndex"], queryFn: api.listIsbeIndex, staleTime: Infinity });
}

export function useIsbeEntry(slug: string | null) {
  return useQuery({
    queryKey: ["isbeEntry", slug],
    queryFn: () => api.getIsbeEntry(slug as string),
    enabled: slug != null,
  });
}

export function useIsbeEntryByTerm(term: string | null) {
  return useQuery({
    queryKey: ["isbeEntryByTerm", term],
    queryFn: () => api.findIsbeEntryByTerm(term as string),
    enabled: term != null,
  });
}

/** The encyclopedia articles that discuss the open chapter -- what makes the
 *  encyclopedia meet the reader in the text instead of waiting to be searched. */
export function useIsbeForPassage(bookId: number | null, chapter: number | null, verse?: number | null) {
  return useQuery({
    queryKey: ["isbeForPassage", bookId, chapter, verse ?? null],
    queryFn: () => api.isbeForPassage(bookId as number, chapter as number, verse ?? null),
    enabled: bookId != null && chapter != null,
    staleTime: Infinity,
  });
}

/** The dictionary entry on the same subject as an ISBE article, matched
 *  through the article's alternate headwords as well as its title. */
export function useDictionaryEntryForIsbe(slug: string | null) {
  return useQuery({
    queryKey: ["dictionaryEntryForIsbe", slug],
    queryFn: () => api.findDictionaryEntryForIsbe(slug as string),
    enabled: slug != null,
  });
}

/** The whole gazetteer. 1,342 rows held for the session: the map redraws on
 *  every pan and zoom, and it must not go to the database to do it. */
export function useAtlasPlaces() {
  return useQuery({ queryKey: ["atlasPlaces"], queryFn: api.listAtlasPlaces, staleTime: Infinity });
}

export function useAtlasJourneys() {
  return useQuery({ queryKey: ["atlasJourneys"], queryFn: api.listAtlasJourneys, staleTime: Infinity });
}

export function useAtlasPlaceVerses(slug: string | null) {
  return useQuery({
    queryKey: ["atlasPlaceVerses", slug],
    queryFn: () => api.getAtlasPlaceVerses(slug as string),
    enabled: slug != null,
  });
}

/** The places named in the chapter the reader has open -- what makes an
 *  atlas pane follow along beside a Bible pane. */
export function usePlacesInPassage(bookId: number | null, chapter: number | null) {
  return useQuery({
    queryKey: ["placesInPassage", bookId, chapter],
    queryFn: () => api.placesInPassage(bookId as number, chapter as number),
    enabled: bookId != null && chapter != null,
    staleTime: Infinity,
  });
}

export function useInterlinearForChapter(bookId: number | null, chapter: number | null) {
  return useQuery({
    queryKey: ["interlinear", bookId, chapter],
    queryFn: () => api.getInterlinearForChapter(bookId as number, chapter as number),
    enabled: bookId != null && chapter != null,
  });
}

export function useMorphologyForChapter(bookId: number | null, chapter: number | null) {
  return useQuery({
    queryKey: ["morphology", bookId, chapter],
    queryFn: () => api.getMorphologyForChapter(bookId as number, chapter as number),
    enabled: bookId != null && chapter != null,
  });
}

export function useFootnotesForChapter(translationId: number | null, bookId: number | null, chapter: number | null) {
  return useQuery({
    queryKey: ["footnotes", translationId, bookId, chapter],
    queryFn: () => api.getFootnotesForChapter(translationId as number, bookId as number, chapter as number),
    enabled: translationId != null && bookId != null && chapter != null,
  });
}

export function usePrayerEntries() {
  return useQuery({ queryKey: ["prayerEntries"], queryFn: api.listPrayerEntries });
}

export function useCreatePrayerEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createPrayerEntry,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prayerEntries"] }),
  });
}

export function useUpdatePrayerEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      id: number;
      entryDate: string;
      mode: PrayerEntryMode;
      adoration?: string;
      confession?: string;
      thanksgiving?: string;
      supplication?: string;
      freeText?: string;
      bookId?: number;
      chapter?: number;
      verseStart?: number;
      verseEnd?: number;
    }) => api.updatePrayerEntry(input.id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prayerEntries"] }),
  });
}

export function useDeletePrayerEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.deletePrayerEntry,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prayerEntries"] });
      qc.invalidateQueries({ queryKey: ["prayerEntrySearch"] });
      qc.invalidateQueries({ queryKey: ["allPrayerEntryTags"] });
      qc.invalidateQueries({ queryKey: ["allPrayerEntryTagsByEntry"] });
      qc.invalidateQueries({ queryKey: ["trash"] });
    },
  });
}

export function useAllPrayerEntryTags() {
  return useQuery({ queryKey: ["allPrayerEntryTags"], queryFn: api.listAllPrayerEntryTags });
}

export function useAllPrayerEntryTagsByEntry() {
  return useQuery({ queryKey: ["allPrayerEntryTagsByEntry"], queryFn: api.listAllPrayerEntryTagsByEntry });
}

export function useAddPrayerEntryTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { prayerEntryId: number; tag: string }) => api.addPrayerEntryTag(input.prayerEntryId, input.tag),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["allPrayerEntryTags"] });
      qc.invalidateQueries({ queryKey: ["allPrayerEntryTagsByEntry"] });
    },
  });
}

export function useRemovePrayerEntryTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { prayerEntryId: number; tag: string }) => api.removePrayerEntryTag(input.prayerEntryId, input.tag),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["allPrayerEntryTags"] });
      qc.invalidateQueries({ queryKey: ["allPrayerEntryTagsByEntry"] });
    },
  });
}

export function usePrayerListPeople() {
  return useQuery({ queryKey: ["prayerListPeople"], queryFn: api.listPrayerListPeople });
}

export function useCreatePrayerListPerson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createPrayerListPerson,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prayerListPeople"] }),
  });
}

export function useUpdatePrayerListPerson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: number; name: string; category?: string; notes?: string }) =>
      api.updatePrayerListPerson(input.id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prayerListPeople"] }),
  });
}

export function useSetPrayerListPersonActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: number; active: boolean }) => api.setPrayerListPersonActive(input.id, input.active),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prayerListPeople"] }),
  });
}

export function useMarkPrayerListPersonPrayed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.markPrayerListPersonPrayed,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prayerListPeople"] }),
  });
}

export function useMarkPrayerListPersonAnswered() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: number; answerNote?: string }) => api.markPrayerListPersonAnswered(input.id, input.answerNote),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prayerListPeople"] }),
  });
}

export function useDeletePrayerListPerson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.deletePrayerListPerson,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prayerListPeople"] }),
  });
}

/** Everything a change to a memory card can touch: both decks, what is due,
 * the passages a review can move on, and the review calendar. */
function invalidateMemory(qc: ReturnType<typeof useQueryClient>) {
  for (const key of ["memoryVerses", "dueMemoryVerses", "memoryPassages", "memoryReviewTimes", "catechismMemory", "dueCatechismMemory"]) {
    qc.invalidateQueries({ queryKey: [key] });
  }
}

export function useMemoryPassages() {
  return useQuery({ queryKey: ["memoryPassages"], queryFn: api.listMemoryPassages });
}

export function useCreateMemoryPassage() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: api.createMemoryPassage, onSuccess: () => invalidateMemory(qc) });
}

export function useAddNextMemoryPassagePart() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: api.addNextMemoryPassagePart, onSuccess: () => invalidateMemory(qc) });
}

export function useDeleteMemoryPassage() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: api.deleteMemoryPassage, onSuccess: () => invalidateMemory(qc) });
}

export function useSetMemoryVerseAskReference() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: number; askReference: boolean }) => api.setMemoryVerseAskReference(input.id, input.askReference),
    onSuccess: () => invalidateMemory(qc),
  });
}

/** Reviews of either deck since `since` (RFC 3339), for the calendar. */
export function useMemoryReviewTimes(since: string) {
  return useQuery({ queryKey: ["memoryReviewTimes", since], queryFn: () => api.listMemoryReviewTimes(since) });
}

export function useMemoryVerses() {
  return useQuery({ queryKey: ["memoryVerses"], queryFn: api.listMemoryVerses });
}

export function useDueMemoryVerses() {
  return useQuery({ queryKey: ["dueMemoryVerses"], queryFn: api.listDueMemoryVerses });
}

export function useCreateMemoryVerse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      bookId: number;
      chapter: number;
      verseStart: number;
      verseEnd: number;
      translationId?: number;
      mode: MemoryMode;
      setName?: string | null;
      askReference?: boolean;
    }) =>
      api.createMemoryVerse(input.bookId, input.chapter, input.verseStart, input.verseEnd, input.translationId, input.mode, input.setName, input.askReference),
    onSuccess: () => invalidateMemory(qc),
  });
}

export function useSetMemoryVerseMode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: number; mode: MemoryMode }) => api.setMemoryVerseMode(input.id, input.mode),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["memoryVerses"] }),
  });
}

/** Pins a card to a translation (null: the reader's current one). */
export function useSetMemoryVerseTranslation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: number; translationId: number | null }) => api.setMemoryVerseTranslation(input.id, input.translationId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["memoryVerses"] });
      qc.invalidateQueries({ queryKey: ["dueMemoryVerses"] });
    },
  });
}

export function useDeleteMemoryVerse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.deleteMemoryVerse,
    onSuccess: () => invalidateMemory(qc),
  });
}

export function useReviewMemoryVerse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: number; quality: number }) => api.reviewMemoryVerse(input.id, input.quality),
    // A review can bring on a passage's next part, and goes in the calendar.
    onSuccess: () => invalidateMemory(qc),
  });
}

export function useSetMemoryVerseDoctrinalLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: number; westminsterSectionId: number | null; doctrinalNote: string | null }) =>
      api.setMemoryVerseDoctrinalLink(input.id, input.westminsterSectionId, input.doctrinalNote),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["memoryVerses"] });
      qc.invalidateQueries({ queryKey: ["dueMemoryVerses"] });
    },
  });
}

export function useCatechismMemory() {
  return useQuery({ queryKey: ["catechismMemory"], queryFn: api.listCatechismMemory });
}

export function useDueCatechismMemory() {
  return useQuery({ queryKey: ["dueCatechismMemory"], queryFn: api.listDueCatechismMemory });
}

export function useCreateCatechismMemory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { westminsterSectionId: number; mode: MemoryMode }) =>
      api.createCatechismMemory(input.westminsterSectionId, input.mode),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["catechismMemory"] });
      qc.invalidateQueries({ queryKey: ["dueCatechismMemory"] });
    },
  });
}

export function useSetCatechismMemoryMode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: number; mode: MemoryMode }) => api.setCatechismMemoryMode(input.id, input.mode),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catechismMemory"] }),
  });
}

export function useDeleteCatechismMemory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.deleteCatechismMemory,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["catechismMemory"] });
      qc.invalidateQueries({ queryKey: ["dueCatechismMemory"] });
    },
  });
}

export function useReviewCatechismMemory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: number; quality: number }) => api.reviewCatechismMemory(input.id, input.quality),
    onSuccess: () => invalidateMemory(qc),
  });
}

export function useReadingPlans() {
  return useQuery({ queryKey: ["readingPlans"], queryFn: api.listReadingPlans, staleTime: Infinity });
}

export function useReadingPlanDays(planCode: string | null) {
  return useQuery({
    queryKey: ["readingPlanDays", planCode],
    queryFn: () => api.getReadingPlanDays(planCode!),
    enabled: planCode != null,
    staleTime: Infinity,
  });
}

export function useReadingPlanProgressList() {
  return useQuery({ queryKey: ["readingPlanProgress"], queryFn: api.listReadingPlanProgress });
}

export function useStartReadingPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { planCode: string; startDate: string }) => api.startReadingPlan(input.planCode, input.startDate),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["readingPlanProgress"] }),
  });
}

export function useAbandonReadingPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.abandonReadingPlan,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["readingPlanProgress"] }),
  });
}

export function useMarkReadingPlanDay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { planCode: string; dayNumber: number }) => api.markReadingPlanDay(input.planCode, input.dayNumber),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["readingPlanProgress"] }),
  });
}

export function useUnmarkReadingPlanDay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { planCode: string; dayNumber: number }) => api.unmarkReadingPlanDay(input.planCode, input.dayNumber),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["readingPlanProgress"] }),
  });
}

/** Catch-up (F3.3): "Shift my schedule". */
export function useShiftReadingPlanStart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { planCode: string; days: number }) => api.shiftReadingPlanStart(input.planCode, input.days),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["readingPlanProgress"] }),
  });
}

/** Catch-up (F3.3): "Skip to today" and its undo. */
export function useSetReadingPlanDays() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { planCode: string; dayNumbers: number[]; done: boolean }) => api.setReadingPlanDays(input.planCode, input.dayNumbers, input.done),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["readingPlanProgress"] }),
  });
}

// Custom plans (F4.2)

export interface UserPlanInput {
  title: string;
  description?: string;
  weekdays: number[] | null;
  days: PlanReadingInput[][];
}

export function useCreateUserReadingPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UserPlanInput) => api.createUserReadingPlan(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["readingPlans"] }),
  });
}

export function useUpdateUserReadingPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { planCode: string } & UserPlanInput) => api.updateUserReadingPlan(input.planCode, input),
    onSuccess: (_plan, input) => {
      qc.invalidateQueries({ queryKey: ["readingPlans"] });
      qc.invalidateQueries({ queryKey: ["readingPlanDays", input.planCode] });
      qc.invalidateQueries({ queryKey: ["readingPlanProgress"] });
    },
  });
}

export function useDeleteUserReadingPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.deleteUserReadingPlan,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["readingPlans"] });
      qc.invalidateQueries({ queryKey: ["readingPlanProgress"] });
    },
  });
}

/** Catch-up (F4.2): "Shift my schedule" for every kind of plan. */
export function useReanchorReadingPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { planCode: string; dayNumber: number; date: string }) => api.reanchorReadingPlan(input.planCode, input.dayNumber, input.date),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["readingPlanProgress"] }),
  });
}

/** Catch-up (F4.2): "Spread over seven days". */
export function useSpreadReadingPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { planCode: string; today: string; window?: number }) => api.spreadReadingPlan(input.planCode, input.today, input.window),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["readingPlanProgress"] }),
  });
}

/** The undo of a spread: puts the captured schedule rows back. */
export function useSetReadingPlanSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { planCode: string; entries: ScheduleEntry[] }) => api.setReadingPlanSchedule(input.planCode, input.entries),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["readingPlanProgress"] }),
  });
}

export function useRecentSearches() {
  return useQuery({ queryKey: ["recentSearches"], queryFn: () => api.listRecentSearches() });
}

export function useSavedSearches() {
  return useQuery({ queryKey: ["savedSearches"], queryFn: api.listSavedSearches });
}

export function useSetSearchSaved() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { query: string; saved: boolean }) => api.setSearchSaved(input.query, input.saved),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recentSearches"] });
      qc.invalidateQueries({ queryKey: ["savedSearches"] });
    },
  });
}

export function useDeleteSearchHistory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.deleteSearchHistory,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recentSearches"] });
      qc.invalidateQueries({ queryKey: ["savedSearches"] });
    },
  });
}

export function useBackups() {
  return useQuery({ queryKey: ["backups"], queryFn: api.listBackups });
}

/** Whether the book library pack is installed, and which one. */
export function usePackStatus() {
  return useQuery({ queryKey: ["packStatus"], queryFn: api.packStatus });
}

/** Every installed pack (shelf). */
export function usePackStatuses() {
  return useQuery({ queryKey: ["packStatuses"], queryFn: api.packStatuses });
}

/**
 * Everything a pack install or removal changes.
 *
 * A pack is several hundred books arriving at once, so nothing that lists
 * resources, searches them, or counts them is still correct afterwards --
 * hence a broad invalidation rather than a careful one.
 */
export function useInvalidateAfterPackChange() {
  const qc = useQueryClient();
  return () => {
    for (const key of [
      "packStatus",
      "packStatuses",
      "citations",
      "citationCounts",
      "resources",
      "resource",
      "resourceText",
      "allResourceTags",
      "allResourceTagsByResource",
      "suggestedResources",
      "suggestedResourcesForTopic",
      "stats",
    ]) {
      qc.invalidateQueries({ queryKey: [key] });
    }
  };
}

export function useCreateBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createBackup,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["backups"] }),
  });
}

/** Study statistics (F3.5). Fetched when the Stats block or the launch
 * backup reminder asks; refetched whenever it is shown again. */
export function useStats() {
  return useQuery({ queryKey: ["stats"], queryFn: api.getStats, staleTime: 0 });
}

export function useBackupSyncFolder() {
  return useQuery({ queryKey: ["backupSyncFolder"], queryFn: api.getBackupSyncFolder });
}

export function useSetBackupSyncFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.setBackupSyncFolder,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["backupSyncFolder"] }),
  });
}

export function useBulkImportResources() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.bulkImportResources,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["resources"] }),
  });
}

export function useHarmonies() {
  return useQuery({ queryKey: ["harmonies"], queryFn: api.listHarmonies, staleTime: Infinity });
}

/** One harmony whole. `code` of null asks for the first in picker order. */
export function useHarmony(code: string | null) {
  return useQuery({
    queryKey: ["harmony", code],
    queryFn: () => api.getHarmony(code),
    staleTime: Infinity,
  });
}

export function useRedLetterRanges(bookId: number | null, chapter: number | null) {
  return useQuery({
    queryKey: ["redLetterRanges", bookId, chapter],
    queryFn: () => api.getRedLetterRanges(bookId!, chapter!),
    enabled: bookId != null && chapter != null,
    staleTime: Infinity,
  });
}

// --- Sermon Builder -------------------------------------------------------
//
// Every sermon mutation invalidates the same keys: the list the Sermons page
// reads, the one sermon a pane holds, the per-chapter listing the Mine pane
// and the Bible pane's related area read, and the measured speaking rate,
// since a logged run changes every "about 31 minutes" in the app.

function invalidateSermons(qc: ReturnType<typeof useQueryClient>, sermonId?: number) {
  qc.invalidateQueries({ queryKey: ["sermons"] });
  qc.invalidateQueries({ queryKey: ["sermonSeries"] });
  qc.invalidateQueries({ queryKey: ["sermonsForChapter"] });
  qc.invalidateQueries({ queryKey: ["speakingRate"] });
  qc.invalidateQueries({ queryKey: ["sermonTags"] });
  qc.invalidateQueries({ queryKey: ["trash"] });
  if (sermonId != null) qc.invalidateQueries({ queryKey: ["sermon", sermonId] });
}

export function useSermons(filter: SermonFilter = {}) {
  return useQuery({ queryKey: ["sermons", filter], queryFn: () => api.listSermons(filter) });
}

export function useSermon(sermonId: number | null) {
  return useQuery({
    queryKey: ["sermon", sermonId],
    queryFn: () => api.getSermon(sermonId as number),
    enabled: sermonId != null,
  });
}

export function useCreateSermon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SermonInput = {}) => api.createSermon(input),
    onSuccess: (sermon) => invalidateSermons(qc, sermon.id),
  });
}

export function useUpdateSermon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { sermonId: number; input: SermonInput }) => api.updateSermon(input.sermonId, input.input),
    onSuccess: (sermon) => invalidateSermons(qc, sermon.id),
  });
}

export function useSetSermonStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { sermonId: number; stage: SermonStage }) => api.setSermonStage(input.sermonId, input.stage),
    onSuccess: (_data, input) => invalidateSermons(qc, input.sermonId),
  });
}

export function useDeleteSermon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sermonId: number) => api.deleteSermon(sermonId),
    onSuccess: (_data, sermonId) => {
      invalidateSermons(qc, sermonId);
      // Its ideas go back to the inbox while it is in the Trash. Not in
      // invalidateSermons, which every autosave runs.
      qc.invalidateQueries({ queryKey: ["sermonIdeas"] });
    },
  });
}

/** The Undo behind "Sermon deleted" and the Trash's Restore. */
export function useRestoreSermon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sermonId: number) => api.restoreTrashItem("sermon", sermonId),
    onSuccess: (_data, sermonId) => {
      invalidateSermons(qc, sermonId);
      qc.invalidateQueries({ queryKey: ["sermonIdeas"] });
    },
  });
}

export function useDuplicateSermon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sermonId: number) => api.duplicateSermon(sermonId),
    onSuccess: (sermon) => invalidateSermons(qc, sermon.id),
  });
}

export function useSermonTags() {
  return useQuery({ queryKey: ["sermonTags"], queryFn: api.listAllSermonTags });
}

export function useSermonsForChapter(bookId: number | null, chapter: number | null) {
  return useQuery({
    queryKey: ["sermonsForChapter", bookId, chapter],
    queryFn: () => api.listSermonsForChapter(bookId as number, chapter as number),
    enabled: bookId != null && chapter != null,
  });
}

export function useAddSermonEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.addSermonEvent,
    onSuccess: (event) => invalidateSermons(qc, event.sermon_id),
  });
}

export function useDeleteSermonEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { eventId: number; sermonId: number }) => api.deleteSermonEvent(input.eventId),
    onSuccess: (_data, input) => invalidateSermons(qc, input.sermonId),
  });
}

/** The measured rate, or null until two timed runs exist (SB2.4). */
export function useSpeakingRate() {
  return useQuery({ queryKey: ["speakingRate"], queryFn: api.getSpeakingRate });
}

export function useSermonSeries() {
  return useQuery({ queryKey: ["sermonSeries"], queryFn: api.listSermonSeries });
}

export function useCreateSermonSeries() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { title: string; description?: string | null }) =>
      api.createSermonSeries(input.title, input.description),
    onSuccess: () => invalidateSermons(qc),
  });
}

export function useUpdateSermonSeries() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { seriesId: number; title: string; description: string | null; planCode: string | null }) =>
      api.updateSermonSeries(input.seriesId, input.title, input.description, input.planCode),
    onSuccess: () => invalidateSermons(qc),
  });
}

export function useDeleteSermonSeries() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (seriesId: number) => api.deleteSermonSeries(seriesId),
    onSuccess: () => invalidateSermons(qc),
  });
}

// --- Sermon ideas (USER_MIGRATION_0022) -------------------------------------

export function useSermonIdeas() {
  return useQuery({ queryKey: ["sermonIdeas"], queryFn: api.listSermonIdeas });
}

export function useCreateSermonIdea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SermonIdeaInput) => api.createSermonIdea(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sermonIdeas"] }),
  });
}

export function useUpdateSermonIdea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { ideaId: number; input: SermonIdeaInput }) => api.updateSermonIdea(input.ideaId, input.input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sermonIdeas"] }),
  });
}

export function useFileSermonIdea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { ideaId: number; sermonId: number | null }) => api.fileSermonIdea(input.ideaId, input.sermonId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sermonIdeas"] }),
  });
}

export function useDeleteSermonIdea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ideaId: number) => api.deleteSermonIdea(ideaId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sermonIdeas"] }),
  });
}

function invalidateIllustrations(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["illustrations"] });
  qc.invalidateQueries({ queryKey: ["illustration"] });
  qc.invalidateQueries({ queryKey: ["illustrationUses"] });
  qc.invalidateQueries({ queryKey: ["illustrationTags"] });
  qc.invalidateQueries({ queryKey: ["trash"] });
}

export function useIllustrations(filter: IllustrationFilter = {}) {
  return useQuery({ queryKey: ["illustrations", filter], queryFn: () => api.listIllustrations(filter) });
}

export function useIllustration(illustrationId: number | null) {
  return useQuery({
    queryKey: ["illustration", illustrationId],
    queryFn: () => api.getIllustration(illustrationId as number),
    enabled: illustrationId != null,
  });
}

export function useCreateIllustration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: IllustrationInput) => api.createIllustration(input),
    onSuccess: () => invalidateIllustrations(qc),
  });
}

export function useUpdateIllustration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { illustrationId: number; input: IllustrationInput }) =>
      api.updateIllustration(input.illustrationId, input.input),
    onSuccess: () => invalidateIllustrations(qc),
  });
}

export function useDeleteIllustration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (illustrationId: number) => api.deleteIllustration(illustrationId),
    onSuccess: () => invalidateIllustrations(qc),
  });
}

export function useRestoreIllustration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (illustrationId: number) => api.restoreTrashItem("illustration", illustrationId),
    onSuccess: () => invalidateIllustrations(qc),
  });
}

export function useIllustrationTags() {
  return useQuery({ queryKey: ["illustrationTags"], queryFn: api.listAllIllustrationTags });
}

export function useIllustrationUses(illustrationId?: number) {
  return useQuery({
    queryKey: ["illustrationUses", illustrationId ?? null],
    queryFn: () => api.listIllustrationUses(illustrationId),
  });
}

export function useRecordIllustrationUse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { illustrationId: number; sermonId: number }) =>
      api.recordIllustrationUse(input.illustrationId, input.sermonId),
    onSuccess: () => invalidateIllustrations(qc),
  });
}

export type { Verse };
