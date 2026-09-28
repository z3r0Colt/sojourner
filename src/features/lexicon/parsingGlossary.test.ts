import { describe, expect, it } from "vitest";
import glossary from "./parsingGlossary.json";
import morphSource from "../../../src-tauri/src/morph.rs?raw";
import { PARSING_FIELD_ORDER, lookupTerm, termsFor, type GlossaryEntry } from "./parsingGlossary";
import type { MorphParsing } from "../../api/types";

const TERMS: Record<string, GlossaryEntry> = glossary.terms;
const HEBREW_AND_ARAMAIC: Record<string, GlossaryEntry> = glossary.hebrew_and_aramaic;
const FIELDS = new Set<string>([...PARSING_FIELD_ORDER, "affix"]);

// morph.rs without its tests and comments: the code that decides what values
// a parsing can hold.
const MORPH_CODE = morphSource.slice(0, morphSource.indexOf("#[cfg(test)]")).replace(/\/\/.*$/gm, "");

function matchesOf(pattern: RegExp, text: string): string[] {
  return [...text.matchAll(pattern)].flatMap((m) => m.slice(1));
}

// The stem tables, HEBREW_STEMS and ARAMAIC_STEMS: ('q', "qal").
const STEMS = matchesOf(/\('.', "([^"]+)"\)/g, MORPH_CODE);

/**
 * Every value morph.rs can put in each field, read off the code by hand
 * (stems apart, which come from its tables). The glossary must have exactly
 * these: an entry for each, and nothing for a value morph.rs no longer
 * emits. When morph.rs gains a value, add it here and write its entry.
 */
const MORPH_VALUES: Record<string, string[]> = {
  part_of_speech: [
    "verb", "noun", "adjective", "article", "pronoun", "adverb", "conjunction",
    "preposition", "particle", "interjection", "foreign word",
  ],
  kind: [
    // Greek: indeclinables, pronouns, COND, and STEPBible's trailing tags.
    "proper name, indeclinable", "numeral, indeclinable", "letter", "indeclinable",
    "personal", "relative", "reciprocal", "demonstrative", "correlative", "interrogative",
    "indefinite", "correlative or interrogative", "reflexive", "possessive", "conditional",
    "transliterated from hebrew", "transliterated from aramaic", "negative", "comparative",
    "superlative", "personal name", "place name", "title", "gentilic",
    // Hebrew and Aramaic, where not already above.
    "proper name", "common", "cardinal number", "ordinal number", "definite article",
    "affirmation", "exhortation", "interjection", "direct object marker",
    // What יֵשׁ, "there is", is read as, though its code calls it a number.
    "existence",
  ],
  stem: STEMS,
  tense: [
    "present", "imperfect", "future", "aorist", "perfect", "pluperfect",
    "sequential perfect", "sequential imperfect", "conjunctive imperfect", "imperative",
    "participle", "passive participle", "infinitive absolute", "infinitive construct",
  ],
  voice: [
    "active", "middle", "passive", "middle or passive", "middle deponent", "passive deponent",
    "middle or passive deponent",
  ],
  mood: ["indicative", "subjunctive", "optative", "imperative", "infinitive", "participle", "cohortative", "jussive"],
  person: ["1st", "2nd", "3rd"],
  case: ["nominative", "genitive", "dative", "accusative", "vocative"],
  gender: ["masculine", "feminine", "neuter", "common"],
  number: ["singular", "plural", "dual"],
  state: ["absolute", "construct", "determined"],
  affix: [
    "preposition", "article", "conjunction", "sequential conjunction", "interrogative particle",
    "relative particle", "pronominal suffix", "directional suffix", "paragogic he", "paragogic nun",
  ],
};
const EXPECTED_KEYS = Object.entries(MORPH_VALUES).flatMap(([field, values]) => values.map((v) => `${field}:${v}`));

/** Sentences, split where a full stop, question or exclamation mark (and any
 *  closing quote) is followed by a space and a capital or an opening quote. */
function sentences(text: string): string[] {
  return text.split(/(?<=[.!?][”’)]?)\s+(?=[A-Z“‘])/);
}

function parsing(fields: Partial<MorphParsing> & Pick<MorphParsing, "language">): MorphParsing {
  return {
    part_of_speech: null,
    tense: null,
    voice: null,
    mood: null,
    person: null,
    number: null,
    gender: null,
    case: null,
    state: null,
    stem: null,
    kind: null,
    description: "",
    affixes: [],
    ...fields,
  };
}

