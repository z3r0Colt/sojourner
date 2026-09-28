import { describe, expect, it } from "vitest";
import glossary from "../lexicon/parsingGlossary.json";
import { lookupTerm } from "../lexicon/parsingGlossary";
import {
  FIELD_VALUE_ORDER,
  HEBREW_TENSE_ORDER,
  SEARCH_EXAMPLES,
  morphFieldOptions,
  searchExample,
  valueOrder,
  type MorphSearchField,
} from "./morphFieldOptions";

const FIELDS = Object.keys(FIELD_VALUE_ORDER) as MorphSearchField[];

/**
 * The stems FIELD_VALUE_ORDER leaves to the alphabet, each named, so that a
 * stem a reader will often choose cannot be left there unnoticed. In
 * content.db they are a handful of words or none: TAHOT folds the rarer
 * Hebrew patterns (polel, pilpel, hithpalpel...) into the main stems, and
 * tags the hothpaal 8 times, the nithpael and the tiphil 3 apiece, and the
 * Aramaic ithpaal 6 times, ithpeel 3 and ishtaphel 2. A stem the tagging
 * uses more than that goes in the order instead.
 */
const RARE_STEMS = [
  "polel", "polal", "hithpolel", "poel", "poal", "palel", "pulal", "pilpel", "polpal", "hithpalpel",
  "nithpael", "pealal", "pilel", "hothpaal", "tiphil", "nithpalel", "nithpoel", "hithpoel",
  "ithpeel", "ithpaal", "saphel", "ishtaphel", "hithaphel", "hephal", "tiphel", "palpel",
  "ithpalpel", "ithpoel", "ithpolel", "ittaphal",
];

/** Every value the glossary explains for a field: which is every value
 *  morph.rs can give it (parsingGlossary.test.ts holds the two together). */
function glossaryValues(field: MorphSearchField): string[] {
  return Object.keys(glossary.terms)
    .filter((key) => key.startsWith(`${field}:`))
    .map((key) => key.slice(field.length + 1));
}

const values = (field: MorphSearchField, vs: string[], language: "greek" | "hebrew" = "greek") =>
  morphFieldOptions(field, vs, language).map((o) => o.value);

