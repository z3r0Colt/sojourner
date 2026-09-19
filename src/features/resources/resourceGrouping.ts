import type { Resource, ResourceKind } from "../../api/types";
import type { ResourceGroupBy, ResourceKindTab } from "../../state/uiStore";

/** The heading of the group for resources with no author. Not a value
 * stored anywhere: an author is either text or SQL NULL. */
export const NO_AUTHOR = "No author yet";
export const NO_TOPIC = "No topic yet";

export const BOOK_KINDS: ReadonlySet<ResourceKind> = new Set<ResourceKind>(["epub", "pdf", "mobi"]);

export function kindTabOf(kind: ResourceKind): Exclude<ResourceKindTab, "all"> {
  return BOOK_KINDS.has(kind) ? "books" : kind === "audio" ? "audio" : "video";
}

export function filterByKind(resources: Resource[], tab: ResourceKindTab): Resource[] {
  if (tab === "all") return resources;
  return resources.filter((r) => kindTabOf(r.kind) === tab);
}

export interface ResourceGroup {
  key: string;
  /** What the heading says. */
  label: string;
  /** True for the "none yet" groups, which sort last and offer to fix themselves. */
  fallback: boolean;
  items: Resource[];
}

/** Groups in the order they are shown. "recent" is one unnamed group,
 * newest first; "author" and "topic" sort alphabetically with the
 * fallback group last. */
export function groupResources(resources: Resource[], by: ResourceGroupBy, tagsById: Map<number, string[]>): ResourceGroup[] {
  if (by === "recent") {
    const items = [...resources].sort((a, b) => b.added_at.localeCompare(a.added_at));
    return items.length ? [{ key: "recent", label: "", fallback: false, items }] : [];
  }
  const groups = new Map<string, Resource[]>();
  const put = (key: string, r: Resource) => {
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  };
  for (const r of resources) {
    if (by === "author") {
      put(r.author?.trim() || NO_AUTHOR, r);
    } else {
      const tags = tagsById.get(r.id) ?? [];
      if (tags.length === 0) put(NO_TOPIC, r);
      for (const t of tags) put(t, r);
    }
  }
  const fallbackKey = by === "author" ? NO_AUTHOR : NO_TOPIC;
  return [...groups.entries()]
    .sort(([a], [b]) => {
      if (a === fallbackKey) return 1;
      if (b === fallbackKey) return -1;
      return a.localeCompare(b, undefined, { sensitivity: "base" });
    })
    .map(([key, items]) => ({ key, label: key, fallback: key === fallbackKey, items: [...items].sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" })) }));
}

/** "3 books · 2 audio · 1 video", for a group heading on the All tab. */
export function kindSummary(items: Resource[]): string {
  const counts = { books: 0, audio: 0, video: 0 };
  for (const r of items) counts[kindTabOf(r.kind)] += 1;
  const parts: string[] = [];
  if (counts.books) parts.push(`${counts.books} ${counts.books === 1 ? "book" : "books"}`);
  if (counts.audio) parts.push(`${counts.audio} audio`);
  if (counts.video) parts.push(`${counts.video} video`);
  return parts.join(" · ");
}

/** The distinct authors in the library, for suggesting while editing. */
export function knownAuthors(resources: Resource[]): string[] {
  const seen = new Map<string, string>();
  for (const r of resources) {
    const a = r.author?.trim();
    if (a && !seen.has(a.toLowerCase())) seen.set(a.toLowerCase(), a);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

/** "1:23:45" or "12:34". */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

export function fileExtension(path: string): string {
  const m = /\.([A-Za-z0-9]+)$/.exec(path);
  return m ? m[1].toUpperCase() : "";
}
