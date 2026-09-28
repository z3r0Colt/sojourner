import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WebsterEntry, WebsterLookup } from "../../api/types";

/**
 * The word card's Webster 1828 section in a real (jsdom) React tree, the
 * lookup stood in for and the panes it opens replaced by a spy: what is
 * tested is what it shows before "More" and after, that it says so quietly
 * when the word was found through its base form, that it is not there at
 * all for a word the dictionary lacks, and where "Open in Webster" goes.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let lookup: WebsterLookup | null | undefined;
const asked: (string | null)[] = [];
const opened: { kind: string; params: unknown; target: unknown }[] = [];
let panes: { id: string; kind: string }[] = [];

vi.mock("../../api/queries", () => ({
  useWebsterLookup: (word: string | null) => {
    asked.push(word);
    return { data: lookup };
  },
}));
// Webster's markup as it comes, so its words can be read off the page.
vi.mock("../commentary/CommentaryPanel", async () => {
  const { createElement: h } = await import("react");
  return { CommentaryHtml: ({ html }: { html: string }) => h("div", { className: "commentary-html", dangerouslySetInnerHTML: { __html: html } }) };
});
vi.mock("../../workspace/openContent", () => ({
  openContent: (kind: string, params: unknown, opts: { target: unknown }) => opened.push({ kind, params, target: opts.target }),
  targetFor: (e: { ctrlKey: boolean }, fallback: unknown) => (e.ctrlKey ? "new" : fallback),
}));
vi.mock("../../state/workspaceStore", () => ({ useWorkspaceStore: { getState: () => ({ panes }) } }));

const { WebsterJump, WebsterWordSection } = await import("./WebsterWordSection");

const LET_VT: WebsterEntry = {
  id: 501,
  word: "Let",
  key: "let",
  pos: "v.t.",
  aliases: [],
  html:
    "<p><b>LET</b>, v.t. pret. and pp. let. Letted is obsolete. [To let out, like L. elocare, is to lease.]</p>" +
    "<p>1. To permit; to allow; to suffer.</p>" +
    '<p>Pharaoh said, I will let you go. <a class="scripref" data-osis="Exod.8.1-Exod.8.32">Ex. 8</a>.</p>' +
    "<p>2. To lease; to grant possession and use for a compensation.</p>" +
    '<p>5. To retard; to hinder; to impede; to interpose obstructions. <a class="scripref" data-osis="2Thess.2.1-2Thess.2.17">2Thess. 2</a>.</p>',
};
const LET_N: WebsterEntry = {
  id: 503,
  word: "Let",
  key: "let",
  pos: "n.",
  aliases: [],
  html: "<p><b>LET</b>, n. A retarding; hinderance; obstacle; impediment; delay.</p>",
};
const LETTETH: WebsterLookup = { query: "letteth", matched: "let", via: "base", entries: [LET_VT, LET_N] };

let host: HTMLDivElement;
let root: Root;
let closed = 0;

beforeEach(() => {
  lookup = LETTETH;
  asked.length = 0;
  opened.length = 0;
  panes = [];
  closed = 0;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
});

function render(props: Partial<Parameters<typeof WebsterWordSection>[0]> = {}) {
  act(() =>
    root.render(
      createElement(WebsterWordSection, {
        word: "letteth",
        place: { book: "2Thess", chapter: 2 },
        onJumpToRef: () => {},
        onClose: () => closed++,
        ...props,
      }),
    ),
  );
}

const section = () => host.querySelector<HTMLElement>('section[aria-label="Webster 1828"]');
const button = (text: string | RegExp) =>
  [...host.querySelectorAll("button")].find((b) => (typeof text === "string" ? b.textContent === text : text.test(b.textContent ?? "")));

describe("the word card's Webster section", () => {
  it("looks the word up, and is not there until the lookup finds it", () => {
    lookup = undefined;
    render();
    expect(asked).toContain("letteth");
    expect(section()).toBeNull();
    lookup = null;
    render();
    expect(section()).toBeNull();
  });

  it("shows the headword, and says quietly when the word was found through its base form", () => {
    render();
    const text = section()!.textContent!;
    expect(text).toContain("LET");
    expect(text).toContain("v.t.");
    expect(text).toContain("from let");
    lookup = { ...LETTETH, query: "let", via: "exact" };
    render({ word: "let" });
    expect(section()!.textContent).not.toContain("from let");
  });

  it("shows the first sense and the one Webster cites the chapter for, and not the rest", () => {
    render();
    const text = section()!.textContent!;
    expect(text).toContain("1. To permit; to allow; to suffer.");
    expect(text).toContain("5. To retard; to hinder");
    expect(text).toContain("Webster cites this chapter for this sense");
    expect(text).not.toContain("2. To lease");
    expect(text).not.toContain("Pharaoh said");
    expect(text).not.toContain("A retarding");
  });

  it("shows the first two senses where nothing cites the chapter", () => {
    render({ place: { book: "Gen", chapter: 1 } });
    const text = section()!.textContent!;
    expect(text).toContain("2. To lease");
    expect(text).not.toContain("5. To retard");
    expect(text).not.toContain("Webster cites this chapter");
  });

  it("opens to every entry under the word in full, and closes again", () => {
    render();
    const more = button("More (2 entries)")!;
    expect(more.getAttribute("aria-expanded")).toBe("false");
    act(() => more.click());
    const text = section()!.textContent!;
    expect(text).toContain("Pharaoh said");
    expect(text).toContain("2. To lease");
    expect(text).toContain("A retarding; hinderance");
    // The entry the card drew on comes first.
    expect(text.indexOf("To permit")).toBeLessThan(text.indexOf("A retarding"));
    expect(section()!.querySelector("p.wb-quote")?.textContent).toMatch(/^Pharaoh said/);
    act(() => button("Less")!.click());
    expect(section()!.textContent).not.toContain("Pharaoh said");
  });

  it("shows the word's own entry before another word the lookup brought in, and says so when it shows the other", () => {
    const sawN: WebsterEntry = { id: 601, word: "Saw", key: "saw", pos: "n.", aliases: [], html: "<p><b>SAW</b>, n. [See the Verb.]</p><p>1. A cutting instrument.</p>" };
    const see: WebsterEntry = {
      id: 602,
      word: "See",
      key: "see",
      pos: "v.t.",
      aliases: [],
      html:
        "<p><b>SEE</b>, v.t. pret. saw; pp. seen. [L. sequor.]</p><p>1. To perceive by the eye; to have knowledge of the existence of objects.</p>" +
        '<p>I will now turn aside, and see this great sight. <a class="scripref" data-osis="Exod.3.1-Exod.3.22">Ex. 3</a>.</p>',
    };
    lookup = { query: "saw", matched: "saw", via: "exact", entries: [sawN, see] };
    render({ word: "saw", place: { book: "Gen", chapter: 1 } });
    expect(section()!.textContent).toContain("A cutting instrument");
    expect(section()!.textContent).not.toContain("from see");
    // Where Webster cites the chapter being read for SEE, SEE -- and a note.
    render({ word: "saw", place: { book: "Exod", chapter: 3 } });
    expect(section()!.textContent).toContain("To perceive by the eye");
    expect(section()!.textContent).toContain("from see");
  });

  it("says what this copy lacks where the lookup carries a note, and says nothing otherwise", () => {
    const eve: WebsterEntry = {
      id: 701,
      word: "Eve",
      key: "eve",
      pos: "n.",
      aliases: ["even"],
      html: "<p><b>EVE</b>, n. [Sax. aefen.]</p><p>1. The decline of the sun; the evening.</p>",
    };
    const note = "Webster's EVEN, the adjective and adverb, is missing from this copy of the dictionary. Shown is EVE, the evening.";
    lookup = { query: "even", matched: "eve", via: "alias", entries: [eve], note };
    render({ word: "even", place: { book: "Gen", chapter: 1 } });
    const text = section()!.textContent!;
    expect(text).toContain("is missing from this copy");
    expect(text).toContain("The decline of the sun");
    // The note comes before the entry it qualifies.
    expect(text.indexOf("is missing")).toBeLessThan(text.indexOf("The decline"));
    lookup = LETTETH;
    render();
    expect(section()!.textContent).not.toContain("is missing");
  });

  it("shows the quotation that cites the chapter, where the sense's own line cites another", () => {
    // "Who shall judge the quick and the dead": 2 Timothy 4:1, cited under
    // QUICK's first sense, whose own line cites Leviticus 13.
    const quickA: WebsterEntry = {
      id: 801,
      word: "Quick",
      key: "quick",
      pos: "a.",
      aliases: [],
      html:
        "<p><b>QUICK</b>, a. [L. vigeo.]</p>" +
        '<p>1. Primarily, alive; living; opposed to dead or unanimated; as quick flesh. <a class="scripref" data-osis="Lev.13.1-Lev.13.59">Lev. 13</a>.</p>' +
        '<p>The Lord Jesus Christ, who shall judge the quick and the dead. <a class="scripref" data-osis="2Tim.4.1">2Tim. 4</a>.</p>' +
        "<p>2. Swift; hasty; done with celerity; as quick dispatch.</p>",
    };
    lookup = { query: "quick", matched: "quick", via: "exact", entries: [quickA] };
    render({ word: "quick", place: { book: "2Tim", chapter: 4 } });
    const text = section()!.textContent!;
    expect(text).toContain("Webster cites this chapter for this sense");
    expect(text).toContain("as quick flesh. Lev. 13.");
    expect(text).toContain("who shall judge the quick and the dead. 2Tim. 4.");
    expect(text.indexOf("as quick flesh")).toBeLessThan(text.indexOf("judge the quick"));
    // Read in Leviticus 13, the sense's own line is the citation, and no
    // quotation is brought along.
    render({ word: "quick", place: { book: "Lev", chapter: 13 } });
    expect(section()!.textContent).not.toContain("judge the quick");
  });

  it("opens More in the card's own scroll, not a scroll box inside it", () => {
    render();
    act(() => button("More (2 entries)")!.click());
    expect(section()!.querySelector('[class*="overflow-y-auto"], [class*="max-h-"]')).toBeNull();
  });

  it("offers no More for a one-line entry", () => {
    lookup = { query: "let", matched: "let", via: "exact", entries: [LET_N] };
    render({ word: "let" });
    expect(section()!.textContent).toContain("A retarding");
    expect(button(/^More/)).toBeUndefined();
  });

  it("opens the entry on the Dictionary page, in the Dictionary pane if one is open, and closes the card", () => {
    render();
    act(() => button("Open in Webster")!.click());
    expect(opened).toEqual([{ kind: "dictionary", params: { slug: null, work: "webster", webster: 501 }, target: "new" }]);
    expect(closed).toBe(1);

    panes = [
      { id: "p1", kind: "bible" },
      { id: "p2", kind: "dictionary" },
    ];
    act(() => button("Open in Webster")!.click());
    expect(opened[1].target).toBe("p2");
  });
});

describe("the word card's jump to its Webster section", () => {
  let observed: { callback: IntersectionObserverCallback; target: Element | null; disconnected: boolean }[] = [];
  const scrolled: Element[] = [];
  const realObserver = globalThis.IntersectionObserver;
  const realScrollTo = HTMLElement.prototype.scrollTo;

  beforeEach(() => {
    observed = [];
    scrolled.length = 0;
    globalThis.IntersectionObserver = class {
      entry: (typeof observed)[number];
      constructor(callback: IntersectionObserverCallback) {
        this.entry = { callback, target: null, disconnected: false };
        observed.push(this.entry);
      }
      observe(target: Element) {
        this.entry.target = target;
      }
      disconnect() {
        this.entry.disconnected = true;
      }
    } as unknown as typeof IntersectionObserver;
    HTMLElement.prototype.scrollTo = function (this: HTMLElement) {
      scrolled.push(this);
    } as typeof HTMLElement.prototype.scrollTo;
  });

  afterEach(() => {
    globalThis.IntersectionObserver = realObserver;
    HTMLElement.prototype.scrollTo = realScrollTo;
  });

  /** The card: its header's jump, and the section at its foot. */
  const card = { current: null as HTMLDivElement | null };
  function renderCard() {
    act(() =>
      root.render(
        createElement(
          "div",
          { ref: (el: HTMLDivElement | null) => void (card.current = el) },
          createElement(WebsterJump, { word: "letteth", cardRef: card }),
          createElement(WebsterWordSection, { word: "letteth", place: null, onJumpToRef: () => {}, onClose: () => {} }),
        ),
      ),
    );
  }
  /** The section seen at `top`, below a card whose top is at 0. */
  function seen(isIntersecting: boolean, top: number) {
    const live = observed.filter((o) => !o.disconnected).pop()!;
    act(() =>
      live.callback(
        [{ isIntersecting, boundingClientRect: { top }, rootBounds: { top: 0, bottom: 500 }, target: live.target } as unknown as IntersectionObserverEntry],
        {} as IntersectionObserver,
      ),
    );
  }
  const jump = () => button(/^Webster 1828/);

  it("shows while the section is below the fold, goes to it, and goes once it is in view", () => {
    renderCard();
    expect(observed[observed.length - 1].target).toBe(section());
    expect(jump()).toBeUndefined();
    seen(false, 900);
    // The card scrolls, not the section into view past it.
    act(() => jump()!.click());
    expect(scrolled).toEqual([card.current]);
    seen(true, 400);
    expect(jump()).toBeUndefined();
  });

  it("is not there for a word Webster does not have", () => {
    lookup = null;
    renderCard();
    expect(observed).toEqual([]);
    expect(jump()).toBeUndefined();
  });
});
