// Scripture and catechism memory.
// One part of the data hooks; import these from "api/queries" (index.ts).

import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { api } from "../client";
import type { MemoryMode } from "../types";

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
    // The due queue as well: "Practice what's due" asks the cards from it,
    // and with only the deck refreshed it went on showing first letters for
    // a card changed to blank words.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["memoryVerses"] });
      qc.invalidateQueries({ queryKey: ["dueMemoryVerses"] });
    },
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
