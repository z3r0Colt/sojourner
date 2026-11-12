// The prayer journal and the prayer list.
// One part of the data hooks; import these from "api/queries" (index.ts).

import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { api } from "../client";
import type { PrayerEntryMode } from "../types";

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
