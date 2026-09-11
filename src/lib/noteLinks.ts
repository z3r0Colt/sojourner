import type { Book } from "../api/types";

export interface RefMatcher {
  regex: RegExp;
  lookup: Map<string, Book>;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Builds a regex matching any real book name/abbreviation (longest names first,
 * so "Song of Solomon" wins over any shorter partial), plus a normalized-name
 * -> Book lookup for resolving whichever variant matched. */
export function buildRefMatcher(books: Book[]): RefMatcher {
  const lookup = new Map<string, Book>();
  const variants = new Set<string>();
  for (const b of books) {
    for (const name of [b.name, b.short_name, b.osis_code]) {
      variants.add(name);
      lookup.set(normalize(name), b);
    }
    const m = b.name.match(/^([123]) (.+)$/);
    if (m) {
      const [, num, rest] = m;
      const ordinals: Record<string, string[]> = { "1": ["First", "I"], "2": ["Second", "II"], "3": ["Third", "III"] };
      for (const word of ordinals[num] ?? []) {
        const variant = `${word} ${rest}`;
        variants.add(variant);
        lookup.set(normalize(variant), b);
      }
    }
  }
  const sorted = Array.from(variants).sort((a, b) => b.length - a.length);
  const escaped = sorted.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"));
  const regex = new RegExp(`\\b(${escaped.join("|")})\\.?\\s+(\\d{1,3})(?:[:.](\\d{1,3})(?:-(\\d{1,3}))?)? `, "gi");
  return { regex, lookup };
}

export function verseHref(bookId: number, chapter: number, verse?: number): string {
  return `bsapp://verse/${bookId}/${chapter}${verse != null ? `/${verse}` : ""}`;
}

export function resourceHref(resourceId: number): string {
  return `bsapp://resource/${resourceId}`;
}

export function parseInternalHref(href: string): { kind: "verse"; bookId: number; chapter: number; verse?: number } | { kind: "resource"; id: number } | null {
  const verseMatch = href.match(/^bsapp:\/\/verse\/(\d+)\/(\d+)(?:\/(\d+))?$/);
  if (verseMatch) {
    return { kind: "verse", bookId: Number(verseMatch[1]), chapter: Number(verseMatch[2]), verse: verseMatch[3] ? Number(verseMatch[3]) : undefined };
  }
  const resourceMatch = href.match(/^bsapp:\/\/resource\/(\d+)$/);
  if (resourceMatch) {
    return { kind: "resource", id: Number(resourceMatch[1]) };
  }
  return null;
}

/** Walks an HTML string's text nodes and wraps any plain-text scripture
 * references (not already inside a link) in an <a> pointing at our internal
 * verse:// scheme, so references typed as plain text become clickable
 * automatically -- no markup/markdown knowledge required from the user. */
export function autoLinkScriptureRefs(html: string, matcherOrNull: RefMatcher | null): string {
  if (!matcherOrNull) return html;
  const matcher = matcherOrNull;
  const container = document.createElement("div");
  container.innerHTML = html;

  function walk(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? "";
      matcher.regex.lastIndex = 0;
      const pieces: (string | HTMLElement)[] = [];
      let lastIndex = 0;
      let m: RegExpExecArray | null;
      let found = false;
      while ((m = matcher.regex.exec(text))) {
        const book = matcher.lookup.get(normalize(m[1]));
        if (!book) continue;
        found = true;
        if (m.index > lastIndex) pieces.push(text.slice(lastIndex, m.index));
        const a = document.createElement("a");
        a.href = verseHref(book.id, Number(m[2]), m[3] ? Number(m[3]) : undefined);
        a.textContent = m[0];
        a.className = "auto-verse-link";
        pieces.push(a);
        lastIndex = m.index + m[0].length;
      }
      if (!found) return;
      if (lastIndex < text.length) pieces.push(text.slice(lastIndex));
      const parent = node.parentNode;
      if (!parent) return;
      for (const piece of pieces) {
        parent.insertBefore(typeof piece === "string" ? document.createTextNode(piece) : piece, node);
      }
      parent.removeChild(node);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      if (el.tagName === "A") return; // don't relink inside existing links
      Array.from(node.childNodes).forEach(walk);
    }
  }
  Array.from(container.childNodes).forEach(walk);
  return container.innerHTML;
}
