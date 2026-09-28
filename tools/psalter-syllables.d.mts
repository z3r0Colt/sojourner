// Types for psalter-syllables.mjs, so the app's tests can hold its divisions
// to account (src/features/psalter/psalterSyllables.test.ts).

export interface Analysis {
  lead: string;
  core: string;
  trail: string;
  /** The word's letters divided by preference. */
  pieces: string[];
  /** Every count the metre may take the word at, cheapest first. */
  counts: { n: number; cost: number }[];
  /** The same, priced for a word that ends its line. */
  countsAtEnd: { n: number; cost: number }[];
  source: "lexicon" | "rules" | "elision" | "none";
}

export const LEXICON: string;
export const PRICE: { soundedEd: number; openAtEnd: number; openInside: number; other: number };
export function parseLexicon(entries: Record<string, string>): Map<string, { pieces: string[]; alts: number[] }>;
export function useLexicon(map: Map<string, { pieces: string[]; alts: number[] }>): void;
export function keyOf(word: string): string;
export function countByRules(word: string): number;
export function ruleDivide(word: string, count?: number): string[];
export function analyse(token: string): Analysis;
export function syllables(word: string): number;
export function variants(word: string, atEnd?: boolean): { n: number; cost: number }[];
export function countText(text: string): number;
export function splitWord(word: string, count: number): string[];
