import { useMemo } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { api } from "./client";
import type { Verse, Passage, PassageRef, PrayerEntryMode, MemoryMode, TrashKind, NoteRefInput, PlanReadingInput, ScheduleEntry } from "./types";
import { toast } from "../components/ui/toast";
import { useReaderTranslationId } from "../state/workspaceStore";
import { refKey } from "../lib/passage";

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

const TRASH_KIND_LABEL: Record<TrashKind, string> = { note: "Note", chapter_note: "Chapter note", prayer_entry: "Entry" };

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
    mutationFn: (input: { sourcePath: string; title: string; author?: string }) =>
      api.addResource(input.sourcePath, input.title, input.author),
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
    }) => api.createMemoryVerse(input.bookId, input.chapter, input.verseStart, input.verseEnd, input.translationId, input.mode),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["memoryVerses"] });
      qc.invalidateQueries({ queryKey: ["dueMemoryVerses"] });
    },
  });
}

export function useSetMemoryVerseMode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: number; mode: MemoryMode }) => api.setMemoryVerseMode(input.id, input.mode),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["memoryVerses"] }),
  });
}

export function useDeleteMemoryVerse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.deleteMemoryVerse,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["memoryVerses"] });
      qc.invalidateQueries({ queryKey: ["dueMemoryVerses"] });
    },
  });
}

export function useReviewMemoryVerse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: number; quality: number }) => api.reviewMemoryVerse(input.id, input.quality),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["memoryVerses"] });
      qc.invalidateQueries({ queryKey: ["dueMemoryVerses"] });
    },
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["catechismMemory"] });
      qc.invalidateQueries({ queryKey: ["dueCatechismMemory"] });
    },
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

export function useHarmonySections() {
  return useQuery({ queryKey: ["harmonySections"], queryFn: api.listHarmonySections, staleTime: Infinity });
}

export function useRedLetterRanges(bookId: number | null, chapter: number | null) {
  return useQuery({
    queryKey: ["redLetterRanges", bookId, chapter],
    queryFn: () => api.getRedLetterRanges(bookId!, chapter!),
    enabled: bookId != null && chapter != null,
    staleTime: Infinity,
  });
}

export type { Verse };
