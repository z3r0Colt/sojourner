import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WebsterEntry, WebsterHit, WebsterLookup } from "../../api/types";

/**
 * Webster's index and entry in a real (jsdom) React tree, the queries and
 * the pane stood in for. What is tested is where the index list and the
 * entry are scrolled to: back where the reader left them when the page comes
 * back (a Scripture link followed from HAND, then Back) -- whether its rows
 * are fetched already or not, and whether the index is open or opened after
 * -- and at the top for a new search or another entry.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const entry = (id: number, word: string): WebsterEntry => ({
  id,
  word,
  key: word.toLowerCase(),
  pos: "n.",
  html: `<p><b>${word.toUpperCase()}</b>, n.</p><p>1. A sense.</p>`,
  aliases: [],
});
const entries: Record<number, WebsterEntry> = { 1: entry(1, "Hand"), 2: entry(2, "Handy") };
const hit = (i: number): WebsterHit => ({ id: 100 + i, word: `Word${i}`, key: `word${i}`, pos: "n.", snippet: "A sense." });
const lookup = (query: string): WebsterLookup => ({ query, matched: query, via: "exact", entries: [entries[1]] });
/** Whether the queries have their answers yet, and whether the index is
 * open (a narrow pane folds it away). */
let fetched = true;
let indexOpen = true;

vi.mock("../../api/queries", () => ({
  useBooks: () => ({ data: [] }),
  useWebsterLookup: (word: string | null) => ({ data: word && fetched ? lookup(word) : undefined }),
  useWebsterSearch: (query: string) => ({ data: query && fetched ? Array.from({ length: 60 }, (_, i) => hit(i)) : undefined, isFetching: false }),
  useWebsterBrowse: () => ({ data: Array.from({ length: 60 }, (_, i) => ({ ...hit(i), key: `a${i}` })), isLoading: false }),
  useWebsterEntry: (id: number | null) => ({ data: id == null ? undefined : entries[id], isLoading: false }),
}));
vi.mock("../../workspace/PaneContext", () => ({
  usePane: () => ({ id: "p1" }),
  usePaneNavigate: () => () => {},
}));
vi.mock("../../components/ui/SidePanel", async () => {
  const { createElement: h } = await import("react");
  return { SidePanel: ({ children }: { children: React.ReactNode }) => h("aside", null, indexOpen ? children : null) };
});
vi.mock("../../workspace/openContent", () => ({ openPassage: () => {}, targetFor: () => "focused" }));
const openAboutAt = vi.fn();
vi.mock("../settings/sections/AboutSection", () => ({ openAboutAt }));
vi.mock("../../state/uiStore", () => ({ useReadingTypography: () => ({}) }));
vi.mock("../commentary/CommentaryPanel", async () => {
  const { createElement: h } = await import("react");
  return { CommentaryHtml: ({ html }: { html: string }) => h("div", { dangerouslySetInnerHTML: { __html: html } }) };
});

const { WebsterDictionary } = await import("./WebsterDictionary");
const { entryPlace, forgetWebsterIndexes, keepWebsterEntry, keepWebsterIndex, keptWebsterIndex, listPlace, scrollToEntryPlace, scrollToListPlace } = await import("./websterIndexMemory");

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  forgetWebsterIndexes();
  fetched = true;
  indexOpen = true;
  // jsdom keeps a scrollTop it is given, but has no scrollTo.
  Element.prototype.scrollTo = function (this: Element, options?: ScrollToOptions | number) {
    if (typeof options === "object" && options.top != null) this.scrollTop = options.top;
  } as Element["scrollTo"];
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  vi.useRealTimers();
});

const render = (entryId: number | null) => act(() => root.render(createElement(WebsterDictionary, { entryId, switcher: null })));
// The index list comes first in the page (when the index is open), the
// entry's column last.
const scrollers = () => [...host.querySelectorAll<HTMLElement>(".overflow-y-auto")];
const indexList = () => (indexOpen ? scrollers()[0] : undefined);
const entryColumn = () => scrollers()[scrollers().length - 1];
const keepHand = () => keepWebsterIndex("p1", { query: "hand", letter: "A", from: "a", trail: [], list: { entry: null, within: 0, scrollTop: 700 } });

function type(text: string) {
  const input = host.querySelector("input")!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => vi.advanceTimersByTime(300));
}

