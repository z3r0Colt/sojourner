import { describe, expect, it } from "vitest";
import type { MorphParsing } from "../../api/types";
import {
  affixRows,
  codedAsNote,
  compactAffix,
  compactParsingLabel,
  compactParsingPieces,
  displayForm,
  langFor,
  parsingSentence,
  shortParsingLabel,
  shortParsingPieces,
  wordTermRows,
} from "./parsingDisplay";

/** A parsing as morph.rs would give it for the code named beside each use;
 *  the fields and descriptions are the ones its own tests assert. */
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

// V-AAM-2S
const COMMAND = parsing({
  language: "greek",
  part_of_speech: "verb",
  tense: "aorist",
  voice: "active",
  mood: "imperative",
  person: "2nd",
  number: "singular",
  description: "verb, aorist active imperative, 2nd person singular",
});
// Hc/Vqw3ms, "and he said"
const AND_HE_SAID = parsing({
  language: "hebrew",
  part_of_speech: "verb",
  stem: "qal",
  tense: "sequential imperfect",
  mood: "indicative",
  person: "3rd",
  gender: "masculine",
  number: "singular",
  description: "verb, qal sequential imperfect, 3rd person masculine singular",
  affixes: [{ role: "prefix", description: "sequential conjunction" }],
});
// HNcmpc/Sp3ms, "his words"
const HIS_WORDS = parsing({
  language: "hebrew",
  part_of_speech: "noun",
  kind: "common",
  gender: "masculine",
  number: "plural",
  state: "construct",
  description: "noun, masculine plural construct",
  affixes: [{ role: "suffix", description: "pronominal suffix, 3rd person masculine singular" }],
});

// S-1SAPF, John 14:15's τὰς ἐντολὰς τὰς ἐμὰς, "my commandments"
const MY_COMMANDMENTS = parsing({
  language: "greek",
  part_of_speech: "pronoun",
  kind: "possessive",
  person: "1st",
  possessor_number: "singular",
  case: "accusative",
  gender: "feminine",
  number: "plural",
  description: "pronoun, possessive, 1st person singular possessor, accusative feminine plural",
});

