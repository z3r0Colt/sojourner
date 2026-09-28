import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MorphologyWord, StrongsEntry, WebsterLookup } from "../../api/types";

/**
 * The Strong's card in a real (jsdom) React tree, its entry stood in for and
 * the panes, lexicon shelf and sermon actions it links to replaced by
 * stand-ins: what is tested is where the Parsing section goes -- after the
 * headword and pronunciation and before the definition, under "No lexicon
 * entry found" when there is no entry, nowhere while the entry is loading or
 * when nothing was matched -- and that its rows start closed again for
 * another word.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const AGAPAO: StrongsEntry = {
  id: "G25",
  language: "greek",
  original_word: "ἀγαπάω",
  transliteration: "agapaō",
  pronunciation: "ag-ap-ah'-o",
  short_definition: "to love",
  definition: "to love (in a social or moral sense)",
  derivation: null,
  kjv_usage: "(be-)love(-ed)",
  thayers_definition: null,
};

/** What the card's entry query gives, set by each test. */
let entryQuery: { data: StrongsEntry | undefined; isLoading: boolean } = { data: AGAPAO, isLoading: false };

/** Webster 1828 for "loved", and every word Webster was asked for. */
const LOVE: WebsterLookup = {
  query: "loved",
  matched: "love",
  via: "base",
  entries: [{ id: 7, word: "Love", key: "love", pos: "v.t.", aliases: [], html: "<p><b>LOVE</b>, v.t. luv.</p><p>1. In a general sense to be pleased with.</p>" }],
};
const websterAsked: (string | null)[] = [];

vi.mock("../../api/queries", () => ({
  useStrongsEntry: (id: string | null) => (id == null ? { data: undefined, isLoading: false } : entryQuery),
  useBooks: () => ({ data: [] }),
  useWebsterLookup: (word: string | null) => {
    websterAsked.push(word);
    return { data: word === "loved" ? LOVE : null };
  },
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: undefined }) }));
vi.mock("../../api/client", () => ({ api: {} }));
vi.mock("../commentary/CommentaryPanel", () => ({ CommentaryHtml: () => null }));
vi.mock("../sermons/StudyActions", () => ({ StudyActions: () => null }));
vi.mock("../sermons/sourceIdentity", () => ({ strongsRef: (id: string) => id }));
vi.mock("../../workspace/openContent", () => ({ openContent: () => {}, openPassage: () => {}, targetFor: () => "focused" }));
vi.mock("../../workspace/PaneLink", async () => {
  const { createElement: h } = await import("react");
  return { PaneLink: ({ children }: { children: unknown }) => h("a", null, children as string) };
});

const { StrongsPopup } = await import("./StrongsPopup");

const LOVED: MorphologyWord = {
  id: 102,
  sort_order: 2,
  original_word: "ἠγάπησεν",
  lemma: "ἀγαπάω",
  morph_code: "V-AAI-3S",
  strongs_id: "G25",
  parsing: {
    language: "greek",
    part_of_speech: "verb",
    tense: "aorist",
    voice: "active",
    mood: "indicative",
    person: "3rd",
    number: "singular",
    gender: null,
    case: null,
    state: null,
    stem: null,
    kind: null,
    description: "verb, aorist active indicative, 3rd person singular",
    affixes: [],
  },
};
// John 14:21's ἀγαπῶν, "he that loveth": another word of the same entry.
const LOVING: MorphologyWord = {
  ...LOVED,
  id: 240,
  original_word: "ἀγαπῶν",
  morph_code: "V-PAP-NSM",
  parsing: {
    ...LOVED.parsing!,
    tense: "present",
    mood: "participle",
    person: null,
    case: "nominative",
    gender: "masculine",
    description: "verb, present active participle, nominative masculine singular",
  },
};

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  entryQuery = { data: AGAPAO, isLoading: false };
  websterAsked.length = 0;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
});

function render(props: Partial<Parameters<typeof StrongsPopup>[0]>) {
  act(() => root.render(createElement(StrongsPopup, { id: "G25", x: 10, y: 10, onClose: () => {}, ...props })));
}

const section = () => host.querySelector<HTMLElement>('section[aria-label="Parsing"]');
/** The first element whose own text is `text`. */
function elementWith(text: string): HTMLElement {
  const found = [...host.querySelectorAll<HTMLElement>("*")].find((el) => el.childElementCount === 0 && el.textContent === text);
  if (!found) throw new Error(`nothing reads ${text}`);
  return found;
}
const precedes = (a: Node, b: Node) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

