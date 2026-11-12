// Books, translations, chapters and passages, and where the reader is.
// One part of the data hooks; import these from "api/queries" (index.ts).

import { useMemo } from "react";
import { useQuery, useQueries } from "@tanstack/react-query";
import { api } from "../client";
import type { Passage, PassageRef } from "../types";
import { useReaderTranslationId } from "../../state/workspaceStore";
import { pinnedKey, refKey } from "../../lib/passage";

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
