import type { Book, Translation } from "../../api/types";
import { parseReference, type ParsedReference } from "../../hooks/useReferenceParser";
import { translationGroup } from "../reading/translationGroups";

/**
 * The search box's text is the one source of truth for what a search asks:
 * the dropdowns and facet clicks under it write `in:` and `t:` into the
 * words, so a search saved and rerun asks exactly the same thing. These
 * helpers read and rewrite those words. The language itself is parsed in
 * Rust (`query_lang.rs`); nothing here tries to understand it beyond
 * finding one `key:value` token.
 */

const TOKEN = (key: string) => new RegExp(`(^|\\s)${key}:(\\S*)`, "i");

/** The value of `key:` in the query, or null. */
export function getToken(query: string, key: string): string | null {
  const m = TOKEN(key).exec(query);
  return m ? m[2] : null;
}

/** Sets (or, with null, removes) `key:value`, keeping everything else. */
export function setToken(query: string, key: string, value: string | null): string {
  const re = TOKEN(key);
  if (re.test(query)) {
    const replaced = query.replace(re, value == null ? "" : `$1${key}:${value}`);
    return replaced.replace(/\s{2,}/g, " ").trim();
  }
  if (value == null) return query;
  return `${key}:${value} ${query.trim()}`.trim();
}

/** A book as `in:` writes it: its short name without spaces ("1Cor"). */
export function bookToken(book: Book): string {
  return book.short_name.replace(/\s+/g, "");
}

/** Typing "Jn 3:16" or "Ps 23" in the search box offers a Go-to row. */
export function wholeReference(query: string, lookup: Map<string, Book>): ParsedReference | null {
  const q = query.trim();
  // A book and a number, nothing after: words after the number make it a
  // scoped search instead (see `leadingChapterScope`).
  if (!/^((?:[1-3]\s?)?[A-Za-z][A-Za-z .]*?)\s*\d+(?::\d+(?:-\d+)?)?$/.test(q)) return null;
  return parseReference(q, lookup);
}

/** "Romans 8 love": a chapter, then the words to look for in it. Returns
 * the query rewritten with `in:` so the search asks for that chapter. */
export function leadingChapterScope(query: string, lookup: Map<string, Book>): { query: string; label: string } | null {
  const m = /^((?:[1-3]\s?)?[A-Za-z][A-Za-z.]*(?:\s(?:of\s)?[A-Za-z]+)?)\s*(\d+)\s+(?![:\d])(.+)$/.exec(query.trim());
  if (!m) return null;
  const ref = parseReference(`${m[1]} ${m[2]}`, lookup);
  if (!ref) return null;
  const rest = m[3].trim();
  if (!rest) return null;
  return { query: `in:${bookToken(ref.book)}${ref.chapter} ${rest}`, label: `${ref.book.name} ${ref.chapter}` };
}

/** Whether any translation searched is one of the older English ones, for
 * which older spellings (shew, -eth) are on by default. */
export function searchesOlderEnglish(translations: Translation[] | undefined, ids: number[]): boolean {
  return (translations ?? []).some((t) => ids.includes(t.id) && translationGroup(t) === "historic");
}

/** The word being typed at the end of the box, for suggestions. */
export function lastWord(query: string): string | null {
  const m = /(?:^|\s)([A-Za-z']{2,})$/.exec(query);
  return m ? m[1] : null;
}

/** Replaces the word being typed with `word`. */
export function replaceLastWord(query: string, word: string): string {
  return query.replace(/([A-Za-z']{2,})$/, word) + " ";
}

/** The bare words of a query: not operators, filters, phrases or patterns.
 * "Did you mean" is asked about these. */
export function bareWords(query: string): string[] {
  const stripped = query
    .replace(/"[^"]*"/g, " ")
    .replace(/\/[^/]*\/[a-z]*/g, " ")
    .replace(/\S+:\S*/g, " ");
  return stripped
    .split(/\s+/)
    .filter((w) => /^[A-Za-z']{3,}$/.test(w) && !["AND", "OR", "NOT"].includes(w));
}

/** Examples for the help popover, each one a search that runs when clicked. */
export const OPERATOR_HELP: { syntax: string; means: string; example: string }[] = [
  { syntax: '"in the beginning"', means: "the exact phrase", example: '"in the beginning"' },
  { syntax: "love OR charity", means: "either word", example: "love OR charity" },
  { syntax: "-world", means: "leave out a word", example: "love -world" },
  { syntax: '-"the world"', means: "leave out a phrase", example: 'love -"the world"' },
  { syntax: "(a OR b) c", means: "group terms", example: "(love OR charity) God" },
  { syntax: "love ~5 God", means: "within five words", example: "love ~5 God" },
  { syntax: "+love", means: "this form only, not loved or loveth", example: "+love" },
  { syntax: "+LORD", means: "exact case: LORD, not Lord", example: "in:psalms +LORD" },
  { syntax: "lov*", means: "any word beginning so", example: "lov*" },
  { syntax: "/regex/", means: "a pattern, one translation at a time", example: "/^and the lord said/i t:kjv" },
  { syntax: "in:psalms", means: "a book, chapter (in:rom8), testament (in:nt) or group (in:gospels)", example: "in:gospels light" },
  { syntax: "t:kjv,geneva", means: "these translations", example: "grace t:kjv,geneva" },
  { syntax: "c:henry", means: "these commentaries", example: "adoption c:henry" },
  { syntax: "G26 / H2617", means: "verses whose Greek or Hebrew has that Strong's number", example: "G26 in:john" },
  { syntax: "red:", means: "the words of Christ", example: "red: verily" },
  { syntax: "has:note", means: "verses you have written notes on", example: "has:note" },
  { syntax: "color:yellow", means: "verses you highlighted in a colour", example: "color:yellow" },
  { syntax: "since:2026-01", means: "notes and prayers written since", example: "since:2026-01 grace" },
];
