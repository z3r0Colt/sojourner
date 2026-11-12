// The Books page: the reader's own books and the shelves', their text, links to passages, and tags.
// One part of the data hooks; import these from "api/queries" (index.ts).

import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { api } from "../client";

export function useResources() {
  return useQuery({ queryKey: ["resources"], queryFn: api.listResources });
}

/** Every shipped book's shelf and subject, by file name. */
export function useLibraryCatalog() {
  return useQuery({
    queryKey: ["libraryCatalog"],
    queryFn: async () => new Map((await api.libraryCatalog()).map((e) => [e.file_name, e])),
    staleTime: Infinity,
  });
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
    mutationFn: (input: { token: string; title: string; author?: string }) =>
      api.addResource(input.token, input.title, input.author),
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

/** Renames a resource and sets or clears its author. */
export function useUpdateResource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: number; title: string; author: string | null }) => api.updateResource(input.id, input.title, input.author),
    onSuccess: (_, input) => {
      qc.invalidateQueries({ queryKey: ["resources"] });
      qc.invalidateQueries({ queryKey: ["resource", input.id] });
    },
  });
}

/** One author for several resources at once. */
export function useSetAuthorForResources() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { ids: number[]; author: string | null }) => api.setAuthorForResources(input.ids, input.author),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["resources"] }),
  });
}

/** Reads a resource's text out of its file again; see `reextract_resource`. */
export function useReextractResource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.reextractResource,
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