describe("parsingGlossary.json", () => {
  it("says where its terms were checked, with STEPBible's CC BY credit", () => {
    expect(glossary.note).toContain("TEGMC");
    expect(glossary.note).toContain("TEHMC");
    expect(glossary.note).toContain("b99716b0cddb648ddb95cc786a197180f2f97d48");
    expect(glossary.note).toContain("Tyndale House Cambridge, CC BY 4.0");
  });

  it("keys every entry <field>:<value> with a known field and a lower-case value", () => {
    for (const key of [...Object.keys(TERMS), ...Object.keys(HEBREW_AND_ARAMAIC)]) {
      const [field, value] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)];
      expect(FIELDS.has(field), key).toBe(true);
      expect(value, key).toBe(value.trim().toLowerCase());
      expect(value, key).not.toBe("");
    }
  });

  it("keeps every term, gloss and explanation within its limits", () => {
    for (const [key, entry] of [...Object.entries(TERMS), ...Object.entries(HEBREW_AND_ARAMAIC)]) {
      expect(entry.term.trim(), key).not.toBe("");
      expect(entry.term.length, key).toBeLessThanOrEqual(40);
      expect(entry.short.trim(), key).not.toBe("");
      expect(entry.short.length, key).toBeLessThanOrEqual(90);
      const count = sentences(entry.explain).length;
      expect(count, `${key}: ${count} sentences`).toBeGreaterThanOrEqual(2);
      expect(count, `${key}: ${count} sentences`).toBeLessThanOrEqual(4);
      expect(entry.explain.length, key).toBeLessThanOrEqual(600);
      // Straight double quotes would mean a quotation typed as code.
      expect(entry.short + entry.explain, key).not.toContain('"');
    }
  });

  it("speaks to the reader, not of the data it was made from", () => {
    // The reader sees a word's parsing, not the tagging behind it, and has
    // no reason to know what STEPBible, TAHOT or TAGNT are.
    for (const [key, entry] of [...Object.entries(TERMS), ...Object.entries(HEBREW_AND_ARAMAIC)]) {
      expect(entry.term + entry.short + entry.explain, key).not.toMatch(/tagg(ed|ing)|STEPBible|TAHOT|TAGNT|OSHB/);
    }
  });

  it("gives Hebrew examples where a Hebrew word is explained", () => {
    // The Hebrew search offers these moods and kinds with the glossary's
    // gloss as their tooltip: not "Jesus wept" or "Mary, Paul".
    for (const key of ["mood:indicative", "kind:personal name", "kind:conditional"]) {
      const entry = HEBREW_AND_ARAMAIC[key];
      expect(entry.short + entry.explain, key).not.toMatch(/Jesus|Mary|Paul|repent|John \d/);
    }
    expect(lookupTerm("kind", "conditional", "hebrew")?.explain).toContain("im");
    expect(TERMS["kind:conditional"].short + TERMS["kind:conditional"].explain).not.toContain("ki");
  });

  it("has an entry for every value morph.rs emits, and none for values it does not", () => {
    expect(STEMS.length).toBeGreaterThan(40);
    const missing = EXPECTED_KEYS.filter((k) => !(k in TERMS));
    expect(missing).toEqual([]);
    const orphans = Object.keys(TERMS).filter((k) => !EXPECTED_KEYS.includes(k));
    expect(orphans).toEqual([]);
  });

  it("only overrides for Hebrew and Aramaic an entry the general list has", () => {
    for (const key of Object.keys(HEBREW_AND_ARAMAIC)) expect(key in TERMS, key).toBe(true);
    expect(Object.keys(HEBREW_AND_ARAMAIC).sort()).toEqual([
      // What the conditional is in Hebrew, and a name with Hebrew examples.
      "kind:conditional",
      "kind:personal name",
      // The Hebrew mood, which follows from the conjugation.
      "mood:indicative",
      "mood:infinitive",
      "mood:participle",
      // The particle, which in Hebrew takes in lemaan, "so that, for the
      // sake of".
      "part_of_speech:particle",
      // The two names the languages share for different things.
      "tense:imperfect",
      "tense:perfect",
    ]);
  });

  // A drift guard that does not rely on the list above being kept up: every
  // plain-English literal morph.rs can hand back must be some entry's value.
  it("covers every value literal written into morph.rs", () => {
    const literals = new Set(
      [
        /\bs\("([^"]*)"\)/g, // s("aorist")
        /Some\("([^"]*)"\)/g, // Some("place name"), in greek_tag
        /=> "([^"]*)"/g, // "N" => "noun", inside s(match ...)
        /\{ "([^"]*)" \}/g, // s(if ... { "transliterated from aramaic" } ...)
        /=> \("([^"]*)", "([^"]*)"\)/g, // Some('j') => ("imperfect", "jussive")
        /"([^"]*)"\.into\(\)/g, // "directional suffix".into()
        /"([^"]*)"\.to_string\(\)/g, // "pronominal suffix".to_string()
        /\('.', "([^"]+)"\)/g, // the stem tables
      ]
        .flatMap((pattern) => matchesOf(pattern, MORPH_CODE))
        .concat(matchesOf(/&\[("[^\]]*)\]/g, MORPH_CODE).flatMap((list) => matchesOf(/"([^"]*)"/g, list)))
        // Code letters are upper case; the language and affix-role names are
        // not parsing values.
        .filter((v) => /^[a-z0-9][a-z0-9 ,]*$/.test(v) && !["greek", "hebrew", "aramaic", "prefix", "suffix"].includes(v)),
    );
    expect(literals.size).toBeGreaterThan(100);
    const values = new Set(Object.keys(TERMS).map((k) => k.slice(k.indexOf(":") + 1)));
    expect([...literals].filter((v) => !values.has(v))).toEqual([]);
  });
});

