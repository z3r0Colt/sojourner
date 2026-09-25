/**
 * Finding a citation's reference "as printed" in a rendered book section.
 *
 * The citation index (src-tauri/src/citations.rs) reads the book's extracted
 * text, where every run of whitespace is one space and markup is gone. The
 * page the reader shows is HTML: a reference can break across a line in the
 * source ("Rom. viii.\n28") or across elements ("Rom. <a>viii. 28</a>"). So
 * the section's text nodes are joined and their whitespace collapsed the same
 * way before counting, and each character of the joined text remembers which
 * node and offset it came from so a hit can be turned back into a Range.
 */

/** A section's text nodes, joined and whitespace-collapsed, with where each
 * character came from: `at[i]` is `[node index, offset in that node]`. */
export interface FlatText {
  text: string;
  at: [number, number][];
}

const SPACE = /[\s ]/;

export function flatten(nodes: readonly string[]): FlatText {
  let text = "";
  const at: [number, number][] = [];
  let lastSpace = true;
  nodes.forEach((value, n) => {
    for (let i = 0; i < value.length; i++) {
      if (SPACE.test(value[i])) {
        if (lastSpace) continue;
        text += " ";
        at.push([n, i]);
        lastSpace = true;
      } else {
        text += value[i];
        at.push([n, i]);
        lastSpace = false;
      }
    }
  });
  return { text, at };
}

/**
 * Every place `needle` is printed in `text` as a whole reference, counted the
 * way the citation index counts it: "Gen. i. 3" but not the start of "Gen. i.
 * 31", and "John i. 1" but not inside "1 John i. 1" (which the index records
 * as a reference of its own). A footnote number before a reference ("2497
 * Rom. viii. 28") is not a book number, so only a lone 1, 2 or 3, or I, II or
 * III, rules a hit out.
 */
export function printedAt(text: string, needle: string): number[] {
  const want = needle.replace(/[\s ]+/g, " ").trim();
  if (!want) return [];
  const hits: number[] = [];
  for (let pos = text.indexOf(want); pos >= 0; pos = text.indexOf(want, pos + 1)) {
    const before = text.slice(Math.max(0, pos - 5), pos);
    const after = text.charAt(pos + want.length);
    if (/[\p{L}\p{N}]$/u.test(before)) continue;
    if (/(^|[^\p{L}\p{N}])([1-3]|I{1,3}) $/u.test(before)) continue;
    if (/[\p{L}\p{N}]/u.test(after)) continue;
    hits.push(pos);
  }
  return hits;
}
