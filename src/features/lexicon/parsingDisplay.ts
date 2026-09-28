/**
 * A word's parsing as the reading views show it: a compact label under the
 * word in the interlinear, and the rows of the Parsing section in the
 * Strong's card.
 *
 * `morph.rs` has already read the code into plain field values and a
 * description ("verb, aorist active imperative, 2nd person singular"), and
 * the glossary (parsingGlossary.ts) says what each value means. What is left
 * is layout. The description is too long to stand under every word of a
 * verse, and the code it replaces ("V-AAM-2S") says nothing to most readers,
 * so the interlinear gets something between the two, in the manner of the
 * Blue Letter Bible's parsing line: the kind of word in full, the verb's form
 * in full, and only the endings a reader meets on every other word
 * shortened -- "Verb · aorist active imperative · 2nd sg", "Noun · gen fem
 * sg". A Hebrew word's prefixes and suffixes stand either side of it, as they
 * are written on it: "and + Verb · qal sequential imperfect · 3rd masc sg",
 * "Noun · masc sg constr + suffix 3rd masc sg". The whole description, the
 * code, and what every term means stay a hover or a click away.
 */
import type { MorphAffix, MorphologyWord, MorphParsing } from "../../api/types";
import { lookupTerm, termsFor, type ParsingTerm } from "./parsingGlossary";

/** One piece of a compact parsing label, and what joins it to the piece
 *  before: "·" between the parts of one word, "+" between a word and a
 *  prefix, suffix or further word written on to it, null for the first. */
export interface CompactPiece {
  text: string;
  joiner: "·" | "+" | null;
  /** What the piece is: a prefix; the word's name ("Verb"), its form
   *  ("aorist active imperative") or its endings ("2nd sg"); a suffix; or a
   *  further word written as one with it. */
  part: "prefix" | "head" | "form" | "endings" | "suffix" | "further";
}

/** The endings a reader meets on nearly every word, shortened the way the
 *  grammars shorten them. Anything not here is left as it is. */
const SHORT_FORMS: Record<string, string> = {
  nominative: "nom",
  genitive: "gen",
  dative: "dat",
  accusative: "acc",
  vocative: "voc",
  masculine: "masc",
  feminine: "fem",
  neuter: "neut",
  singular: "sg",
  plural: "pl",
  absolute: "abs",
  construct: "constr",
  determined: "det",
};

/** How a prefix or suffix is named beside the word it is written on. The
 *  ones whose meaning never changes are given it ("and", "the", "which");
 *  a preposition may mean in, to, like or from, so it is only "prep". */
const AFFIX_SHORT: Record<string, string> = {
  preposition: "prep",
  conjunction: "and",
  // The verb it opens already says "sequential".
  "sequential conjunction": "and",
  article: "the",
  "interrogative particle": "question",
  "relative particle": "which",
  "pronominal suffix": "suffix",
  "directional suffix": "toward",
  "paragogic he": "extra -ah",
  "paragogic nun": "extra -n",
};

/**
 * Kinds that read as a word placed before the part of speech: a "personal
 * pronoun", a "negative particle", a "comparative adjective". The rest --
 * names, titles, numbers, the object marker -- follow it in brackets, "Noun
 * (place name)", which reads better than "place name noun".
 */
const KINDS_BEFORE = new Set([
  "personal",
  "relative",
  "reciprocal",
  "demonstrative",
  "correlative",
  "interrogative",
  "indefinite",
  "correlative or interrogative",
  "reflexive",
  "possessive",
  "conditional",
  "negative",
  "comparative",
  "superlative",
  "gentilic",
]);

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The values come lower case from morph.rs; the two language names in them
 *  ("transliterated from aramaic") are proper nouns. */
function properCase(s: string): string {
  return s.replace(/\b(hebrew|aramaic|greek)\b/g, (m) => capitalise(m));
}

