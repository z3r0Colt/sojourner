// The app's own housekeeping: search history, backups, library and map packs, and the study stats.
// One part of the data hooks; import these from "api/queries" (index.ts).

import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { api } from "../client";
import { onDesktop } from "../../lib/platform";
import { webMapPacks } from "../../web/mapPacks";

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
  // Backups are files on the desktop: a browser on another device has none.
  return useQuery({ queryKey: ["backups"], queryFn: api.listBackups, enabled: onDesktop });
}

/** Whether the book library pack is installed, and which one. */
export function usePackStatus() {
  return useQuery({ queryKey: ["packStatus"], queryFn: api.packStatus });
}

/** Every installed pack (shelf). */
export function usePackStatuses() {
  return useQuery({ queryKey: ["packStatuses"], queryFn: api.packStatuses });
}

/** The installed map packs (terrain, imagery), for the Atlas. */
export function useMapPacks() {
  const { data } = usePackStatuses();
  // On the web the layers are files on R2 the map reads from: always there.
  if (import.meta.env.VITE_TARGET === "web") return webMapPacks();
  return (data ?? []).filter((p) => p.installed && p.kind === "map" && p.map);
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
  return useQuery({ queryKey: ["backupSyncFolder"], queryFn: api.getBackupSyncFolder, enabled: onDesktop });
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