describe("compactParsingLabel", () => {
  it("gives a Greek verb its name and form in full and its endings short", () => {
    expect(compactParsingLabel(COMMAND)).toBe("Verb · aorist active imperative · 2nd sg");
    // V-PAP-NSM: the participle is a mood in Greek, and said.
    expect(
      compactParsingLabel(
        parsing({ language: "greek", part_of_speech: "verb", tense: "present", voice: "active", mood: "participle", case: "nominative", gender: "masculine", number: "singular" }),
      ),
    ).toBe("Verb · present active participle · nom masc sg");
  });

  it("shortens case, gender and number on a noun, and says nothing of a verb form it lacks", () => {
    // N-GSF
    expect(compactParsingLabel(parsing({ language: "greek", part_of_speech: "noun", case: "genitive", gender: "feminine", number: "singular" }))).toBe("Noun · gen fem sg");
    // T-ASM
    expect(compactParsingLabel(parsing({ language: "greek", part_of_speech: "article", case: "accusative", gender: "masculine", number: "singular" }))).toBe("Article · acc masc sg");
  });

  it("puts a pronoun's or particle's kind before it, and a name's after it", () => {
    // P-1GS
    expect(compactParsingLabel(parsing({ language: "greek", part_of_speech: "pronoun", kind: "personal", person: "1st", case: "genitive", number: "singular" }))).toBe(
      "Personal pronoun · 1st gen sg",
    );
    // PRT-N
    expect(compactParsingLabel(parsing({ language: "greek", part_of_speech: "particle", kind: "negative", description: "particle, negative" }))).toBe("Negative particle");
    // N-GSM-P
    expect(compactParsingLabel(parsing({ language: "greek", part_of_speech: "noun", kind: "personal name", case: "genitive", gender: "masculine", number: "singular" }))).toBe(
      "Noun (personal name) · gen masc sg",
    );
    // V-AAM-2S-ARAM, Mark 5:41's κουμ: the language is a proper noun.
    expect(compactParsingLabel({ ...COMMAND, kind: "transliterated from aramaic" })).toBe("Verb (transliterated from Aramaic) · aorist active imperative · 2nd sg");
    // HTo
    expect(compactParsingLabel(parsing({ language: "hebrew", part_of_speech: "particle", kind: "direct object marker" }))).toBe("Particle (direct object marker)");
  });

  it("gives a Greek possessive's possessor apart from the endings it shares with the thing possessed", () => {
    // S-1SAPF, John 14:15's τὰς ἐμὰς: "my" commandments, not "our".
    expect(compactParsingLabel(MY_COMMANDMENTS)).toBe("Possessive pronoun · 1st sg possessor · acc fem pl");
    // S-1PNSF, 1 John 1:3's ἡ ἡμετέρα: "our" fellowship, not "my".
    expect(compactParsingLabel({ ...MY_COMMANDMENTS, case: "nominative", number: "singular", possessor_number: "plural" })).toBe(
      "Possessive pronoun · 1st pl possessor · nom fem sg",
    );
    // Two pieces, so a label that wraps breaks between the possessor and the
    // thing possessed rather than inside either.
    expect(compactParsingPieces(MY_COMMANDMENTS).map((p) => [p.text, p.part])).toEqual([
      ["Possessive pronoun", "head"],
      ["1st sg possessor", "endings"],
      ["acc fem pl", "endings"],
    ]);
  });

  it("leaves a Hebrew noun's plain 'common' unsaid, as the description does, but not its common gender", () => {
    // HNcbsc, אֶרֶץ: "Noun · common sg constr" read as a common noun.
    expect(compactParsingLabel(parsing({ language: "hebrew", part_of_speech: "noun", kind: "common", gender: "common", number: "singular", state: "construct" }))).toBe(
      "Noun · common gender sg constr",
    );
    // After a person the grammars' "3rd common pl" cannot be misread.
    expect(
      compactParsingLabel(parsing({ language: "hebrew", part_of_speech: "verb", stem: "qal", tense: "perfect", person: "3rd", gender: "common", number: "plural" })),
    ).toBe("Verb · qal perfect · 3rd common pl");
  });

  it("gives a Hebrew verb its stem and conjugation, and no mood the conjugation already says", () => {
    expect(compactParsingLabel(AND_HE_SAID)).toBe("and + Verb · qal sequential imperfect · 3rd masc sg");
    // HVqv2ms: imperative / imperative.
    expect(
      compactParsingLabel(parsing({ language: "hebrew", part_of_speech: "verb", stem: "qal", tense: "imperative", mood: "imperative", person: "2nd", gender: "masculine", number: "singular" })),
    ).toBe("Verb · qal imperative · 2nd masc sg");
    // HVqj3ms: the jussive is more than the imperfect says.
    expect(
      compactParsingLabel(parsing({ language: "hebrew", part_of_speech: "verb", stem: "qal", tense: "imperfect", mood: "jussive", person: "3rd", gender: "masculine", number: "singular" })),
    ).toBe("Verb · qal imperfect jussive · 3rd masc sg");
  });

  it("stands a Hebrew word's prefixes before it and its suffixes after, in written order", () => {
    // HC/Rd/Ncbsa, "and in the land"
    expect(
      compactParsingLabel(
        parsing({
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
        }),
      ),
    ).toBe("and + prep + the + Noun · common gender sg abs");
    expect(compactParsingLabel(HIS_WORDS)).toBe("Noun · masc pl constr + suffix 3rd masc sg");
    // AC/Ncbsd/Ta, Jer 10:11's "the earth": the Aramaic article is an ending.
    expect(
      compactParsingLabel(
        parsing({
          language: "aramaic",
          part_of_speech: "noun",
          kind: "common",
          gender: "common",
          number: "singular",
          state: "determined",
          affixes: [
            { role: "prefix", description: "conjunction" },
            { role: "suffix", description: "article" },
          ],
        }),
      ),
    ).toBe("and + Noun · common gender sg det + the");
  });

  it("adds the further words a code writes as one, by their part of speech", () => {
    // P-1NS + G2532=CONJ, κἀγώ
    expect(
      compactParsingLabel(
        parsing({
          language: "greek",
          part_of_speech: "pronoun",
          kind: "personal",
          person: "1st",
          case: "nominative",
          number: "singular",
          description: "pronoun, personal, 1st person nominative singular + conjunction",
        }),
      ),
    ).toBe("Personal pronoun · 1st nom sg + conjunction");
    // HVqi2fs//Rd/Sp1bs, Ruth 3:5's Qere
    expect(
      compactParsingLabel(
        parsing({
          language: "hebrew",
          part_of_speech: "verb",
          stem: "qal",
          tense: "imperfect",
          mood: "indicative",
          person: "2nd",
          gender: "feminine",
          number: "singular",
          description: "verb, qal imperfect, 2nd person feminine singular + preposition, with pronominal suffix, 1st person common singular",
        }),
      ),
    ).toBe("Verb · qal imperfect · 2nd fem sg + preposition");
  });

  it("falls back on the description when the fields are empty, and gives nothing for no parsing", () => {
    expect(compactParsingLabel(parsing({ language: "greek", description: "foreign word" }))).toBe("Foreign word");
    expect(compactParsingLabel(null)).toBe("");
    expect(compactParsingPieces(undefined)).toEqual([]);
  });
});

