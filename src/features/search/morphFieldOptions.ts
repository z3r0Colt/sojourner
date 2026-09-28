/**
 * The grammar search's dropdowns: the values each field offers, in what
 * order, and under what name.
 *
 * The values come from content.db (`get_morph_field_values`): every value
 * `morph.rs` read out of the shipped parsing codes, so the form offers only
 * what there is to find, and offers the decoder's current words -- "common"
 * gender, the jussive as a mood -- as soon as content.db is rebuilt, with no
 * list here to fall behind. What the database cannot give is the order a
 * reader expects. It sorts them alphabetically, which puts the accusative
 * before the nominative, the aorist before the present, and the conjunctive
 * imperfect first among the Hebrew conjugations. The lists below give the
 * grammars' order instead; a value they do not name (one the decoder learns
 * later) goes after them, alphabetically, rather than being lost.
 *
 * Each value is shown under its name in the parsing glossary ("Sequential
 * imperfect (wayyiqtol)") with the glossary's one-line gloss as its tooltip:
 * the same words the interlinear's parsing uses, so a reader who met
 * "wayyiqtol" beside a word finds it here by that name. The option's value
 * stays the decoder's, which is what the search matches.
 */
import { lookupTerm, type GlossaryField } from "../lexicon/parsingGlossary";

/** A parsing field the grammar search asks about. */
export type MorphSearchField = Exclude<GlossaryField, "affix">;

/** The grammar search's two languages; "hebrew" takes in the Aramaic of
 *  Ezra, Daniel and Jeremiah 10:11. */
export type MorphSearchLanguage = "greek" | "hebrew";

/**
 * Each field's values in the grammars' order. Tense is Greek here; the
 * Hebrew verb's conjugations have an order of their own (below), since the
 * perfect and imperfect lead there and are not the Greek tenses of the same
 * names. The stems list every one the tagging uses more than a handful of
 * times, the Hebrew and then the Aramaic, each in the order the grammars
 * teach them; the rarer stems (polel, pilpel, ishtaphel...) follow
 * alphabetically, and the test names each one that may.
 */
export const FIELD_VALUE_ORDER: Record<MorphSearchField, readonly string[]> = {
  part_of_speech: [
    "verb", "noun", "adjective", "article", "pronoun", "adverb", "preposition", "conjunction",
    "particle", "interjection", "foreign word",
  ],
  kind: [
    // What a noun names.
    "common", "personal name", "place name", "title", "proper name", "proper name, indeclinable",
    "gentilic", "letter", "indeclinable",
    // Numbers and degree.
    "cardinal number", "ordinal number", "numeral, indeclinable", "comparative", "superlative",
    // Pronouns.
    "personal", "demonstrative", "relative", "interrogative", "indefinite", "reflexive",
    "reciprocal", "possessive", "correlative", "correlative or interrogative",
    // Particles.
    "definite article", "direct object marker", "negative", "conditional", "existence",
    "affirmation", "exhortation", "interjection",
    // Words carried into the Greek from Hebrew or Aramaic.
    "transliterated from hebrew", "transliterated from aramaic",
  ],
  stem: [
    // The hishtaphel is one verb, הִשְׁתַּחֲוָה, "bow down, worship" (H7812),
    // but 131 words: the most of any Hebrew stem after the seven before it.
    "qal", "niphal", "piel", "pual", "hithpael", "hiphil", "hophal", "qal passive", "hishtaphel",
    "peal", "peil", "pael", "hithpeel", "hithpaal", "haphel", "aphel", "shaphel",
  ],
  tense: ["present", "imperfect", "future", "aorist", "perfect", "pluperfect"],
  voice: [
    "active", "middle", "passive", "middle or passive", "middle deponent", "passive deponent",
    "middle or passive deponent",
  ],
  mood: ["indicative", "subjunctive", "optative", "imperative", "jussive", "cohortative", "infinitive", "participle"],
  person: ["1st", "2nd", "3rd"],
  case: ["nominative", "genitive", "dative", "accusative", "vocative"],
  gender: ["masculine", "feminine", "neuter", "common"],
  number: ["singular", "plural", "dual"],
  state: ["absolute", "construct", "determined"],
};