describe("lookupTerm", () => {
  it("matches the value without regard to case or spacing", () => {
    expect(lookupTerm("tense", "Aorist")?.term).toBe("Aorist");
    expect(lookupTerm("tense", "  AORIST ")?.term).toBe("Aorist");
    expect(lookupTerm("stem", "Qal")?.term).toBe("Qal");
    expect(lookupTerm("voice", "Middle  or   Passive")?.term).toBe("Middle or passive");
    expect(lookupTerm("kind", "Transliterated From Aramaic")?.term).toBe("Aramaic word");
    expect(lookupTerm("case", "GENITIVE")).toBe(TERMS["case:genitive"]);
  });

  it("gives the Hebrew reading of a name the two languages share, when told the language", () => {
    expect(lookupTerm("tense", "perfect")?.term).toBe("Perfect");
    expect(lookupTerm("tense", "perfect", "greek")?.term).toBe("Perfect");
    expect(lookupTerm("tense", "perfect", "hebrew")?.term).toBe("Perfect (qatal)");
    expect(lookupTerm("tense", "imperfect", "aramaic")?.term).toBe("Imperfect (yiqtol)");
    // Anything not overridden is the same in every language.
    expect(lookupTerm("gender", "masculine", "hebrew")).toBe(TERMS["gender:masculine"]);
  });

  it("finds an affix by its kind when the description adds person, gender and number", () => {
    expect(lookupTerm("affix", "pronominal suffix, 3rd person masculine singular")).toBe(TERMS["affix:pronominal suffix"]);
    expect(lookupTerm("affix", "Pronominal Suffix, 1st person common singular")).toBe(TERMS["affix:pronominal suffix"]);
    expect(lookupTerm("affix", "sequential conjunction")?.term).toBe("Sequential “and”");
  });

  it("returns null for nothing, or for a value it has no entry for", () => {
    expect(lookupTerm("tense", null)).toBeNull();
    expect(lookupTerm("tense", undefined)).toBeNull();
    expect(lookupTerm("tense", "   ")).toBeNull();
    expect(lookupTerm("tense", "pastish")).toBeNull();
    // The comma rule is for affixes only.
    expect(lookupTerm("kind", "proper name, something else")).toBeNull();
    // A value filed under another field is not this field's.
    expect(lookupTerm("tense", "genitive")).toBeNull();
  });
});