/** "3rd person masculine singular" as "3rd masc sg". */
function shorten(phrase: string): string {
  return phrase
    .split(/\s+/)
    .filter((w) => w && w !== "person")
    .map((w) => SHORT_FORMS[w] ?? w)
    .join(" ");
}

/**
 * Whether the parsing's mood would only repeat what its tense already says --
 * the rule `describe()` in morph.rs and `termsFor` both apply: no
 * "participle participle", and no Hebrew "indicative", which is every finite
 * verb that is not a command or a wish.
 */
function moodIsSaid(parsing: MorphParsing): boolean {
  const mood = parsing.mood?.trim().toLowerCase();
  if (!mood) return false;
  if (parsing.tense?.toLowerCase().includes(mood)) return false;
  return parsing.language === "greek" || mood !== "indicative";
}

/** What the word is: "Verb", "Personal pronoun", "Noun (place name)". A
 *  Hebrew noun's "common" goes unsaid, as in the description: it is what a
 *  noun is unless it is a name. */
function headOf(parsing: MorphParsing): string | null {
  const pos = parsing.part_of_speech;
  const kind = parsing.kind && !(parsing.language !== "greek" && pos === "noun" && parsing.kind === "common") ? parsing.kind : null;
  if (!pos) return kind ? capitalise(properCase(kind)) : null;
  if (!kind) return capitalise(pos);
  if (KINDS_BEFORE.has(kind)) return capitalise(`${kind} ${pos}`);
  return `${capitalise(pos)} (${properCase(kind)})`;
}

/** A verb's form in full: "aorist active imperative", "qal sequential imperfect". */
function formOf(parsing: MorphParsing): string | null {
  const parts = [parsing.stem, parsing.tense, parsing.voice, moodIsSaid(parsing) ? parsing.mood : null].filter((p): p is string => !!p);
  return parts.length > 0 ? parts.join(" ") : null;
}

/** A Greek possessive's possessor, short: "1st sg possessor" for ἐμός,
 *  "my". Its person and possessor_number are the possessor's; its case,
 *  gender and number, which follow as the endings, are the thing's. Run
 *  together as "1st acc pl fem", τὰς ἐμὰς ("my", of commandments) read as
 *  "our". */
function possessorOf(parsing: MorphParsing): string | null {
  if (!parsing.person || !parsing.possessor_number) return null;
  return `${shorten(`${parsing.person} ${parsing.possessor_number}`)} possessor`;
}

/** Person, case, gender, number and state, shortened: "2nd sg", "gen fem sg".
 *  A possessive's person is its possessor's, and goes with that instead.
 *  The common gender says it is a gender unless a person comes first, as
 *  morph.rs's description does: "Noun · common sg abs" read as a common
 *  noun, where "3rd common pl" is the grammars' own shorthand. */
function endingsOf(parsing: MorphParsing): string | null {
  const person = possessorOf(parsing) ? null : parsing.person;
  const gender = parsing.gender === "common" && !parsing.person ? "common gender" : parsing.gender;
  const parts = [person, parsing.case, gender, parsing.number, parsing.state].filter((p): p is string => !!p);
  return parts.length > 0 ? shorten(parts.join(" ")) : null;
}

/** A prefix or suffix as it stands beside its word: "and", "prep",
 *  "suffix 3rd masc sg". */
export function compactAffix(affix: MorphAffix): string {
  const description = affix.description.trim().toLowerCase();
  const comma = description.indexOf(",");
  const kind = comma > 0 ? description.slice(0, comma).trim() : description;
  const detail = comma > 0 ? shorten(description.slice(comma + 1).trim()) : "";
  const name = AFFIX_SHORT[kind] ?? kind;
  return detail ? `${name} ${detail}` : name;
}

/**
 * The further words a code writes as one with this word (κἀγώ is "I" and
 * "and"; a Qere can be two words), each by its part of speech alone: the
 * parsing's fields are the first word's, and the description gives the rest
 * after " + ".
 */
function furtherWords(parsing: MorphParsing): string[] {
  return parsing.description
    .split(" + ")
    .slice(1)
    .map((part) => part.split(",")[0].trim())
    .filter(Boolean);
}

