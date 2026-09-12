import type { PrayerListPerson } from "../../api/types";

/** Time helpers shared by the Prayer list and the Today page's "Pray for"
 * block (F2.5, F3.1). */

export function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return isNaN(days) ? null : Math.max(0, days);
}

export function timeAgo(iso: string | null): string {
  const days = daysSince(iso);
  if (days == null) return "never";
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}

/** Days since this person was last prayed for -- since they were added,
 * when never. Drives the nudge and the "longest since prayed" sort. */
export function daysUnprayed(p: PrayerListPerson): number {
  return daysSince(p.last_prayed_at) ?? daysSince(p.created_at) ?? 0;
}

/** Active people, the most neglected first, ties by name. */
export function longestUnprayed(people: PrayerListPerson[]): PrayerListPerson[] {
  return people.filter((p) => p.active).sort((a, b) => daysUnprayed(b) - daysUnprayed(a) || a.name.localeCompare(b.name));
}