describe("where Webster's index and entry are scrolled to", () => {
  it("comes back where the reader left them, the rows already there", () => {
    keepHand();
    keepWebsterEntry("p1", { id: 1, para: -1, within: 0, scrollTop: 4000 });
    render(1);
    expect((host.querySelector("input") as HTMLInputElement).value).toBe("hand");
    expect(indexList()?.scrollTop).toBe(700);
    expect(entryColumn().scrollTop).toBe(4000);
    expect(keptWebsterIndex("p1")?.list.scrollTop).toBe(700);
  });

  it("goes back to the place once the rows arrive", () => {
    keepHand();
    fetched = false;
    render(1);
    fetched = true;
    render(1);
    expect(indexList()?.scrollTop).toBe(700);
  });

  it("goes back to the place when the folded index is opened again", () => {
    keepHand();
    indexOpen = false;
    render(1);
    indexOpen = true;
    render(1);
    expect(indexList()?.scrollTop).toBe(700);
  });

  it("starts a new search at the top of its list", () => {
    keepHand();
    render(1);
    type("handy");
    expect(indexList()?.scrollTop).toBe(0);
    expect(keptWebsterIndex("p1")).toMatchObject({ query: "handy", list: { entry: null, scrollTop: 0 } });
  });

  it("opens another entry at its headword, and a kept place only on the entry it was in", () => {
    keepWebsterEntry("p1", { id: 1, para: -1, within: 0, scrollTop: 4000 });
    render(1);
    expect(entryColumn().scrollTop).toBe(4000);
    render(2);
    expect(entryColumn().scrollTop).toBe(0);

    // A pane that last showed HAND, opening on HANDY: the top.
    act(() => root.unmount());
    root = createRoot(host);
    keepWebsterEntry("p1", { id: 1, para: -1, within: 0, scrollTop: 4000 });
    render(2);
    expect(entryColumn().scrollTop).toBe(0);
  });

  it("starts at the top in a pane with nothing kept", () => {
    render(null);
    expect(indexList()?.scrollTop).toBe(0);
    expect(keptWebsterIndex("p1")).toMatchObject({ query: "", letter: "A", list: { entry: null, scrollTop: 0 } });
  });
});

/** A column 500px tall showing paragraphs laid out down it from `offsets`
 * (each paragraph `height` tall), scrolled `scrollTop` down. */
function layout(offsets: number[], height: number, scrollTop: number) {
  const column = { scrollTop, getBoundingClientRect: () => ({ top: 100 }) } as unknown as HTMLElement;
  const paras = offsets.map((at) => ({ getBoundingClientRect: () => ({ top: 100 + at - column.scrollTop, bottom: 100 + at + height - column.scrollTop, height }) }));
  const body = { querySelectorAll: () => paras } as unknown as HTMLElement;
  return { column, body };
}

describe("a place in an entry", () => {
  it("is the paragraph at the top of the column, and how far into it", () => {
    const { column, body } = layout([200, 300, 400, 500], 100, 350);
    expect(entryPlace(column, body)).toEqual({ para: 1, within: 0.5, scrollTop: 350 });
    // Above the first paragraph, the offset.
    expect(entryPlace(layout([200, 300], 100, 50).column, layout([200, 300], 100, 50).body)).toEqual({ para: -1, within: 0, scrollTop: 50 });
  });

  it("is found again in the entry drawn at another width", () => {
    // Twice as wide, half as tall: the same words are half as far down.
    const { column, body } = layout([100, 150, 200, 250], 50, 0);
    scrollToEntryPlace(column, body, { para: 1, within: 0.5, scrollTop: 350 });
    expect(column.scrollTop).toBe(175);
    scrollToEntryPlace(column, body, { para: -1, within: 0, scrollTop: 40 });
    expect(column.scrollTop).toBe(40);
  });
});

/** An index list 500px tall showing rows laid out down it from `offsets`
 * (each row `height` tall, for entries 1, 2, 3...), scrolled `scrollTop`
 * down. */
function list(offsets: number[], height: number, scrollTop: number) {
  const rows = offsets.map((at, i) => ({
    dataset: { entry: String(i + 1) },
    getBoundingClientRect: () => ({ top: 100 + at - el.scrollTop, bottom: 100 + at + height - el.scrollTop, height }),
  }));
  const el = {
    scrollTop,
    getBoundingClientRect: () => ({ top: 100 }),
    querySelectorAll: () => rows,
    querySelector: (selector: string) => rows.find((r) => selector === `[data-entry="${r.dataset.entry}"]`) ?? null,
  } as unknown as HTMLElement;
  return el;
}

describe("a place in the index list", () => {
  it("is the entry in the row at the top of the list, and how far into it", () => {
    expect(listPlace(list([0, 60, 120, 180], 60, 150))).toEqual({ entry: 3, within: 0.5, scrollTop: 150 });
    // No rows: the offset.
    expect(listPlace(list([], 60, 40))).toEqual({ entry: null, within: 0, scrollTop: 40 });
  });

  it("is found again in the list drawn narrower, its rows taller", () => {
    // The same rows, 90px tall now: 700px down was two rows short.
    const narrow = list([0, 90, 180, 270], 90, 0);
    scrollToListPlace(narrow, { entry: 3, within: 0.5, scrollTop: 150 });
    expect(narrow.scrollTop).toBe(225);
    // A row the list no longer has: the offset.
    scrollToListPlace(narrow, { entry: 9, within: 0, scrollTop: 40 });
    expect(narrow.scrollTop).toBe(40);
  });
});

describe("Sources and licences, under an entry", () => {
  const sources = () => [...host.querySelectorAll("button")].find((b) => b.textContent === "Sources and licences")!;

  it("opens Webster's credit on a click, and on a middle-click as well", () => {
    openAboutAt.mockClear();
    render(1);
    act(() => sources().dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 })));
    // The middle button, which openAboutAt sends to a new Settings tab.
    act(() => sources().dispatchEvent(new MouseEvent("auxclick", { bubbles: true, button: 1 })));
    // The right button is the context menu's, not a link's.
    act(() => sources().dispatchEvent(new MouseEvent("auxclick", { bubbles: true, button: 2 })));
    expect(openAboutAt.mock.calls.map(([credit, e]) => [credit, e.button])).toEqual([
      ["webster-1828", 0],
      ["webster-1828", 1],
    ]);
  });
});
