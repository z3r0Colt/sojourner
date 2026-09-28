/**
 * A footnote's text as the reader should see it. The notes come from two
 * public-domain sources whose markup leaves marks in the imported text:
 *
 * - The KJV's notes (CrossWire OSIS) quote the words they annotate and
 *   follow them with ": ", then the note ("herb bearing seed: Heb. seeding
 *   seed"). The quoted words are taken off at import time; the ": " was left
 *   on, so every KJV note began ": Heb. ...".
 * - The ASV's notes (USX) set words in italics and references in their own
 *   elements, and joining the pieces put a space before whatever punctuation
 *   followed one ("Greek flesh of sin .", "Lev. 7:37 ; Heb. 10:6").
 *
 * Both are undone here, where every footnote is shown. An ellipsis printed
 * with spaces (". . .") is left as it is.
 */
export function tidyFootnoteText(text: string): string {
  return (
    text
      .replace(/^\s*:\s*/, "")
      // A space before , ; : ! ? or ) -- or before a full stop that is not
      // part of a spaced ellipsis (no stop just before it or just after it).
      .replace(/\s+(?=[,;:!?)\]])/g, "")
      .replace(/(?<![.\s])\s+\.(?!\s*\.)/g, ".")
      .replace(/([([])\s+/g, "$1")
      .trim()
  );
}
