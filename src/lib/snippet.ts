/** The marks the search puts around each match in a snippet: control
 * characters rather than brackets, so a translation that prints its own
 * square brackets (the LSV's "[is]") is not taken for a match. The text
 * around them arrives already HTML-escaped (see `escape_snippet` in
 * search.rs). */
export const MARK_START = "\u0002";
export const MARK_END = "\u0003";

const MARK_CLASS = "rounded bg-accent-soft px-0.5 text-accent";

/** A snippet as HTML, each match in a `<mark>`. */
export function snippetHtml(snippet: string): string {
  return snippet.split(MARK_START).join(`<mark class='${MARK_CLASS}'>`).split(MARK_END).join("</mark>");
}

/** A snippet as plain text, marks removed and entities decoded. */
export function snippetText(snippet: string): string {
  return snippet
    .split(MARK_START)
    .join("")
    .split(MARK_END)
    .join("")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** Splits a snippet at its first match: [before, match, after], for the
 * concordance view's fixed middle column. No match: [text, "", ""]. */
export function splitAtFirstMatch(snippet: string): [string, string, string] {
  const s = snippet.indexOf(MARK_START);
  if (s < 0) return [snippetText(snippet), "", ""];
  const e = snippet.indexOf(MARK_END, s);
  const end = e < 0 ? snippet.length : e;
  return [snippetText(snippet.slice(0, s)), snippetText(snippet.slice(s + 1, end)), snippetText(snippet.slice(end + 1))];
}
