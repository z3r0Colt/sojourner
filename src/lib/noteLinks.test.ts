import { describe, expect, it } from "vitest";
import { buildRefMatcher, extractRefs } from "./noteLinks";
import type { Book } from "../api/types";

/** Just enough of the book list for the matcher: one book per shape the
 * regex builder cares about (a plain name, and a numbered one that grows
 * "First"/"I" variants). */
const BOOKS = [
  { id: 1, name: "Genesis", short_name: "Gen", osis_code: "Gen" },
  { id: 43, name: "John", short_name: "John", osis_code: "John" },
  { id: 45, name: "Romans", short_name: "Rom", osis_code: "Rom" },
] as Book[];

const matcher = buildRefMatcher(BOOKS);

describe("extractRefs", () => {
  /**
   * The body handed to `extractRefs` is raw: it is never sanitized, because
   * the hrefs have to be read exactly as they were stored. So the parse
   * itself has to be inert.
   *
   * This matters because of who calls it. `useNoteRefsBackfill` runs
   * `extractRefs` over every note and chapter note in the database at
   * launch, gated only on a setting that lives *inside* that database -- so
   * a user.db someone else made simply arrives without the flag, and every
   * note body in it is parsed before a single one is displayed.
   *
   * jsdom loads no resources, so an `onerror` payload cannot fire here even
   * against a live element; that assertion alone would pass either way. A
   * custom element is the discriminator that actually distinguishes them:
   * upgrading runs an author-supplied constructor, and it happens on a live
   * document's `innerHTML` and not in a `DOMParser` document.
   */
  it("parses inertly, so markup in a note body cannot run", () => {
    const ran: string[] = [];
    (globalThis as unknown as Record<string, unknown>).__noteLinksXss = () => ran.push("onerror");
    class PayloadElement extends HTMLElement {
      constructor() {
        super();
        ran.push("upgraded");
      }
    }
    customElements.define("note-payload", PayloadElement);

    // Sanity check that the probe can fire at all: the same markup through a
    // live element's innerHTML -- which is what this function used to do --
    // runs the constructor.
    const live = document.createElement("div");
    live.innerHTML = "<note-payload></note-payload>";
    expect(ran).toEqual(["upgraded"]);
    ran.length = 0;

    extractRefs(
      '<img src="x" onerror="window.__noteLinksXss()">' +
        "<note-payload></note-payload>" +
        '<svg><script>window.__noteLinksXss()</script></svg>',
      matcher,
    );

    expect(ran).toEqual([]);
  });

  it("still reads a ref off an internal link", () => {
    // `bsapp://verse/<book>/<chapter>/<verse>`, the verse optional.
    expect(extractRefs('<a href="bsapp://verse/1/1/1">Genesis 1:1</a>', matcher)).toEqual([
      { book_id: 1, chapter: 1, verse_start: 1, verse_end: 1 },
    ]);
    // A chapter-only link has no verse on either end.
    expect(extractRefs('<a href="bsapp://verse/45/8">Romans 8</a>', matcher)).toEqual([
      { book_id: 45, chapter: 8, verse_start: null, verse_end: null },
    ]);
  });

  it("still reads a ref out of plain prose", () => {
    expect(extractRefs("<p>see John 3:16 and Romans 8:28-30</p>", matcher)).toEqual([
      { book_id: 43, chapter: 3, verse_start: 16, verse_end: 16 },
      { book_id: 45, chapter: 8, verse_start: 28, verse_end: 30 },
    ]);
    // A reference at the very end of the body counts, per this function's
    // documented difference from the auto-linker.
    expect(extractRefs("<p>closing at Genesis 1:1</p>", matcher)).toEqual([
      { book_id: 1, chapter: 1, verse_start: 1, verse_end: 1 },
    ]);
  });

  it("reads links and prose together, and says each reference once", () => {
    const refs = extractRefs('<p><a href="bsapp://verse/43/3/16">here</a> and again John 3:16 </p>', matcher);
    expect(refs).toEqual([{ book_id: 43, chapter: 3, verse_start: 16, verse_end: 16 }]);
  });

  it("takes prose refs even with no book list loaded, and finds none without a matcher", () => {
    expect(extractRefs("<p>see John 3:16 </p>", null)).toEqual([]);
    // The links are still read when the matcher is missing -- they need no
    // book list to resolve.
    expect(extractRefs('<a href="bsapp://verse/43/3/16">x</a>', null)).toEqual([
      { book_id: 43, chapter: 3, verse_start: 16, verse_end: 16 },
    ]);
  });
});