/** The Hebrew and Aramaic verb's conjugations: the perfect and its
 *  sequential form, the imperfect and its two forms after "and", then the
 *  command and the forms that are not finite. */
export const HEBREW_TENSE_ORDER: readonly string[] = [
  "perfect", "sequential perfect", "imperfect", "sequential imperfect", "conjunctive imperfect",
  "imperative", "infinitive construct", "infinitive absolute", "participle", "passive participle",
];

/** The order a field's values are offered in, for one language. */
export function valueOrder(field: MorphSearchField, language: MorphSearchLanguage): readonly string[] {
  return field === "tense" && language === "hebrew" ? HEBREW_TENSE_ORDER : FIELD_VALUE_ORDER[field];
}

/**
 * Values a field is not offered with in one language, because another field
 * already offers the same words. A Hebrew verb's mood follows from its
 * conjugation, and the imperative is a conjugation: "Mood: Imperative" found
 * exactly the 4,304 words "Tense: Imperative" did, and a reader offered both
 * looked for the difference. (The participle and infinitive moods stay: each
 * takes in both of its conjugations, and the glossary's Hebrew entries for
 * them say so.)
 */
const NOT_OFFERED: Record<MorphSearchLanguage, Partial<Record<MorphSearchField, readonly string[]>>> = {
  greek: {},
  hebrew: { mood: ["imperative"] },
};

export interface MorphFieldOption {
  /** The decoder's value, which the search matches: "sequential imperfect". */
  value: string;
  /** Its glossary name, "Sequential imperfect (wayyiqtol)", or the value
   *  itself where the glossary has none. */
  label: string;
  /** The glossary's one-line gloss, for a tooltip, where it has one. */
  title?: string;
}

/**
 * A field's values as the form offers them: in the grammars' order (see
 * FIELD_VALUE_ORDER), any the order does not name after the rest
 * alphabetically, each once, under its glossary name.
 */
export function morphFieldOptions(
  field: MorphSearchField,
  values: readonly string[],
  language: MorphSearchLanguage,
): MorphFieldOption[] {
  const order = valueOrder(field, language);
  const rank = (v: string) => {
    const i = order.indexOf(v);
    return i < 0 ? order.length : i;
  };
  const leftOut = NOT_OFFERED[language][field] ?? [];
  const sorted = [...new Set(values)].filter((v) => !leftOut.includes(v)).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  return sorted.map((value) => {
    const entry = lookupTerm(field, value, language);
    return entry ? { value, label: entry.term, title: entry.short } : { value, label: value };
  });
}

/**
 * The search the empty form gives as an example, in each language's own
 * terms and books: the Hebrew form once offered "tense aorist and mood
 * imperative, in Ephesians", a tense Hebrew does not have in a book outside
 * its Testament. The fields are named as the form names them, and each
 * example finds something: seven words in six verses of Ephesians, and the
 * Psalms' piel commands ("praise ye", "sing praises").
 */
export const SEARCH_EXAMPLES: Record<MorphSearchLanguage, { fields: Partial<Record<MorphSearchField, string>>; book: string }> = {
  greek: { fields: { tense: "aorist", mood: "imperative" }, book: "Ephesians" },
  hebrew: { fields: { stem: "piel", tense: "imperative" }, book: "Psalms" },
};

/** The example as the form says it: "stem piel and tense imperative, in Psalms". */
export function searchExample(language: MorphSearchLanguage): string {
  const { fields, book } = SEARCH_EXAMPLES[language];
  const asked = Object.entries(fields).map(([field, value]) => `${field.replace(/_/g, " ")} ${value}`);
  return `${asked.join(" and ")}, in ${book}`;
}
