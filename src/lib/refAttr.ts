import type { PassageRef } from "../api/types";
import { refKey } from "./passage";

/** The attribute that marks an element as a Scripture reference. Any
 * element carrying it gets a hover/focus preview card (see RefPreview). */
export const REF_ATTR = "data-ref";

/** `data-ref` value: "bookId:chapter:verseStart:verseEnd". */
export function encodeRef(ref: PassageRef): string {
  return refKey(ref);
}

export function decodeRef(value: string | null | undefined): PassageRef | null {
  if (!value) return null;
  const parts = value.split(":").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0)) return null;
  const [book_id, chapter, verse_start, verse_end] = parts;
  if (book_id < 1 || chapter < 1 || verse_start < 1) return null;
  return { book_id, chapter, verse_start, verse_end: Math.max(verse_start, verse_end) };
}

/** Spread onto any element to opt it into previews: `<a {...refAttrs(ref)}>`. */
export function refAttrs(ref: PassageRef): { [REF_ATTR]: string } {
  return { [REF_ATTR]: encodeRef(ref) };
}
