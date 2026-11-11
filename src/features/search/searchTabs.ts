import type { Purpose } from "../onboarding/purpose";

/**
 * Which of the search box's thirteen tabs to show. All of them wrapped onto
 * three rows; to someone who came to read, half name a kind of thing they
 * have never opened.
 *
 * A tab shows when it suits what the reader came for, or when the search
 * has found something there (so nothing found is ever hidden), or when it is
 * the tab they are on. With no purpose stored -- someone here before the
 * question was asked -- every tab shows, as it always did.
 */
const ALWAYS = new Set(["all", "verses", "commentary", "notes", "prayer"]);
const STUDY = new Set(["resources", "westminster", "encyclopedia", "lexicons", "factbook", "grammar"]);
const SERMON = new Set(["sermons", "illustrations"]);
const FAMILY = new Set(["westminster"]);

export function searchTabSuits(tab: string, purpose: Purpose | null, sermonTools: boolean): boolean {
  if (purpose == null || purpose === "everything") return true;
  if (ALWAYS.has(tab)) return true;
  if (SERMON.has(tab)) return sermonTools;
  if (purpose === "studying" || purpose === "preaching") return STUDY.has(tab);
  if (purpose === "family") return FAMILY.has(tab);
  return false;
}

export function shownSearchTabs<T extends { key: string; count?: number }>(tabs: readonly T[], current: string, purpose: Purpose | null, sermonTools: boolean): T[] {
  return tabs.filter((t) => t.key === current || (t.count ?? 0) > 0 || searchTabSuits(t.key, purpose, sermonTools));
}
