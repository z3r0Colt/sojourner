/**
 * A plain-text licence notice as paragraphs to set in the page's own
 * column. A notice like DataWar's MIT licence comes broken at eighty
 * columns; kept as it is in a column narrower than that, every other line
 * is a stub ("…to any person" / "obtaining a copy"). The blank lines are its
 * paragraphs; the line breaks inside them are only where the file wrapped.
 */
export function licenceParagraphs(text: string): string[] {
  return text
    .trim()
    .split(/\r?\n[ \t]*\r?\n/)
    .map((p) => p.replace(/\s*\r?\n\s*/g, " ").trim())
    .filter((p) => p.length > 0);
}