describe("compactParsingPieces", () => {
  it("joins the parts of one word with · and what is written on to it with +, and says which part each is", () => {
    expect(compactParsingPieces(HIS_WORDS)).toEqual([
      { text: "Noun", joiner: null, part: "head" },
      { text: "masc pl constr", joiner: "·", part: "endings" },
      { text: "suffix 3rd masc sg", joiner: "+", part: "suffix" },
    ]);
    expect(compactParsingPieces(AND_HE_SAID).map((p) => [p.joiner, p.part])).toEqual([
      [null, "prefix"],
      ["+", "head"],
      ["·", "form"],
      ["·", "endings"],
    ]);
  });
});

describe("shortParsingLabel", () => {
  it("writes a verb's form and its endings as the grammars abbreviate them, keeping the word's name", () => {
    expect(shortParsingLabel(COMMAND)).toBe("Verb · aor act impv · 2nd sg");
    expect(
      shortParsingLabel(
        parsing({ language: "greek", part_of_speech: "verb", tense: "present", voice: "middle or passive deponent", mood: "indicative", person: "3rd", number: "singular" }),
      ),
    ).toBe("Verb · pres mid/pass dep ind · 3rd sg");
    expect(
      shortParsingLabel(
        parsing({ language: "greek", part_of_speech: "verb", tense: "present", voice: "active", mood: "participle", case: "nominative", gender: "masculine", number: "plural" }),
      ),
    ).toBe("Verb · pres act ptc · nom masc pl");
    // Nouns were short already.
    expect(shortParsingLabel(parsing({ language: "greek", part_of_speech: "noun", case: "dative", gender: "feminine", number: "singular" }))).toBe("Noun · dat fem sg");
  });

  it("shortens a Hebrew verb's form but not its stem, and a suffix to suff", () => {
    expect(shortParsingLabel(AND_HE_SAID)).toBe("and + Verb · qal seq impf · 3rd masc sg");
    expect(shortParsingLabel(HIS_WORDS)).toBe("Noun · masc pl constr + suff 3rd masc sg");
    expect(
      shortParsingLabel(parsing({ language: "hebrew", part_of_speech: "verb", stem: "hiphil", tense: "imperfect", mood: "jussive", person: "3rd", gender: "feminine", number: "singular" })),
    ).toBe("Verb · hiphil impf juss · 3rd fem sg");
    expect(
      shortParsingLabel(parsing({ language: "hebrew", part_of_speech: "verb", stem: "qal", tense: "perfect", person: "1st", gender: "common", number: "singular" })),
    ).toBe("Verb · qal perf · 1st com sg");
  });

  it("keeps the common gender whole where no person comes before it", () => {
    expect(
      shortParsingLabel(parsing({ language: "hebrew", part_of_speech: "noun", kind: "common", gender: "common", number: "singular", state: "construct" })),
    ).toBe("Noun · common gender sg constr");
  });

  it("shortens the kind in brackets after the word's name", () => {
    expect(shortParsingLabel(parsing({ language: "hebrew", part_of_speech: "particle", kind: "direct object marker" }))).toBe("Particle (object marker)");
    expect(shortParsingLabel(parsing({ language: "greek", part_of_speech: "noun", kind: "personal name", case: "genitive", gender: "masculine", number: "singular" }))).toBe(
      "Noun (name) · gen masc sg",
    );
  });

  it("keeps the pieces and their joiners", () => {
    expect(shortParsingPieces(HIS_WORDS).map((p) => [p.joiner, p.part])).toEqual(compactParsingPieces(HIS_WORDS).map((p) => [p.joiner, p.part]));
    expect(shortParsingPieces(null)).toEqual([]);
  });
});

describe("compactAffix", () => {
  it("names each prefix and suffix as it stands beside its word", () => {
    expect(compactAffix({ role: "prefix", description: "preposition" })).toBe("prep");
    expect(compactAffix({ role: "prefix", description: "conjunction" })).toBe("and");
    expect(compactAffix({ role: "prefix", description: "sequential conjunction" })).toBe("and");
    expect(compactAffix({ role: "prefix", description: "interrogative particle" })).toBe("question");
    expect(compactAffix({ role: "prefix", description: "relative particle" })).toBe("which");
    expect(compactAffix({ role: "suffix", description: "pronominal suffix, 1st person common singular" })).toBe("suffix 1st common sg");
    expect(compactAffix({ role: "suffix", description: "directional suffix" })).toBe("toward");
    expect(compactAffix({ role: "suffix", description: "paragogic nun" })).toBe("extra -n");
    // Anything new keeps its own words.
    expect(compactAffix({ role: "suffix", description: "Enclitic Mem" })).toBe("enclitic mem");
  });
});

