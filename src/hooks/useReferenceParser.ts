import type { Book } from "../api/types";

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
 * numeral variants: "1cor", "icor", "firstcor") to the book. */
export function buildBookLookup(books: Book[]): Map<string, Book> {
  const map = new Map<string, Book>();
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
  return map;
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
