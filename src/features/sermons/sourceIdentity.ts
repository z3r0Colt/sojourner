import { openContent, openPassage, targetFor } from "../../workspace/openContent";
import type { SermonSourceKind } from "../../api/types";

/**
 * A citation's source identity: the string a sermon stores so "Open source"
 * can put the reader back where the words came from.
 *
 * The plan sketched these as `commentary:entryId` and the like. A commentary
 * entry id alone is not something the app can open -- the commentary pane
 * takes a source, a book, a chapter, and a verse -- so each identity carries
 * exactly what `openContent` needs and nothing more:
 *
 *   commentary:<sourceId>:<bookId>:<chapter>:<verse>
 *   westminster:<docCode>:<sectionId>
 *   strongs:<G1343>
 *   dictionary:<slug>
 *   resource:<id>[:<location>]
 *   crossref:<bookId>:<chapter>:<verse>[:<verseEnd>]
 *   illustration:<id>
 */

export function commentaryRef(sourceId: number, bookId: number, chapter: number, verse: number | null): string {
  return `commentary:${sourceId}:${bookId}:${chapter}:${verse ?? 0}`;
}

export function westminsterRef(docCode: string, sectionId: number): string {
  return `westminster:${docCode}:${sectionId}`;
}

export function strongsRef(id: string): string {
  return `strongs:${id}`;
}

export function dictionaryRef(slug: string): string {
  return `dictionary:${slug}`;
}

export function resourceRef(id: number, location?: string | null): string {
  return location ? `resource:${id}:${location}` : `resource:${id}`;
}

export function crossrefRef(bookId: number, chapter: number, verseStart: number, verseEnd?: number): string {
  return `crossref:${bookId}:${chapter}:${verseStart}${verseEnd && verseEnd !== verseStart ? `:${verseEnd}` : ""}`;
}

export function illustrationRef(id: number): string {
  return `illustration:${id}`;
}

/** True when a citation can be reopened -- "Open source" hides otherwise. */
export function canOpenSource(refId: string | null | undefined): boolean {
  return typeof refId === "string" && refId.includes(":");
}

/**
 * Reopens what a citation came from, in a pane beside the sermon.
 * Ctrl+click and middle-click open a new pane, as everywhere else.
 */
export function openSourceRef(_kind: SermonSourceKind | string, refId: string | null, event?: React.MouseEvent, from?: string): void {
  if (!refId) return;
  const parts = refId.split(":");
  const head = parts[0];
  const n = (i: number) => {
    const v = Number(parts[i]);
    return Number.isFinite(v) ? v : null;
  };
  const target = event ? targetFor(event, "new") : "new";
  const opts = { target, from };

  switch (head) {
    case "commentary": {
      const [sourceId, bookId, chapter, verse] = [n(1), n(2), n(3), n(4)];
      if (bookId == null || chapter == null) return;
      openContent("commentary", { sourceId, bookId, chapter, verse: verse || null }, opts);
      return;
    }
    case "westminster": {
      const sectionId = n(2);
      openContent("westminster", { docCode: parts[1] ?? null, sectionId }, opts);
      return;
    }
    case "strongs":
      openContent("lexicon", { id: parts.slice(1).join(":") }, opts);
      return;
    case "dictionary":
      openContent("dictionary", { slug: parts.slice(1).join(":") }, opts);
      return;
    case "resource": {
      const id = n(1);
      if (id == null) return;
      openContent("resource", { id }, opts);
      return;
    }
    case "crossref": {
      const [bookId, chapter, verse] = [n(1), n(2), n(3)];
      if (bookId == null || chapter == null) return;
      openPassage({ bookId, chapter, verse: verse ?? undefined }, opts);
      return;
    }
    case "illustration":
      openContent("illustrations", {}, opts);
      return;
    default:
      // An identity from a newer version of the app, or a hand-edited one:
      // better to do nothing than to open the wrong thing.
      return;
  }
}

/** What the Sources panel calls each kind. */
export const SOURCE_KIND_LABEL: Record<SermonSourceKind, string> = {
  commentary: "Commentary",
  confession: "Confession",
  strongs: "Lexicon",
  dictionary: "Dictionary",
  resource: "Book",
  crossref: "Cross reference",
  illustration: "Illustration",
};
