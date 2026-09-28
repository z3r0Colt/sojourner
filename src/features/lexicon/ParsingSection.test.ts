import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MorphologyWord } from "../../api/types";
import { ParsingSection, parsedWordOrNull, type ParsedWord } from "./ParsingSection";

/**
 * The Strong's card's Parsing section in a real (jsdom) React tree: which
 * rows it shows, and that each opens and closes its explanation as a
 * disclosure should.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// בָּנָיו, "his sons", at the end of a verse: a noun with a pronoun suffix.
const HIS_SONS: ParsedWord = {
  id: 7,
  sort_order: 3,
  original_word: "בָּנָיו׃",
  lemma: "בֵּן",
  morph_code: "HNcmpc/Sp3ms",
  strongs_id: "H1121",
  parsing: {
    language: "hebrew",
    part_of_speech: "noun",
    tense: null,
    voice: null,
    mood: null,
    person: null,
    number: "plural",
    gender: "masculine",
    case: null,
    state: "construct",
    stem: null,
    kind: "common",
    description: "noun, masculine plural construct",
    affixes: [{ role: "suffix", description: "pronominal suffix, 3rd person masculine singular" }],
  },
};

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
});

function render(word: ParsedWord) {
  act(() => root.render(createElement(ParsingSection, { word })));
  return host.querySelector<HTMLElement>('section[aria-label="Parsing"]')!;
}

function rowButton(section: HTMLElement, term: string): HTMLButtonElement {
  const button = [...section.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.startsWith(term));
  if (!button) throw new Error(`no row for ${term}`);
  return button;
}

function explanationOf(button: HTMLButtonElement): HTMLElement {
  return document.getElementById(button.getAttribute("aria-controls")!)!;
}

describe("ParsingSection", () => {
  it("shows the word as written, its code and its parsing in a sentence", () => {
    const section = render(HIS_SONS);
    expect(section.textContent).toContain("HNcmpc/Sp3ms");
    // The sof pasuq is the verse's, not the word's.
    const form = section.querySelector('[lang="he"]')!;
    expect(form.textContent).toBe("בָּנָיו");
    expect(section.textContent).toContain("Noun, masculine plural construct");
  });

  it("gives each term a row with its name and gloss, and the suffix a row of its own under its heading", () => {
    const section = render(HIS_SONS);
    const rows = [...section.querySelectorAll("button")].map((b) => b.textContent);
    expect(rows).toEqual([
      expect.stringMatching(/^Noun A word naming/),
      expect.stringMatching(/^Common noun /),
      expect.stringMatching(/^Masculine /),
      expect.stringMatching(/^Plural /),
      expect.stringMatching(/^Construct /),
      expect.stringMatching(/^Pronoun suffix · 3rd person masculine singular A pronoun joined/),
    ]);
    expect(section.textContent).toContain("Prefixes and suffixes");
  });

  it("starts every explanation closed, and opens and closes each on its own", () => {
    const section = render(HIS_SONS);
    const construct = rowButton(section, "Construct");
    const suffix = rowButton(section, "Pronoun suffix");
    for (const b of section.querySelectorAll("button")) {
      expect(b.getAttribute("type")).toBe("button");
      expect(b.getAttribute("aria-expanded")).toBe("false");
      expect(explanationOf(b).hidden).toBe(true);
    }

    act(() => construct.click());
    expect(construct.getAttribute("aria-expanded")).toBe("true");
    expect(explanationOf(construct).hidden).toBe(false);
    expect(explanationOf(construct).textContent).toMatch(/of/);
    expect(suffix.getAttribute("aria-expanded")).toBe("false");

    act(() => suffix.click());
    expect(explanationOf(suffix).hidden).toBe(false);
    expect(explanationOf(suffix).textContent).toMatch(/suso/);

    act(() => construct.click());
    expect(construct.getAttribute("aria-expanded")).toBe("false");
    expect(explanationOf(construct).hidden).toBe(true);
    expect(explanationOf(suffix).hidden).toBe(false);
  });

  it("says why the code beside a word read otherwise names something else, and says nothing for any other word", () => {
    // Gen 1:31's מְאֹד, "very": coded as a number, read as the adverb it is.
    const very: ParsedWord = {
      ...HIS_SONS,
      original_word: "מְאֹד",
      morph_code: "HAcmsa",
      strongs_id: "H3966",
      parsing: {
        ...HIS_SONS.parsing,
        part_of_speech: "adverb",
        kind: null,
        gender: null,
        number: null,
        state: null,
        description: "adverb",
        affixes: [],
        coded_as: "a cardinal number",
      },
    };
    const section = render(very);
    expect(section.textContent).toContain("HAcmsa");
    expect(section.textContent).toContain("The code calls it a cardinal number; the parsing reads the word as it is used here.");
    expect(render(HIS_SONS).textContent).not.toContain("The code calls it");
  });

  it("has no affix heading for a Greek word", () => {
    const section = render({
      ...HIS_SONS,
      original_word: "ἠγάπησεν",
      morph_code: "V-AAI-3S",
      parsing: {
        ...HIS_SONS.parsing,
        language: "greek",
        part_of_speech: "verb",
        kind: null,
        tense: "aorist",
        voice: "active",
        mood: "indicative",
        person: "3rd",
        number: "singular",
        gender: null,
        state: null,
        description: "verb, aorist active indicative, 3rd person singular",
        affixes: [],
      },
    });
    expect(section.textContent).not.toContain("Prefixes and suffixes");
    expect(section.querySelector('[lang="el"]')?.textContent).toBe("ἠγάπησεν");
    expect([...section.querySelectorAll("button")].map((b) => b.textContent?.split(" ")[0])).toEqual(["Verb", "Aorist", "Active", "Indicative", "Third", "Singular"]);
  });
});

describe("parsedWordOrNull", () => {
  it("passes a word with a parsing and nothing else", () => {
    expect(parsedWordOrNull(HIS_SONS)).toBe(HIS_SONS);
    const bare: MorphologyWord = { ...HIS_SONS, morph_code: null, parsing: null };
    expect(parsedWordOrNull(bare)).toBeNull();
    expect(parsedWordOrNull(null)).toBeNull();
    expect(parsedWordOrNull(undefined)).toBeNull();
  });
});
