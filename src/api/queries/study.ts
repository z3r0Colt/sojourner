// What stands beside a passage: cross references, the confessions and their commentaries, the metrical Psalter and its tunes.
// One part of the data hooks; import these from "api/queries" (index.ts).

import { useQuery } from "@tanstack/react-query";
import { api } from "../client";

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

export function useWestminsterParallels(sectionId: number | null) {
  return useQuery({
    queryKey: ["westminsterParallels", sectionId],
    queryFn: () => api.getWestminsterParallels(sectionId as number),
    enabled: sectionId != null,
    staleTime: Infinity,
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
