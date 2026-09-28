/**
 * The parsing glossary: what each word of a Greek, Hebrew or Aramaic parsing
 * means, for a reader who knows neither language.
 *
 * `morph.rs` reads a parsing code into plain field values -- "aorist",
 * "piel", "construct" -- and the interlinear shows them. That is already
 * better than "V-AAI-3S", but "aorist" still means nothing to most of the
 * church, so every value has an entry here: a display name, a one-line gloss
 * for a tooltip, and a few sentences saying what the form is and, where it
 * matters, what it does and does not imply for reading the verse. The
 * sentences are written to avoid the classic overclaims (the aorist is not
 * "once for all", the piel is not simply "intensive", the wayyiqtol is a
 * narrative form rather than a rule that flips the time).
 *
 * The entries are data, in parsingGlossary.json, keyed "<field>:<value>" with
 * the value exactly as `morph.rs` emits it. Its note gives the sources: the
 * list was checked against STEPBible's TEGMC and TEHMC code tables (CC BY
 * 4.0), the rarer Hebrew stems keep OSHB's names, every verse cited was
 * checked in TAHOT or TAGNT, and the explanations follow the standard
 * grammars (reference/morphology/SOURCES.md has the detail). The
 * backend's own test (`every_code_in_the_reference_files_decodes_and_has_its_glossary_entries`
 * in morph.rs, run with --ignored) decodes every code in the imported TAGNT
 * and TAHOT files and fails if any pair it meets has no entry, and
 * parsingGlossary.test.ts checks every value written into morph.rs, so the
 * two cannot drift apart unnoticed.
 *
 * Two names mean different things in the two languages. The Greek perfect is
 * a present state resulting from a past act ("it is written"); the Hebrew
 * perfect (qatal) views an act as a complete whole, usually past. Likewise
 * the imperfect. The JSON's `hebrew_and_aramaic` block holds the Hebrew
 * readings of such names, and a lookup given the word's language prefers it.
 */
import glossary from "./parsingGlossary.json";
import type { MorphAffix, MorphParsing } from "../../api/types";

/** The parsing fields the glossary explains, plus "affix" for the Hebrew and
 *  Aramaic prefixes and suffixes. */
export type GlossaryField =
  | "part_of_speech"
  | "kind"
  | "stem"
  | "tense"
  | "voice"
  | "mood"
  | "person"
  | "case"
  | "gender"
  | "number"
  | "state"
  | "affix";

export interface GlossaryEntry {
  /** The name to show: "Aorist", "Sequential imperfect (wayyiqtol)". */
  term: string;
  /** A one-line gloss, at most 90 characters, for a tooltip or a chip. */
  short: string;
  /** Two to four plain sentences for a reader who knows no Greek or Hebrew. */
  explain: string;
}

/** One glossary entry as it applies to a particular word's parsing. */
export interface ParsingTerm extends GlossaryEntry {
  field: GlossaryField;
  /** The value as the parsing gives it: "aorist", or for an affix its whole
   *  description, "pronominal suffix, 3rd person masculine singular". */
  value: string;
  /** The key the entry was found under: "tense:aorist", "affix:pronominal suffix". */
  key: string;
  /** For an affix, whether it is written before or after the word. */
  role?: MorphAffix["role"];
}

const TERMS: Record<string, GlossaryEntry> = glossary.terms;
const HEBREW_AND_ARAMAIC: Record<string, GlossaryEntry> = glossary.hebrew_and_aramaic;

/**
 * The fields of a parsing in the order a reader meets them, which is the
 * order `describe()` in morph.rs writes them: what the word is and what kind,
 * then (for a verb) its stem, tense or conjugation, voice and mood, then
 * person, case, gender, number and state. A word's affixes follow.
 */
export const PARSING_FIELD_ORDER = [
  "part_of_speech",
  "kind",
  "stem",
  "tense",
  "voice",
  "mood",
  "person",
  "case",
  "gender",
  "number",
  "state",
] as const satisfies readonly Exclude<GlossaryField, "affix">[];

function normalise(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * The keys an entry for this value may be filed under, most specific first.
 * An affix's description can carry its person, gender and number after a
 * comma ("pronominal suffix, 3rd person masculine singular"); the glossary
 * explains the kind of morpheme once, so the part before the comma is tried
 * after the whole.
 */
function candidateKeys(field: GlossaryField, value: string): string[] {
  const v = normalise(value);
  if (!v) return [];
  const keys = [`${field}:${v}`];
  const comma = v.indexOf(",");
  if (field === "affix" && comma > 0) keys.push(`${field}:${v.slice(0, comma).trim()}`);
  return keys;
}

function entryUnder(key: string, language: MorphParsing["language"] | undefined): GlossaryEntry | undefined {
  if (language === "hebrew" || language === "aramaic") {
    const semitic = HEBREW_AND_ARAMAIC[key];
    if (semitic) return semitic;
  }
  return TERMS[key];
}

function find(
  field: GlossaryField,
  value: string,
  language: MorphParsing["language"] | undefined,
): { key: string; entry: GlossaryEntry } | null {
  for (const key of candidateKeys(field, value)) {
    const entry = entryUnder(key, language);
    if (entry) return { key, entry };
  }
  return null;
}

/**
 * The glossary entry for one field's value, or null when there is none.
 * The value is matched without regard to case or spacing. Give the word's
 * language where it is known: a Hebrew or Aramaic "perfect" is not a Greek
 * one.
 */
export function lookupTerm(
  field: GlossaryField,
  value: string | null | undefined,
  language?: MorphParsing["language"],
): GlossaryEntry | null {
  if (!value) return null;
  return find(field, value, language)?.entry ?? null;
}

/**
 * Whether a parsing's mood would only repeat what its tense already says --
 * the same rule `describe()` applies. A Hebrew verb's mood follows from its
 * conjugation ("imperative" beside the imperative, "participle" beside the
 * passive participle, "infinitive" beside the infinitive construct), and its
 * "indicative" is simply every finite verb that is not a command or a wish.
 * The jussive and cohortative do add something (the tense there is only
 * "imperfect"), and every Greek mood is its own information.
 */
function moodGoesWithoutSaying(parsing: MorphParsing, mood: string): boolean {
  const m = normalise(mood);
  if (parsing.tense && normalise(parsing.tense).includes(m)) return true;
  return parsing.language !== "greek" && m === "indicative";
}

/**
 * The glossary entries for a word's parsing, one per filled field in reading
 * order (see PARSING_FIELD_ORDER) and then one per affix in written order,
 * each entry at most once. A value the glossary has no entry for is left
 * out; the parsing's own `description` still names it.
 */
export function termsFor(parsing: MorphParsing | null | undefined): ParsingTerm[] {
  if (!parsing) return [];
  const terms: ParsingTerm[] = [];
  const seen = new Set<string>();
  const add = (field: GlossaryField, value: string, role?: MorphAffix["role"]) => {
    const found = find(field, value, parsing.language);
    if (!found || seen.has(found.key)) return;
    seen.add(found.key);
    terms.push({ ...found.entry, field, value, key: found.key, ...(role ? { role } : {}) });
  };
  for (const field of PARSING_FIELD_ORDER) {
    const value = parsing[field];
    if (!value) continue;
    if (field === "mood" && moodGoesWithoutSaying(parsing, value)) continue;
    add(field, value);
  }
  for (const affix of parsing.affixes ?? []) add("affix", affix.description, affix.role);
  return terms;
}