describe("wordTermRows", () => {
  it("lists the word's own terms in reading order, without its affixes", () => {
    expect(wordTermRows(AND_HE_SAID).map((t) => t.term)).toEqual(["Verb", "Qal", "Sequential imperfect (wayyiqtol)", "Third person", "Masculine", "Singular"]);
    expect(wordTermRows(COMMAND).map((t) => t.key)).toEqual(["part_of_speech:verb", "tense:aorist", "voice:active", "mood:imperative", "person:2nd", "number:singular"]);
  });

  it("gives the Hebrew perfect the Hebrew entry and the Greek perfect the Greek one", () => {
    // HVqp3ms
    const created = parsing({ language: "hebrew", part_of_speech: "verb", stem: "qal", tense: "perfect", person: "3rd", gender: "masculine", number: "singular" });
    expect(wordTermRows(created).find((t) => t.field === "tense")?.term).toBe("Perfect (qatal)");
    // V-RPI-3S, "it is written"
    const written = parsing({ language: "greek", part_of_speech: "verb", tense: "perfect", voice: "passive", mood: "indicative", person: "3rd", number: "singular" });
    expect(wordTermRows(written).find((t) => t.field === "tense")?.term).toBe("Perfect");
  });

  it("says on a possessive's person row that the person is the possessor's, and on no other row", () => {
    const rows = wordTermRows(MY_COMMANDMENTS);
    expect(rows.map((t) => [t.key, t.detail])).toEqual([
      ["part_of_speech:pronoun", null],
      ["kind:possessive", null],
      ["person:1st", "singular possessor"],
      ["case:accusative", null],
      ["gender:feminine", null],
      ["number:plural", null],
    ]);
    expect(wordTermRows(COMMAND).every((t) => t.detail === null)).toBe(true);
  });

  it("gives nothing for no parsing", () => {
    expect(wordTermRows(null)).toEqual([]);
  });
});

describe("affixRows", () => {
  it("gives every prefix and suffix in written order, with the glossary's name, gloss and explanation for its kind", () => {
    const rows = affixRows(HIS_WORDS);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ role: "suffix", term: "Pronoun suffix", detail: "3rd person masculine singular" });
    expect(rows[0].short).toMatch(/pronoun joined to the end/i);
    expect(rows[0].explain).toMatch(/suso/);
    const land = affixRows(
      parsing({
        language: "hebrew",
        affixes: [
          { role: "prefix", description: "conjunction" },
          { role: "prefix", description: "preposition" },
          { role: "prefix", description: "article" },
        ],
      }),
    );
    expect(land.map((r) => [r.role, r.term, r.detail])).toEqual([
      ["prefix", "Prefixed “and”", null],
      ["prefix", "Prefixed preposition", null],
      ["prefix", "The article", null],
    ]);
  });

  it("names the one-letter preposition a word carries, read off the word", () => {
    const withPrefixes = (affixes: { role: "prefix" | "suffix"; description: string }[]) => parsing({ language: "hebrew", affixes });
    // Gen 1:1, בְּרֵאשִׁית, "in the beginning" (HR/Ncfsa).
    const [inThe] = affixRows(withPrefixes([{ role: "prefix", description: "preposition" }]), "בְּרֵאשִׁ֖ית");
    expect(inThe).toMatchObject({ term: "Prefixed preposition", detail: "be- “in, with, by”", short: null });
    expect(inThe.explain).toMatch(/be- \(“in, with, by”\)/);
    // Gen 2:5, בָּאָרֶץ (HRd/Ncfsa): the article it swallowed has no letter.
    expect(
      affixRows(withPrefixes([{ role: "prefix", description: "preposition" }, { role: "prefix", description: "article" }]), "בָ/אָ֔רֶץ").map((r) => r.detail),
    ).toEqual(["be- “in, with, by”", null]);
    // "And to the …" (HC/Rd/...): the "and" is the first letter, the
    // preposition the second.
    expect(
      affixRows(
        withPrefixes([
          { role: "prefix", description: "conjunction" },
          { role: "prefix", description: "preposition" },
          { role: "prefix", description: "article" },
        ]),
        "וְלַמֶּ֫לֶךְ",
      )[1].detail,
    ).toBe("le- “to, for”");
    // מִנֶּגֶד, "from before", and כְּנֶגְדּוֹ, "like before him".
    expect(affixRows(withPrefixes([{ role: "prefix", description: "preposition" }]), "מִ/נֶּ֗גֶד")[0].detail).toBe("mi- “from”");
    expect(affixRows(withPrefixes([{ role: "prefix", description: "preposition" }]), "כְּנֶגְדּֽוֹ")[0].detail).toBe("ke- “like, as”");
    // A letter that is none of the four, or no word, says nothing of which.
    const unsure = affixRows(withPrefixes([{ role: "prefix", description: "preposition" }]), "עַל")[0];
    expect(unsure).toMatchObject({ detail: null, short: expect.stringMatching(/one-letter/) });
    expect(affixRows(withPrefixes([{ role: "prefix", description: "preposition" }]))[0].detail).toBeNull();
  });

  it("keeps two affixes of one kind as two rows", () => {
    const rows = affixRows(
      parsing({
        language: "hebrew",
        affixes: [
          { role: "prefix", description: "preposition" },
          { role: "prefix", description: "preposition" },
        ],
      }),
    );
    expect(rows).toHaveLength(2);
  });

  it("lists an affix the glossary has no entry for by its description, with nothing to open", () => {
    expect(affixRows(parsing({ language: "hebrew", affixes: [{ role: "suffix", description: "enclitic mem, archaic" }] }))).toEqual([
      { role: "suffix", term: "Enclitic mem, archaic", detail: null, short: null, explain: null },
    ]);
    expect(affixRows(null)).toEqual([]);
  });
});