/**
 * The compact label as pieces, for the interlinear to lay out (each piece
 * kept whole where the line breaks). A parsing with nothing to show -- no
 * fields and no description -- has no pieces.
 */
export function compactParsingPieces(parsing: MorphParsing | null | undefined): CompactPiece[] {
  if (!parsing) return [];
  const pieces: CompactPiece[] = [];
  const push = (text: string | null, joiner: "·" | "+", part: CompactPiece["part"]) => {
    if (!text) return;
    pieces.push({ text, joiner: pieces.length === 0 ? null : joiner, part });
  };
  const affixes = parsing.affixes ?? [];
  for (const a of affixes) if (a.role === "prefix") push(compactAffix(a), "+", "prefix");
  const wordStart = pieces.length;
  // The first piece of the word itself joins the prefixes with "+"; the
  // rest of the word joins its own first piece with "·".
  const joinWord = () => (pieces.length === wordStart ? "+" : "·");
  push(headOf(parsing), joinWord(), "head");
  push(formOf(parsing), joinWord(), "form");
  push(possessorOf(parsing), joinWord(), "endings");
  push(endingsOf(parsing), joinWord(), "endings");
  if (pieces.length === wordStart) {
    // Nothing in the fields (a code morph.rs could only describe): the
    // first part of the description stands for the word.
    push(capitalise(parsing.description.split(" + ")[0].trim()), "+", "head");
  }
  for (const a of affixes) if (a.role === "suffix") push(compactAffix(a), "+", "suffix");
  for (const w of furtherWords(parsing)) push(w, "+", "further");
  return pieces;
}

/** The compact label as one line: "and + Verb · qal perfect · 3rd masc sg". */
export function compactParsingLabel(parsing: MorphParsing | null | undefined): string {
  return compactParsingPieces(parsing)
    .map((p) => (p.joiner ? ` ${p.joiner} ${p.text}` : p.text))
    .join("");
}

/** The description as a sentence starts: "Verb, aorist active imperative, …". */
export function parsingSentence(parsing: MorphParsing): string {
  return capitalise(parsing.description.trim());
}

/**
 * What to say beside the code of a word read otherwise than its code: the
 * code stays on show beside the parsing, and for the twenty-odd words
 * morph.rs reads by what they are ("RETAGGED" there) it names something
 * else. מְאֹד, "very", is coded `HAcmsa`, a number, and was shown "Adverb"
 * beside that code with nothing to say why -- a reader who knew the letters,
 * or looked them up, found the card contradicting itself. So it says so:
 * what the code calls the word, and that the parsing reads the word as it is
 * used. Null for every word read as its code says.
 */
export function codedAsNote(parsing: MorphParsing | null | undefined): string | null {
  const coded = parsing?.coded_as?.trim();
  return coded ? `The code calls it ${coded}; the parsing reads the word as it is used here.` : null;
}

/** A row of the word's own terms, with anything the word adds to the
 *  glossary's entry. */
export interface WordTermRow extends ParsingTerm {
  /** A possessive's person is its possessor's, and the row says whose:
   *  "First person · singular possessor" for ἐμός, "my", where the Plural
   *  row below it is the things possessed. */
  detail: string | null;
}

/**
 * The glossary rows for the word itself -- part of speech, kind, stem,
 * tense, voice, mood, person, case, gender, number, state, in that order,
 * with a mood that only repeats the tense left out -- without its prefixes
 * and suffixes, which `affixRows` lists on their own.
 */
export function wordTermRows(parsing: MorphParsing | null | undefined): WordTermRow[] {
  const possessor = parsing?.possessor_number ? `${parsing.possessor_number} possessor` : null;
  return termsFor(parsing)
    .filter((t) => t.field !== "affix")
    .map((t) => ({ ...t, detail: t.field === "person" ? possessor : null }));
}

/** One prefix or suffix of a Hebrew or Aramaic word, with what the glossary
 *  says of its kind. */