describe("termsFor", () => {
  const keys = (p: MorphParsing) => termsFor(p).map((t) => t.key);

  it("reads a Greek participle in order: part of speech, tense, voice, mood, case, gender, number", () => {
    // V-PAP-NSM
    const p = parsing({ language: "greek", part_of_speech: "verb", tense: "present", voice: "active", mood: "participle", case: "nominative", number: "singular", gender: "masculine" });
    expect(keys(p)).toEqual([
      "part_of_speech:verb",
      "tense:present",
      "voice:active",
      "mood:participle",
      "case:nominative",
      "gender:masculine",
      "number:singular",
    ]);
  });

  it("keeps a Greek indicative, and puts a pronoun's kind and person before its case", () => {
    // V-AAI-3S
    expect(keys(parsing({ language: "greek", part_of_speech: "verb", tense: "aorist", voice: "active", mood: "indicative", person: "3rd", number: "singular" }))).toEqual([
      "part_of_speech:verb",
      "tense:aorist",
      "voice:active",
      "mood:indicative",
      "person:3rd",
      "number:singular",
    ]);
    // P-1GS
    expect(keys(parsing({ language: "greek", part_of_speech: "pronoun", kind: "personal", person: "1st", case: "genitive", number: "singular" }))).toEqual([
      "part_of_speech:pronoun",
      "kind:personal",
      "person:1st",
      "case:genitive",
      "number:singular",
    ]);
  });

  it("reads a Hebrew verb stem first, then its conjugation, then person, gender, number, then its prefixes", () => {
    // Hc/Vqw3ms, "and he said"
    const said = parsing({
      language: "hebrew",
      part_of_speech: "verb",
      stem: "qal",
      tense: "sequential imperfect",
      mood: "indicative",
      person: "3rd",
      gender: "masculine",
      number: "singular",
      affixes: [{ role: "prefix", description: "sequential conjunction" }],
    });
    const terms = termsFor(said);
    expect(terms.map((t) => t.key)).toEqual([
      "part_of_speech:verb",
      "stem:qal",
      "tense:sequential imperfect",
      "person:3rd",
      "gender:masculine",
      "number:singular",
      "affix:sequential conjunction",
    ]);
    expect(terms[terms.length - 1]).toMatchObject({ field: "affix", role: "prefix", value: "sequential conjunction" });
    expect(terms[0].role).toBeUndefined();
  });

  it("leaves out a Hebrew mood the conjugation already says, but keeps the jussive and cohortative", () => {
    // HVqv2ms: imperative / imperative.
    expect(keys(parsing({ language: "hebrew", part_of_speech: "verb", stem: "qal", tense: "imperative", mood: "imperative", person: "2nd", gender: "masculine", number: "singular" }))).not.toContain("mood:imperative");
    // HVqsmsa: passive participle / participle.
    expect(keys(parsing({ language: "hebrew", part_of_speech: "verb", stem: "qal", tense: "passive participle", mood: "participle", gender: "masculine", number: "singular", state: "absolute" }))).toEqual([
      "part_of_speech:verb",
      "stem:qal",
      "tense:passive participle",
      "gender:masculine",
      "number:singular",
      "state:absolute",
    ]);
    // HR/Vqcc: infinitive construct / infinitive.
    expect(keys(parsing({ language: "hebrew", part_of_speech: "verb", stem: "qal", tense: "infinitive construct", mood: "infinitive" }))).not.toContain("mood:infinitive");
    // HVqj3ms: imperfect / jussive, and the imperfect is the Hebrew one.
    const jussive = termsFor(parsing({ language: "hebrew", part_of_speech: "verb", stem: "qal", tense: "imperfect", mood: "jussive", person: "3rd", gender: "masculine", number: "singular" }));
    expect(jussive.map((t) => t.key).slice(0, 4)).toEqual(["part_of_speech:verb", "stem:qal", "tense:imperfect", "mood:jussive"]);
    expect(jussive[2].term).toBe("Imperfect (yiqtol)");
    // A Greek imperfect stays Greek.
    expect(termsFor(parsing({ language: "greek", part_of_speech: "verb", tense: "imperfect" }))[1].term).toBe("Imperfect");
  });

  it("reads a Hebrew noun's kind, gender, number and state, then its affixes in written order", () => {
    // HC/Rd/Ncbsa, "and in the land"; then HNcmpc/Sp3ms, "his words".
    const land = termsFor(parsing({
      language: "hebrew",
      part_of_speech: "noun",
      kind: "common",
      gender: "common",
      number: "singular",
      state: "absolute",
      affixes: [
        { role: "prefix", description: "conjunction" },
        { role: "prefix", description: "preposition" },
        { role: "prefix", description: "article" },
      ],
    }));
    expect(land.map((t) => t.key)).toEqual([
      "part_of_speech:noun",
      "kind:common",
      "gender:common",
      "number:singular",
      "state:absolute",
      "affix:conjunction",
      "affix:preposition",
      "affix:article",
    ]);
    expect(land[1].term).toBe("Common noun");
    expect(land[2].term).toBe("Common (either gender)");
    const words = termsFor(parsing({
      language: "hebrew",
      part_of_speech: "noun",
      kind: "common",
      gender: "masculine",
      number: "plural",
      state: "construct",
      affixes: [{ role: "suffix", description: "pronominal suffix, 3rd person masculine singular" }],
    }));
    expect(words[words.length - 1]).toMatchObject({
      field: "affix",
      role: "suffix",
      key: "affix:pronominal suffix",
      value: "pronominal suffix, 3rd person masculine singular",
      term: "Pronoun suffix",
    });
  });

  it("gives each entry once and skips values with no entry", () => {
    const twice = parsing({
      language: "hebrew",
      part_of_speech: "preposition",
      kind: "no such kind",
      affixes: [
        { role: "prefix", description: "preposition" },
        { role: "prefix", description: "preposition" },
      ],
    });
    expect(keys(twice)).toEqual(["part_of_speech:preposition", "affix:preposition"]);
    expect(termsFor(null)).toEqual([]);
    expect(termsFor(undefined)).toEqual([]);
  });
});