describe("morphFieldOptions", () => {
  it("offers a field's values in the grammars' order, not the alphabet's", () => {
    expect(values("case", ["accusative", "dative", "genitive", "nominative", "vocative"])).toEqual([
      "nominative", "genitive", "dative", "accusative", "vocative",
    ]);
    expect(values("tense", ["aorist", "future", "imperfect", "perfect", "pluperfect", "present"])).toEqual([
      "present", "imperfect", "future", "aorist", "perfect", "pluperfect",
    ]);
    expect(values("stem", ["hiphil", "niphal", "piel", "qal"], "hebrew")).toEqual(["qal", "niphal", "piel", "hiphil"]);
  });

  it("gives the Hebrew conjugations their own order", () => {
    // As content.db sorts them.
    const alphabetical = [
      "conjunctive imperfect", "imperative", "imperfect", "infinitive absolute", "infinitive construct",
      "participle", "passive participle", "perfect", "sequential imperfect", "sequential perfect",
    ];
    expect(values("tense", alphabetical, "hebrew")).toEqual(HEBREW_TENSE_ORDER);
    expect(valueOrder("tense", "greek")).toBe(FIELD_VALUE_ORDER.tense);
  });

  it("puts a value it has no place for after the rest, alphabetically, and each value once", () => {
    expect(values("stem", ["qal", "polel", "hithpalpel", "piel", "polel"], "hebrew")).toEqual(["qal", "piel", "hithpalpel", "polel"]);
    expect(values("gender", ["something new", "common", "masculine"], "hebrew")).toEqual(["masculine", "common", "something new"]);
  });

  it("names each value as the glossary does, with its gloss for a tooltip", () => {
    const [wayyiqtol] = morphFieldOptions("tense", ["sequential imperfect"], "hebrew");
    expect(wayyiqtol.label).toBe("Sequential imperfect (wayyiqtol)");
    expect(wayyiqtol.title).toBe(lookupTerm("tense", "sequential imperfect")?.short);
    // The Hebrew perfect is not the Greek one.
    expect(morphFieldOptions("tense", ["perfect"], "hebrew")[0].label).toBe(lookupTerm("tense", "perfect", "hebrew")?.term);
    expect(morphFieldOptions("tense", ["perfect"], "greek")[0].label).toBe(lookupTerm("tense", "perfect", "greek")?.term);
    expect(morphFieldOptions("tense", ["perfect"], "hebrew")[0].label).not.toBe(morphFieldOptions("tense", ["perfect"], "greek")[0].label);
    // A value the glossary does not know is offered as it is.
    expect(morphFieldOptions("kind", ["something new"], "greek")).toEqual([{ value: "something new", label: "something new" }]);
  });

  it("does not offer a Hebrew mood the conjugation already offers", () => {
    // "Mood: Imperative" found exactly what "Tense: Imperative" did.
    expect(values("mood", ["imperative", "indicative", "jussive", "participle"], "hebrew")).toEqual(["indicative", "jussive", "participle"]);
    expect(values("mood", ["imperative", "indicative"], "greek")).toEqual(["indicative", "imperative"]);
    // The moods that stay say what they take in, with Hebrew examples.
    expect(morphFieldOptions("mood", ["participle"], "hebrew")[0].label).toBe("Participle (active or passive)");
    expect(morphFieldOptions("mood", ["infinitive"], "hebrew")[0].label).toBe("Infinitive (construct or absolute)");
    expect(morphFieldOptions("mood", ["indicative"], "hebrew")[0].title).not.toMatch(/Jesus/);
    expect(morphFieldOptions("kind", ["personal name"], "hebrew")[0].title).not.toMatch(/Mary|Paul/);
  });

  it("names only values the decoder gives now", () => {
    // An older decoder's "both" gender, "jussive" tense and "Aramaic" kind
    // are not values any more (the search still reads them; see
    // `asked_fields` in word_study.rs), so no list here may hold them.
    for (const field of FIELDS) {
      for (const language of ["greek", "hebrew"] as const) {
        for (const v of valueOrder(field, language)) {
          expect(lookupTerm(field, v, language), `${field}:${v}`).not.toBeNull();
        }
      }
    }
    expect(FIELD_VALUE_ORDER.gender).not.toContain("both");
    expect([...FIELD_VALUE_ORDER.tense, ...HEBREW_TENSE_ORDER]).not.toContain("jussive");
  });

  it("has a place for every value the decoder gives, the rarer stems apart", () => {
    for (const field of FIELDS) {
      const placed = new Set([
        ...FIELD_VALUE_ORDER[field],
        ...(field === "tense" ? HEBREW_TENSE_ORDER : []),
        ...(field === "stem" ? RARE_STEMS : []),
      ]);
      const unplaced = glossaryValues(field).filter((v) => !placed.has(v));
      expect(unplaced, field).toEqual([]);
    }
    // A rare stem is one the order leaves out, and one there is.
    for (const stem of RARE_STEMS) {
      expect(FIELD_VALUE_ORDER.stem, stem).not.toContain(stem);
      expect(lookupTerm("stem", stem), stem).not.toBeNull();
    }
    expect(new Set(RARE_STEMS).size).toBe(RARE_STEMS.length);
    // The Hebrew stems in the order before the Aramaic, the hishtaphel with them.
    const hebrew = FIELD_VALUE_ORDER.stem.slice(0, FIELD_VALUE_ORDER.stem.indexOf("peal"));
    expect(hebrew).toContain("hishtaphel");
    expect(values("stem", ["peal", "hishtaphel", "hothpaal", "qal"], "hebrew")).toEqual(["qal", "hishtaphel", "peal", "hothpaal"]);
    for (const field of FIELDS) {
      const order = FIELD_VALUE_ORDER[field];
      expect(new Set(order).size, field).toBe(order.length);
    }
  });
});

describe("searchExample", () => {
  it("gives each language an example in its own terms, from its own Testament", () => {
    expect(searchExample("greek")).toBe("tense aorist and mood imperative, in Ephesians");
    expect(searchExample("hebrew")).toBe("stem piel and tense imperative, in Psalms");
    expect(searchExample("hebrew")).not.toMatch(/aorist|Ephesians/);
  });

  it("names only values the form offers in that language", () => {
    for (const language of ["greek", "hebrew"] as const) {
      for (const [field, value] of Object.entries(SEARCH_EXAMPLES[language].fields)) {
        expect(valueOrder(field as MorphSearchField, language), `${language} ${field}`).toContain(value);
      }
    }
  });
});