export interface AffixRow {
  role: MorphAffix["role"];
  /** The glossary's name for it ("Pronoun suffix"), or its description when
   *  the glossary has none. */
  term: string;
  /** What the description adds to the kind: "3rd person masculine singular";
   *  for a prefixed preposition, which one it is: "be- “in, with, by”". */
  detail: string | null;
  short: string | null;
  explain: string | null;
}

/** The four prepositions written as one letter on the front of a word, by
 *  that letter. */
const PREFIXED_PREPOSITIONS: Record<string, string> = {
  "ב": "be- “in, with, by”",
  "ל": "le- “to, for”",
  "כ": "ke- “like, as”",
  "מ": "mi- “from”",
};

/**
 * Which of the four one-letter prepositions a word's prefixed preposition
 * is, read off the word itself. The code says only "preposition"; the
 * letter says which. Each prefix is one letter of the word, in the order
 * the affixes list them, but for the article a preposition has swallowed
 * (lammelekh, "to the king"), which the parsing lists after the
 * preposition and the word writes with no letter of its own. A letter that
 * is not one of the four -- a word whose text and parsing do not line up --
 * says nothing, rather than naming the wrong preposition.
 */
function prefixedPreposition(affixes: readonly MorphAffix[], index: number, word: string): string | null {
  const letters = [...word].filter((c) => c >= "א" && c <= "ת");
  let at = 0;
  for (let i = 0; i < index; i++) {
    const a = affixes[i];
    if (a.role !== "prefix") return null;
    const swallowed = a.description === "article" && affixes[i - 1]?.description === "preposition";
    if (!swallowed) at++;
  }
  return PREFIXED_PREPOSITIONS[letters[at] ?? ""] ?? null;
}

/**
 * Every prefix and suffix, in written order, each with the glossary's entry
 * for its kind. Unlike `termsFor`, which names each entry once, two affixes
 * of one kind are two rows: a word's own prefixes are all worth seeing.
 * Given the word as written, a prefixed preposition says which it is, in
 * place of the gloss naming all four.
 */
export function affixRows(parsing: MorphParsing | null | undefined, word?: string | null): AffixRow[] {
  if (!parsing) return [];
  const affixes = parsing.affixes ?? [];
  return affixes.map((a, i) => {
    const entry = lookupTerm("affix", a.description, parsing.language);
    const comma = a.description.indexOf(",");
    const detail = comma > 0 ? a.description.slice(comma + 1).trim() || null : null;
    const which = a.role === "prefix" && a.description === "preposition" && word ? prefixedPreposition(affixes, i, word) : null;
    return {
      role: a.role,
      term: entry?.term ?? capitalise(a.description.trim()),
      detail: which ?? (entry ? detail : null),
      short: which ? null : (entry?.short ?? null),
      explain: entry?.explain ?? null,
    };
  });
}

/** A word as a heading shows it: without the comma, full stop, Greek colon or
 *  question mark, sof pasuq, or the double brackets round a passage some
 *  editions doubt, that the tagged text keeps on it ("κόσμον," is "κόσμον",
 *  "[[Ἀναστὰς" is "Ἀναστὰς"). The Greek text writes its colon and question
 *  mark with their own code points, the ano teleia (U+0387) and U+037E, not
 *  the middle dot and semicolon they look like, so both are named here.
 *  Greek elision's ᾽ and the Hebrew maqaf stay, being part of how the word is
 *  written. */
export function displayForm(word: Pick<MorphologyWord, "original_word">): string {
  return word.original_word
    .trim()
    .replace(/^[[(]+/u, "")
    .replace(/[\s,.;:··;׃\])]+$/u, "");
}

/** The `lang` a word's text is marked with, for its font and for screen readers. */
export function langFor(parsing: MorphParsing | null | undefined): string | undefined {
  if (!parsing) return undefined;
  return parsing.language === "greek" ? "el" : parsing.language === "aramaic" ? "arc" : "he";
}
