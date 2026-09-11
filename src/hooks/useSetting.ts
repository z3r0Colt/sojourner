import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";

/**
 * A preference stored in user.db as JSON, so it survives a reinstall and
 * travels with backups and exports.
 *
 * Rule of thumb for where a preference lives:
 *   - Window and layout state (theme, sidebar width, panel open/closed,
 *     font size) stays in `uiStore` (local storage). Losing it on a fresh
 *     machine is harmless and it must be available before the first paint.
 *   - Anything a user would miss after reinstalling (highlight labels, note
 *     templates, reading positions in a resource, tour completion, backup
 *     snooze) goes through `useSetting`.
 *
 * Returns `[value, setValue, meta]`. `value` is `defaultValue` until the
 * stored one loads and whenever nothing is stored. `setValue` updates the
 * cache immediately (optimistic) and writes through; on failure the cached
 * value rolls back. `meta.isLoaded` is false during the first read, for the
 * rare caller that must not act on the default (e.g. a first-run check).
 */
export function useSetting<T>(
  key: string,
  defaultValue: T,
): [T, (next: T | ((prev: T) => T)) => void, { isLoaded: boolean }] {
  const qc = useQueryClient();
  const queryKey = ["setting", key] as const;

  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<{ value: T | undefined }> => {
      const raw = await api.getSetting(key);
      if (raw == null) return { value: undefined };
      try {
        return { value: JSON.parse(raw) as T };
      } catch {
        // A hand-edited or pre-JSON value: treat as unset rather than crash.
        return { value: undefined };
      }
    },
    staleTime: Infinity,
  });

  const mutation = useMutation({
    mutationFn: (next: T) => api.setSetting(key, JSON.stringify(next)),
    onMutate: async (next: T) => {
      await qc.cancelQueries({ queryKey });
      const previous = qc.getQueryData<{ value: T | undefined }>(queryKey);
      qc.setQueryData<{ value: T | undefined }>(queryKey, { value: next });
      return { previous };
    },
    onError: (_err, _next, ctx) => {
      if (ctx?.previous) qc.setQueryData(queryKey, ctx.previous);
    },
  });

  const stored = query.data?.value;
  const value = stored === undefined ? defaultValue : stored;

  const { mutate } = mutation;
  const setValue = useCallback(
    (next: T | ((prev: T) => T)) => {
      const current = qc.getQueryData<{ value: T | undefined }>(queryKey)?.value;
      const prev = current === undefined ? defaultValue : current;
      const resolved = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
      mutate(resolved);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, mutate, defaultValue],
  );

  return [value, setValue, { isLoaded: query.isSuccess }];
}
