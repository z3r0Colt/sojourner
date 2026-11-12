// The works looked things up in: the lexicons and concordance, the dictionaries and encyclopedia, the atlas, the interlinear and footnotes.
// One part of the data hooks; import these from "api/queries" (index.ts).

import { useQuery } from "@tanstack/react-query";
import { api } from "../client";

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

// Webster's 1828 dictionary is content.db, fixed for the life of the build,
// so every answer is held for the session (`staleTime: Infinity`): the popup
// asking again about a word already looked up costs nothing.

/** What Webster says of a double-clicked word, found under the word it is a
 *  form of where the text inflects it (*prevented* is PREVENT's). Null word:
 *  nothing asked. */
export function useWebsterLookup(word: string | null) {
  const asked = word?.trim() || null;
  return useQuery({
    queryKey: ["websterLookup", asked],
    queryFn: () => api.websterLookup(asked as string),
    enabled: asked != null,
    staleTime: Infinity,
  });
}

/** The Webster search, headwords first. Asked from two letters on, as the
 *  Bible dictionaries' search is; the page debounces what it passes. */
export function useWebsterSearch(query: string) {
  const asked = query.trim();
  return useQuery({
    queryKey: ["websterSearch", asked],
    queryFn: () => api.websterSearch(asked),
    enabled: asked.length > 1,
    staleTime: Infinity,
  });
}

/** A page of the dictionary from `prefix` on ("" is the start of A), at
 *  most `limit` rows: the page passes its page size, since it has to know
 *  whether a page came back full to know whether there is another. */
export function useWebsterBrowse(prefix: string, limit?: number) {
  const from = prefix.trim().toLowerCase();
  return useQuery({
    queryKey: ["websterBrowse", from, limit ?? null],
    queryFn: () => api.websterBrowse(from, limit),
    staleTime: Infinity,
  });
}

export function useWebsterEntry(id: number | null) {
  return useQuery({
    queryKey: ["websterEntry", id],
    queryFn: () => api.websterEntry(id as number),
    enabled: id != null,
    staleTime: Infinity,
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
