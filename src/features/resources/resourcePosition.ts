import { useCallback, useEffect, useRef } from "react";
import { useSetting } from "../../hooks/useSetting";

/**
 * Where the reader left off in a resource (F3.4): an epub.js CFI for an
 * EPUB, a page number for a PDF. One setting per resource,
 * `resource_pos:<id>`, so it survives a reinstall and travels with
 * backups. Saves are debounced by half a second because scrolling an EPUB
 * reports a new location on every pause.
 */
export interface ResourcePos {
  cfi?: string;
  page?: number;
}

const NONE: ResourcePos = {};
const SAVE_DELAY_MS = 500;

export function resourcePosKey(id: number): string {
  return `resource_pos:${id}`;
}

export function useResourcePosition(id: number | null): { pos: ResourcePos; savePos: (patch: ResourcePos) => void; isLoaded: boolean } {
  const [pos, setPos, { isLoaded }] = useSetting<ResourcePos>(resourcePosKey(id ?? 0), NONE);
  const timer = useRef<number | null>(null);
  const pending = useRef<ResourcePos>({});
  const setPosRef = useRef(setPos);
  setPosRef.current = setPos;

  const flush = useCallback(() => {
    if (timer.current != null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    const patch = pending.current;
    pending.current = {};
    if (Object.keys(patch).length === 0) return;
    setPosRef.current((prev) => ({ ...prev, ...patch }));
  }, []);

  const savePos = useCallback(
    (patch: ResourcePos) => {
      pending.current = { ...pending.current, ...patch };
      if (timer.current != null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, SAVE_DELAY_MS);
    },
    [flush],
  );

  // Leaving the resource (or closing the pane) writes whatever is pending.
  useEffect(() => flush, [id, flush]);

  return { pos, savePos, isLoaded };
}