describe("parsingSentence, displayForm and langFor", () => {
  it("starts the description as a sentence", () => {
    expect(parsingSentence(COMMAND)).toBe("Verb, aorist active imperative, 2nd person singular");
  });

  it("takes the tagged text's punctuation off a word, but not its elision mark or maqaf", () => {
    expect(displayForm({ original_word: "κόσμον," })).toBe("κόσμον");
    expect(displayForm({ original_word: "αἰώνιον." })).toBe("αἰώνιον");
    expect(displayForm({ original_word: "ἀλλ᾽" })).toBe("ἀλλ᾽");
    expect(displayForm({ original_word: "הָאָֽרֶץ׃" })).toBe("הָאָֽרֶץ");
    expect(displayForm({ original_word: "עַל־" })).toBe("עַל־");
  });

  it("takes off the Greek text's own colon and question mark, and the brackets round a doubted passage", () => {
    // Acts 1:4 and 1:6: the ano teleia (U+0387) and the Greek question mark
    // (U+037E), not the middle dot and semicolon.
    expect(displayForm({ original_word: "μου·" })).toBe("μου");
    expect(displayForm({ original_word: "Ἰσραήλ;" })).toBe("Ἰσραήλ");
    expect(displayForm({ original_word: "ἀμήν.]]" })).toBe("ἀμήν");
    expect(displayForm({ original_word: "[[Ἀναστὰς" })).toBe("Ἀναστὰς");
  });

  it("marks each language's words for its font and screen readers", () => {
    expect(langFor(COMMAND)).toBe("el");
    expect(langFor(AND_HE_SAID)).toBe("he");
    expect(langFor(parsing({ language: "aramaic" }))).toBe("arc");
    expect(langFor(null)).toBeUndefined();
  });
});

describe("codedAsNote", () => {
  it("says what the code calls a word read otherwise, and that the parsing reads it as it is used", () => {
    // Gen 1:4's כִּי, "that it was good", coded "HTc".
    const ki = parsing({ language: "hebrew", part_of_speech: "conjunction", description: "conjunction", coded_as: "a conditional particle" });
    expect(codedAsNote(ki)).toBe("The code calls it a conditional particle; the parsing reads the word as it is used here.");
    // Gen 1:31's מְאֹד, "very", coded "HAcmsa", and the parsing is still "Adverb".
    const very = parsing({ language: "hebrew", part_of_speech: "adverb", description: "adverb", coded_as: "a cardinal number" });
    expect(codedAsNote(very)).toContain("a cardinal number");
    expect(compactParsingLabel(very)).toBe("Adverb");
  });

  it("says nothing of a word read as its code says", () => {
    expect(codedAsNote(COMMAND)).toBeNull();
    expect(codedAsNote(parsing({ language: "hebrew", coded_as: null }))).toBeNull();
    expect(codedAsNote(parsing({ language: "hebrew", coded_as: " " }))).toBeNull();
    expect(codedAsNote(null)).toBeNull();
  });
});
