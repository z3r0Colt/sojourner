import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { api } from "./client";
import type { Verse } from "./types";

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

export function useParallelChapter(translationIds: number[], bookId: number | null, chapter: number | null) {
  return useQuery({
    queryKey: ["parallelChapter", translationIds, bookId, chapter],
    queryFn: () => api.getParallelChapter(translationIds, bookId as number, chapter as number),
    enabled: translationIds.length > 0 && bookId != null && chapter != null,
  });
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
    },
  });
}

export function useDeleteHighlight() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.deleteHighlight,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["highlights"] }),
  });
}

export function useUpdateHighlight() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: number; color: string; style: "highlight" | "underline" }) =>
      api.updateHighlight(input.id, input.color, input.style),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["highlights"] }),
  });
}

export function useCreateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { bookId: number; chapter: number; verseStart: number; verseEnd: number; body: string; highlightId?: number }) =>
      api.createNote(input.bookId, input.chapter, input.verseStart, input.verseEnd, input.body, input.highlightId),
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ["notes", n.book_id, n.chapter] });
      qc.invalidateQueries({ queryKey: ["allNotes"] });
    },
  });
}

export function useUpdateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: number; body: string }) => api.updateNote(input.id, input.body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notes"] });
      qc.invalidateQueries({ queryKey: ["allNotes"] });
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
    },
  });
}

export function useAllNotes() {
  return useQuery({ queryKey: ["allNotes"], queryFn: api.listAllNotes });
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
    mutationFn: (input: { bookId: number; chapter: number; body: string }) =>
      api.createChapterNote(input.bookId, input.chapter, input.body),
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ["chapterNotes", n.book_id, n.chapter] });
      qc.invalidateQueries({ queryKey: ["allChapterNotes"] });
    },
  });
}

export function useUpdateChapterNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: number; body: string }) => api.updateChapterNote(input.id, input.body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chapterNotes"] });
      qc.invalidateQueries({ queryKey: ["allChapterNotes"] });
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

export function useStrongsEntry(id: string | null) {
  return useQuery({
    queryKey: ["strongs", id],
    queryFn: () => api.getStrongsEntry(id as string),
    enabled: id != null,
    staleTime: Infinity,
  });
}

/** All verses using a given Strong's-tagged word, with KJV context -- not
 * fetched until the concordance section is actually opened (`enabled`),
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

export function useSermonNotes() {
  return useQuery({ queryKey: ["sermonNotes"], queryFn: api.listSermonNotes });
}

export function useSermonNote(id: number | null) {
  return useQuery({
    queryKey: ["sermonNote", id],
    queryFn: () => api.getSermonNote(id as number),
    enabled: id != null,
  });
}

export function useCreateSermonNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createSermonNote,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sermonNotes"] }),
  });
}

export function useUpdateSermonNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      id: number;
      date: string;
      preacher?: string;
      title?: string;
      passageText?: string;
      outline?: string;
      application?: string;
    }) => api.updateSermonNote(input.id, input),
    onSuccess: (_r, input) => {
      qc.invalidateQueries({ queryKey: ["sermonNotes"] });
      qc.invalidateQueries({ queryKey: ["sermonNote", input.id] });
    },
  });
}

export function useDeleteSermonNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.deleteSermonNote,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sermonNotes"] }),
  });
}

export function useAddSermonNotePassage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { sermonNoteId: number; bookId: number; chapter: number; verseStart?: number; verseEnd?: number }) =>
      api.addSermonNotePassage(input.sermonNoteId, input.bookId, input.chapter, input.verseStart, input.verseEnd),
    onSuccess: (_r, input) => {
      qc.invalidateQueries({ queryKey: ["sermonNotes"] });
      qc.invalidateQueries({ queryKey: ["sermonNote", input.sermonNoteId] });
    },
  });
}

export function useDeleteSermonNotePassage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.deleteSermonNotePassage,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sermonNotes"] });
      qc.invalidateQueries({ queryKey: ["sermonNote"] });
    },
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
      adoration?: string;
      confession?: string;
      thanksgiving?: string;
      supplication?: string;
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prayerEntries"] }),
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
      mode: "first-letter" | "blank-word";
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
    mutationFn: (input: { id: number; mode: "first-letter" | "blank-word" }) => api.setMemoryVerseMode(input.id, input.mode),
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

export type { Verse };
