import { useMemo } from "react";
import { useSetting } from "../../hooks/useSetting";
import { PURPOSE_SETTING, SIDEBAR_SETTING, isPurpose, shownPages, type Purpose } from "./purpose";

/** What the reader came for (purpose.ts); `null` for someone never asked. */
export function usePurpose(): [Purpose | null, (next: Purpose) => void, { isLoaded: boolean }] {
  const [stored, setStored, meta] = useSetting<Purpose | null>(PURPOSE_SETTING, null);
  return [isPurpose(stored) ? stored : null, setStored, meta];
}

/** The reader's own pick of sidebar pages, or `null` for their purpose's. */
export function useSidebarPages(): [string[] | null, (next: string[] | null) => void] {
  const [stored, setStored] = useSetting<string[] | null>(SIDEBAR_SETTING, null);
  return [Array.isArray(stored) ? stored.filter((r): r is string => typeof r === "string") : null, setStored];
}

/** The routes the sidebar shows. */
export function useShownPages(): ReadonlySet<string> {
  const [purpose] = usePurpose();
  const [own] = useSidebarPages();
  return useMemo(() => shownPages(purpose, own), [purpose, own]);
}
