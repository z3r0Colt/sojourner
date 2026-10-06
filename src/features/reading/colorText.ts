import type { ColorSpan } from "../../api/types";

/** Color text: every person, place, time and number in a verse, colored by
 * what it is -- Who? (God, angels, people), What? (nature), Where? (places),
 * When? (time), How many? (numbers). Each family has two to four shades: the
 * brightest for the most specific words ("Jerusalem"), darker for general
 * ones ("city"), darkest for small words ("there"). The colors themselves are
 * CSS variables (`--ct-GF` and so on, in styles.css), lifted for dark themes.
 * The tagging is the KJV's; other translations are colored from it (see
 * src-tauri/src/color_text.rs). */

export type ColorFamily = "god" | "angels" | "people" | "nature" | "places" | "time" | "number";

export interface ColorCategory {
  code: string;
  name: string;
  family: ColorFamily;
}

export const COLOR_CATEGORIES: ColorCategory[] = [
  { code: "GF", name: "God the Father", family: "god" },
  { code: "GS", name: "God the Son", family: "god" },
  { code: "HS", name: "God the Holy Spirit", family: "god" },
  { code: "AN", name: "Angels", family: "angels" },
  { code: "DE", name: "Demons, false gods and idols", family: "angels" },
  { code: "PN", name: "A named person", family: "people" },
  { code: "PG", name: "A nation, tribe or sect", family: "people" },
  { code: "GP", name: "People", family: "people" },
  { code: "PR", name: "A pronoun for people", family: "people" },
  { code: "BE", name: "Animals", family: "nature" },
  { code: "PL", name: "Plants", family: "nature" },
  { code: "PP", name: "A named place", family: "places" },
  { code: "L1", name: "A place", family: "places" },
  { code: "L2", name: "Position and direction", family: "places" },
  { code: "T1", name: "A unit or point of time", family: "time" },
  { code: "T2", name: "Time and sequence", family: "time" },
  { code: "NU", name: "A number", family: "number" },
  { code: "ME", name: "A measure", family: "number" },
  { code: "QU", name: "An amount", family: "number" },
];

export const COLOR_FAMILIES: { family: ColorFamily; label: string; question: string; swatch: string }[] = [
  { family: "god", label: "God", question: "Who?", swatch: "GF" },
  { family: "angels", label: "Angels", question: "Who?", swatch: "AN" },
  { family: "people", label: "People", question: "Who?", swatch: "PN" },
  { family: "nature", label: "Nature", question: "What?", swatch: "PL" },
  { family: "places", label: "Places", question: "Where?", swatch: "PP" },
  { family: "time", label: "Time", question: "When?", swatch: "T1" },
  { family: "number", label: "Number", question: "How many?", swatch: "NU" },
];

const BY_CODE = new Map(COLOR_CATEGORIES.map((c) => [c.code, c]));

/** Pronouns, by the KJV term a span carries: God's and Christ's are colored
 * as theirs, but a list of who is named ("In this chapter", family
 * worship's "Who is in this reading?") wants names, not "he" and "my". */
export const PRONOUN_TERMS = new Set(
  "i me my mine myself we us our ours ourselves he him his himself thou thee thy thine thyself who whom whose ye you your yours".split(" "),
);

/** The light-theme shades (styles.css `--ct-*-ink`), for colored text that
 * leaves the app: a copy pasted into a document lands on white paper. */
export const PAPER_COLORS: Record<string, string> = {
  GF: "#7a36bf", GS: "#b0307a", HS: "#4b48c4", AN: "#a19638", DE: "#736b28",
  PN: "#218fd9", PG: "#1f87cc", GP: "#1b76b2", PR: "#244a7f", BE: "#469594",
  PL: "#007b78", PP: "#2fa648", L1: "#247f38", L2: "#195928", T1: "#995226",
  T2: "#733e1d", NU: "#9c0f2e", ME: "#7f0b25", QU: "#66091d",
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** `text` as HTML with its colored words in their paper colors. `spans`
 * index into `text` (UTF-16 units), as the reading view's do. */
export function coloredHtml(text: string, spans: ColorSpan[] | undefined): string {
  let out = "";
  let at = 0;
  for (const s of [...(spans ?? [])].sort((a, b) => a.start - b.start)) {
    if (s.start < at || s.end > text.length) continue;
    out += escapeHtml(text.slice(at, s.start));
    out += `<span style="color:${PAPER_COLORS[s.code] ?? "inherit"}">${escapeHtml(text.slice(s.start, s.end))}</span>`;
    at = s.end;
  }
  return out + escapeHtml(text.slice(at));
}

/** Spans of one verse cut to the characters `start`..`end` of it, moved to
 * start at 0: the colored words of a selection. */
export function sliceSpans(spans: ColorSpan[] | undefined, start: number, end: number): ColorSpan[] {
  return (spans ?? [])
    .filter((s) => s.end > start && s.start < end)
    .map((s) => ({ ...s, start: Math.max(s.start, start) - start, end: Math.min(s.end, end) - start }));
}

/** A term without its possessive ending: "abraham's" is "abraham", so "In
 * this chapter" lists the two once and rings both. */
export function termBase(term: string): string {
  return term.replace(/[’']s$/, "");
}

export function colorCategory(code: string): ColorCategory | undefined {
  return BY_CODE.get(code);
}

/** The inline style that colors a word of category `code`: the theme's shade
 * for plain text, and the light-theme shade (`-ink`) for a word inside a
 * highlight, whose bright ground stays light in every theme. */
export function colorStyle(code: string): Record<string, string> {
  return { "--ct-c": `var(--ct-${code})`, "--ct-ink": `var(--ct-${code}-ink)` };
}

/** A chapter's spans by verse, without the families the reader has hidden. */
export function colorSpansByVerse(spans: ColorSpan[] | undefined, hidden: string[] | undefined): Map<number, ColorSpan[]> | null {
  if (!spans) return null;
  const off = new Set(hidden ?? []);
  const out = new Map<number, ColorSpan[]>();
  for (const s of spans) {
    const family = BY_CODE.get(s.code)?.family;
    if (!family || off.has(family)) continue;
    const list = out.get(s.verse) ?? [];
    list.push(s);
    out.set(s.verse, list);
  }
  return out;
}
