import { useMemo } from "react";
import { useBookAliases, useBooks } from "../api/queries";
import type { Book, BookAlias } from "../api/types";

export interface ParsedReference {
  book: Book;
  chapter: number;
  verse?: number;
  verseEnd?: number;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Builds a lookup from normalized book name/short-name/osis-code (and common
 * numeral variants: "1cor", "icor", "firstcor") to the book. `aliases` adds
 * alternate names a bundled translation's own source uses (e.g. a
 * Vulgate-named edition's "Josue" for Joshua), so typing either name
 * resolves to the same canonical book. */
export function buildBookLookup(books: Book[], aliases: BookAlias[] = []): Map<string, Book> {
  const map = new Map<string, Book>();
  const byId = new Map(books.map((b) => [b.id, b]));
  for (const b of books) {
    for (const key of [b.name, b.short_name, b.osis_code]) {
      map.set(normalize(key), b);
    }
    const m = b.name.match(/^([123]) (.+)$/);
    if (m) {
      const [, num, rest] = m;
      const words: Record<string, string[]> = { "1": ["first", "i"], "2": ["second", "ii"], "3": ["third", "iii"] };
      for (const word of words[num] ?? []) {
        map.set(normalize(`${word} ${rest}`), b);
      }
    }
  }
  for (const a of aliases) {
    const book = byId.get(a.book_id);
    if (!book) continue;
    for (const key of [a.name, a.short_name]) {
      if (key) map.set(normalize(key), book);
    }
  }
  return map;
}

/** The lookup every reference box should parse against: the canonical books
 * plus the alternate names the bundled translations use for them, so that
 * "Psalm 130:3-4" is understood wherever "Psalms 130:3-4" is. Built once and
 * shared, since the books and their aliases never change while running. */
export function useBookLookup(): Map<string, Book> {
  const { data: books } = useBooks();
  const { data: aliases } = useBookAliases();
  return useMemo(() => buildBookLookup(books ?? [], aliases ?? []), [books, aliases]);
}

export interface ScriptureRefMatch {
  start: number;
  end: number;
  text: string;
  ref: ParsedReference;
}

// Requires a chapter:verse (colon mandatory) -- a bare "Genesis 1" or
// "Section 2" style mention is far more likely to be ordinary prose than a
// citation, so matching only kicks in once the strong "Book N:N" signal is
// present. Book part allows up to 3 capitalized words (for "Song of
// Solomon") with an optional leading numeral ("1 John", "2 Cor") and an
// optional trailing period ("Rom.").
const SCRIPTURE_REF_RE =
  /\b((?:[1-3]\s)?[A-Z][a-zA-Z]+(?:\s(?:of\s)?[A-Z][a-zA-Z]+){0,2})\.?\s+(\d{1,3}):(\d{1,3})(?:[-–](\d{1,3}))?\b/g;

/** Scans free-form prose (e.g. a dictionary entry's body) for every
 * scripture-reference-shaped substring and resolves each against `lookup`,
 * returning only the ones that resolve to a real book/chapter -- unlike
 * `parseReference`, which expects the *entire* input to be one reference,
 * this finds many refs scattered through a larger block of text. */
export function scanScriptureRefs(text: string, lookup: Map<string, Book>): ScriptureRefMatch[] {
  const matches: ScriptureRefMatch[] = [];
  for (const m of text.matchAll(SCRIPTURE_REF_RE)) {
    const [full, bookPart, chapterPart, versePart, verseEndPart] = m;
    const book = lookup.get(normalize(bookPart));
    if (!book) continue;
    const chapter = parseInt(chapterPart, 10);
    if (chapter < 1 || chapter > book.chapter_count) continue;
    matches.push({
      start: m.index!,
      end: m.index! + full.length,
      text: full,
      ref: { book, chapter, verse: parseInt(versePart, 10), verseEnd: verseEndPart ? parseInt(verseEndPart, 10) : undefined },
    });
  }
  return matches;
}

/** Parses free text like "jn 3:16", "genesis 1", "1 cor 13:4-7" into a passage. */
export function parseReference(input: string, lookup: Map<string, Book>): ParsedReference | null {
  const trimmed = input.trim();
  const match = trimmed.match(/^(.+?)\s*(\d+)?(?::(\d+)(?:-(\d+))?)?$/);
  if (!match) return null;
  const [, bookPart, chapterPart, versePart, verseEndPart] = match;
  const book = lookup.get(normalize(bookPart));
  if (!book) return null;
  const chapter = chapterPart ? parseInt(chapterPart, 10) : 1;
  if (chapter < 1 || chapter > book.chapter_count) return null;
  return {
    book,
    chapter,
    verse: versePart ? parseInt(versePart, 10) : undefined,
    verseEnd: verseEndPart ? parseInt(verseEndPart, 10) : undefined,
  };
}
