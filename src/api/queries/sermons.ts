// The Sermon Builder: sermons, series, ideas and illustrations.
// One part of the data hooks; import these from "api/queries" (index.ts).

import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { api } from "../client";
import type { SermonFilter, SermonInput, SermonStage, IllustrationFilter, IllustrationInput, SermonIdeaInput } from "../types";

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
