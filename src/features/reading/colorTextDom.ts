import type { Spotlight } from "./ColorTextBar";

// Color text's work on the page itself, as against colorText.ts, which
// works on the verse's words and needs no page.

/** Whether two colored pieces of a verse touch: one word split by a
 * highlight's edge, rather than the same term twice. */
export function adjacent(a: HTMLElement, b: HTMLElement): boolean {
  const range = document.createRange();
  range.setStartAfter(a);
  range.setEndBefore(b);
  return range.toString() === "";
}

/** The rule that rings every word of the term picked in "In this chapter",
 * in its plain and possessive forms, inside the pane `scope` names. The
 * term is escaped, not stripped: "five hundred: and three" is a term. */
export function spotlightCss(s: Spotlight, scope: string): string {
  const pane = `[data-ct-scope="${CSS.escape(scope)}"]`;
  const selectors = [s.term, `${s.term}'s`, `${s.term}’s`].map(
    (term) => `${pane} .ct[data-ct-code="${CSS.escape(s.code)}"][data-ct-term="${CSS.escape(term)}"]`,
  );
  return `${selectors.join(",")}{border-radius:3px;box-shadow:0 0 0 2px color-mix(in srgb, var(--ct-c) 45%, transparent);background:color-mix(in srgb, var(--ct-c) 14%, transparent)}`;
}