describe("StrongsPopup's Parsing section", () => {
  it("comes after the headword and pronunciation and before the definition", () => {
    render({ parsedWord: LOVED });
    const parsing = section()!;
    expect(parsing.textContent).toContain("Verb, aorist active indicative, 3rd person singular");
    expect(precedes(elementWith("ἀγαπάω"), parsing)).toBe(true);
    expect(precedes(elementWith("pronounced: ag-ap-ah'-o"), parsing)).toBe(true);
    expect(precedes(parsing, elementWith("to love (in a social or moral sense)"))).toBe(true);
  });

  it("is not there when the card was not opened for one particular word, or the word has no parsing", () => {
    render({ parsedWord: null });
    expect(elementWith("to love (in a social or moral sense)")).toBeTruthy();
    expect(section()).toBeNull();
    render({ parsedWord: { ...LOVED, parsing: null } });
    expect(section()).toBeNull();
  });

  it("shows under 'No lexicon entry found' when the number has no entry", () => {
    entryQuery = { data: undefined, isLoading: false };
    render({ parsedWord: LOVED });
    const parsing = section()!;
    expect(parsing).not.toBeNull();
    expect(precedes(elementWith("No lexicon entry found."), parsing)).toBe(true);
  });

  it("is not there while the entry or the match is loading, or when nothing was matched", () => {
    entryQuery = { data: undefined, isLoading: true };
    render({ parsedWord: LOVED });
    expect(section()).toBeNull();
    // No entry yet, and the match still being worked out: not "No lexicon
    // entry found" with a parsing under it.
    entryQuery = { data: undefined, isLoading: false };
    render({ parsedWord: LOVED, loading: true });
    expect(host.textContent).not.toContain("No lexicon entry found.");
    expect(section()).toBeNull();
    render({ id: null, word: "ἠγάπησεν", parsedWord: LOVED });
    expect(host.textContent).toContain("No Strong's number matched this word here.");
    expect(section()).toBeNull();
  });

  it("starts its rows closed again for another word, and keeps them for the same one", () => {
    render({ parsedWord: LOVED });
    const aorist = [...section()!.querySelectorAll("button")].find((b) => b.textContent?.startsWith("Aorist"))!;
    act(() => aorist.click());
    expect(aorist.getAttribute("aria-expanded")).toBe("true");
    render({ parsedWord: { ...LOVED } });
    expect(section()!.querySelector('[aria-expanded="true"]')?.textContent).toMatch(/^Aorist/);

    render({ parsedWord: LOVING });
    expect(section()!.textContent).toContain("Verb, present active participle, nominative masculine singular");
    expect(section()!.querySelector('[aria-expanded="true"]')).toBeNull();
  });
});

describe("StrongsPopup's Webster 1828 section", () => {
  const webster = () => host.querySelector<HTMLElement>('section[aria-label="Webster 1828"]');

  it("comes after the Strong's entry, for a word of an English text", () => {
    render({ parsedWord: LOVED, englishWord: { word: "loved", place: { book: "John", chapter: 3 } } });
    const websterSection = webster()!;
    expect(websterSection.textContent).toContain("LOVE");
    expect(websterSection.textContent).toContain("from love");
    // After the parsing, the definition and the entry's links.
    expect(precedes(section()!, websterSection)).toBe(true);
    expect(precedes(elementWith("to love (in a social or moral sense)"), websterSection)).toBe(true);
    expect(precedes(elementWith("Full lexicon entry"), websterSection)).toBe(true);
  });

  it("comes after 'No Strong's number matched' too", () => {
    render({ id: null, word: "loved", englishWord: { word: "loved", place: null } });
    expect(precedes(elementWith("No Strong's number matched this word here."), webster()!)).toBe(true);
  });

  it("is not there, and Webster is not asked, for a Greek or Hebrew word", () => {
    render({ parsedWord: LOVED });
    expect(webster()).toBeNull();
    expect(websterAsked).toEqual([]);
  });
});

describe("StrongsPopup's definition", () => {
  it("reads θεός's as the importer stored it, where Strong's has the line", () => {
    entryQuery = {
      data: {
        ...AGAPAO,
        id: "G2316",
        original_word: "θεός",
        transliteration: "theós",
        pronunciation: "theh'-os",
        short_definition: null,
        definition: "a deity, especially (with G3588) the supreme Divinity; figuratively, a magistrate; by Hebraism, very",
        derivation: "of uncertain affinity;",
        kjv_usage: ":--X exceeding, God, god(-ly, -ward).",
      },
      isLoading: false,
    };
    render({ id: "G2316" });
    const definition = elementWith("a deity, especially (with G3588) the supreme Divinity; figuratively, a magistrate; by Hebraism, very");
    expect(precedes(elementWith("Derivation:"), definition)).toBe(false);
    expect(host.textContent).toContain("Derivation: of uncertain affinity;");
    expect(host.textContent).not.toContain("Derivation: of uncertain affinity; a deity");
  });
});
