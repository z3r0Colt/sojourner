// The read-aloud player's "Jump to a passage" list.
//
// A reading used to be something to start and then sit through: a library book
// always began at its first word, and the only way to reach chapter nine was
// Next, pressed a few thousand times. The player now lists every passage of
// the reading, and these are the two small pieces of that list worth testing
// on their own -- how a passage is shown in one line, and which passages a
// search finds.

import type { TtsSegment } from "../../state/ttsStore";

/** How much of a passage the list shows: enough to recognize it by. */
export const PREVIEW_CHARS = 80;

/**
 * The opening of a passage, as the list shows it: spacing made plain, and cut
 * at a word -- never through one -- with an ellipsis when there is more.
 */
export function passagePreview(text: string, maxChars: number = PREVIEW_CHARS): string {
  const plain = text.replace(/\s+/g, " ").trim();
  if (plain.length <= maxChars) return plain;
  const cut = plain.slice(0, maxChars);
  const space = cut.lastIndexOf(" ");
  // A word as long as most of the line (a run of Greek transliteration, a
  // URL) is cut where it stands rather than leaving a stub of a preview.
  const kept = space >= maxChars * 0.6 ? cut.slice(0, space) : cut;
  return `${kept.replace(/[\s,;:.\-–—]+$/, "")}…`;
}

/**
 * Where in `segments` the words of `query` appear, in the label ("v.12",
 * "Chapter 3") or the text, ignoring case and how the spaces fall; null when
 * there is no query, meaning every passage is shown.
 *
 * A whole book is thousands of passages and millions of characters, so each is
 * tested with one case-insensitive pattern rather than lower-cased copies of
 * the lot made at every keystroke.
 */
export function findPassages(segments: TtsSegment[], query: string): number[] | null {
  const words = query.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  const pattern = new RegExp(words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+"), "i");
  const found: number[] = [];
  segments.forEach((segment, i) => {
    if ((segment.label && pattern.test(segment.label)) || pattern.test(segment.text)) found.push(i);
  });
  return found;
}

/**
 * `name` shortened to fit `width`, as `measure` measures text: cut after a
 * whole word, its trailing punctuation dropped, and an ellipsis added --
 * "Sermon II. Sinners in the Hands of an…". The whole name when it fits, and
 * the first word with its ellipsis when not even that does (the caller's
 * overflow then cuts it where it stands).
 *
 * The browser's own ellipsis cut a character at a time, mid-word ("of an
 * an…"), and left the rest of the box empty, so the ", paragraph 12" after it
 * stood off at a gap from the name it belonged to.
 */
export function fitAtWord(name: string, width: number, measure: (text: string) => number): string {
  if (measure(name) <= width) return name;
  const cuts: string[] = [];
  for (const space of name.matchAll(/\s+/g)) {
    const kept = name.slice(0, space.index).replace(/[\s,;:.\-–—]+$/, "");
    if (kept) cuts.push(`${kept}…`);
  }
  for (let i = cuts.length - 1; i >= 0; i--) {
    if (measure(cuts[i]) <= width) return cuts[i];
  }
  return cuts[0] ?? name;
}

/** The longest tail `labelParts` keeps whole: ", paragraph 1234" and room over. */
const PLACE_CHARS = 24;

/**
 * A passage's label in two parts: the name, which may be cut short to fit a
 * narrow row, and the place within it, which must not be. A book's labels are
 * "Sermon II. Sinners in the Hands of an angry God, paragraph 11", and cut at
 * the end like any other line every row of a sermon read the same -- the one
 * part that told them apart was the part cut off. The place is what follows
 * the last comma, when that is short; a label without one is all name.
 */
export function labelParts(label: string): { name: string; place: string } {
  const at = label.lastIndexOf(", ");
  if (at <= 0 || label.length - at > PLACE_CHARS) return { name: label, place: "" };
  return { name: label.slice(0, at), place: label.slice(at) };
}
