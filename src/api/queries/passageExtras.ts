// What is laid over or beside the text: the harmonies of the Gospels, red letters, and color text.
// One part of the data hooks; import these from "api/queries" (index.ts).

import { useQuery } from "@tanstack/react-query";
import { api } from "../client";

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

/** Color text for a chapter; `translationId` null while color text is off. */
export function useColorText(translationId: number | null, bookId: number | null, chapter: number | null) {
  return useQuery({
    queryKey: ["colorText", translationId, bookId, chapter],
    queryFn: () => api.getColorText(translationId!, bookId!, chapter!),
    enabled: translationId != null && bookId != null && chapter != null,
    staleTime: Infinity,
  });
}

/** Who is speaking in a chapter; `translationId` null while it is off. */
export function useColorVoices(translationId: number | null, bookId: number | null, chapter: number | null) {
  return useQuery({
    queryKey: ["colorVoices", translationId, bookId, chapter],
    queryFn: () => api.getColorVoices(translationId!, bookId!, chapter!),
    enabled: translationId != null && bookId != null && chapter != null,
    staleTime: Infinity,
  });
}

/** Every verse where a colored term has that color. */
export function useColorTermVerses(code: string | null, term: string | null) {
  return useQuery({
    queryKey: ["colorTermVerses", code, term],
    queryFn: () => api.getColorTermVerses(code!, term!),
    enabled: code != null && term != null,
    staleTime: Infinity,
  });
}
