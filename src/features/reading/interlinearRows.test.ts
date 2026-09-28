import { describe, expect, it } from "vitest";
import type { InterlinearWord, MorphologyWord, MorphParsing } from "../../api/types";
import { withoutCantillation } from "../lexicon/originalText";
import { alignVerse } from "./interlinearAlign";
import {
  englishOrderRows,
  isLittleWord,
  originalOrderRows,
  otherNumbers,
  rowNumber,
  rowRoot,
  tableColumnWidths,
  tableGridTemplate,
  untranslatedHomes,
  type InterlinearRow,
} from "./interlinearRows";

function phrases(...rows: [string, string | null][]): InterlinearWord[] {
  return rows.map(([text, strongs_id], i) => ({ id: i + 1, sort_order: i, text, strongs_id }));
}

/** The words of a verse: each its form, its number, and its part of speech
 * (with a pronoun's kind after a colon, "pronoun:personal"), as the app has
 * them from the tagged text. */
function words(...rows: ([string, string | null] | [string, string | null, string])[]): MorphologyWord[] {
  return rows.map(([original_word, strongs_id, part], i) => ({
    id: 100 + i,
    sort_order: i,
    original_word,
    lemma: null,
    morph_code: null,
    strongs_id,
    parsing: part ? parsingOf(part) : null,
  }));
}

function parsingOf(part: string): MorphParsing {
  const [part_of_speech, kind = null] = part.split(":");
  return {
    language: "greek",
    part_of_speech,
    tense: null,
    voice: null,
    mood: null,
    person: null,
    number: null,
    gender: null,
    case: null,
    state: null,
    stem: null,
    kind,
    description: part,
    affixes: [],
  };
}

/** Each row as the table reads it: the English (an arrow on a phrase's
 * later rows in the original's order, a dash for a word no phrase
 * translates), the head's number and the others' after it, and the words
 * in the original's order ("~" before an echo, "+" before a little word
 * set in with the head). */
function read(rows: InterlinearRow[]): string[] {
  return rows.map((r) => {
    const english = r.phrase ? (r.lead ? r.phrase.text : "↑") : "—";
    const numbers = [r.strongs ?? "", ...otherNumbers(r).map((n) => n.strongs)].join(" ");
    const text = r.words.map((w) => (w.echo ? "~" : "") + (w.folded ? "+" : "") + w.word.original_word).join(" ");
    return [english, numbers, text].join(" | ");
  });
}

const rowsOf = (en: InterlinearWord[], gk: MorphologyWord[]) => englishOrderRows(alignVerse(en, gk), gk);

// John 1:1a and 3:16's "should not perish", with a word the KJV supplied
// and an article it leaves out.
const EN = phrases(["In", "G1722"], ["the beginning", "G746"], ["was", "G2258"], ["the Word", "G3056"], ["[it]", null], ["should", "G622"], ["not", "G3361"], ["perish", "G622"]);
const GK = words(["Ἐν", "G1722"], ["ἀρχῇ", "G746"], ["ἦν", "G1510"], ["ὁ", "G3588"], ["λόγος", "G3056"], ["τὸν", "G3588"], ["μὴ", "G3361"], ["ἀπόληται", "G622"]);

// The verses as the app has them: the KJV's phrases with their numbers, the
// tagged text's words with theirs and their parts of speech.
const JOHN_1_1 = {
  en: phrases(["In", "G1722"], ["the beginning", "G746"], ["was", "G2258"], ["the Word", "G3056"], ["and", "G2532"], ["the Word", "G3056"], ["was", "G2258"], ["with", "G4314"], ["God", "G2316"], ["and", "G2532"], ["the Word", "G3056"], ["was", "G2258"], ["God", "G2316"]),
  gk: words(["Ἐν", "G1722", "preposition"], ["ἀρχῇ", "G746", "noun"], ["ἦν", "G1510", "verb"], ["ὁ", "G3588", "article"], ["λόγος,", "G3056", "noun"], ["καὶ", "G2532", "conjunction"], ["ὁ", "G3588", "article"], ["λόγος", "G3056", "noun"], ["ἦν", "G1510", "verb"], ["πρὸς", "G4314", "preposition"], ["τὸν", "G3588", "article"], ["θεόν,", "G2316", "noun"], ["καὶ", "G2532", "conjunction"], ["θεὸς", "G2316", "noun"], ["ἦν", "G1510", "verb"], ["ὁ", "G3588", "article"], ["λόγος.", "G3056", "noun"]),
};
const GENESIS_1_1 = {
  en: phrases(["In the beginning", "H7225"], ["God", "H430"], ["created", "H1254"], ["the heaven", "H8064"], ["and", "H853"], ["the earth", "H776"]),
  gk: words(["בְּרֵאשִׁ֖ית", "H7225", "noun"], ["בָּרָ֣א", "H1254", "verb"], ["אֱלֹהִ֑ים", "H430", "noun"], ["אֵ֥ת", "H853", "particle"], ["הַשָּׁמַ֖יִם", "H8064", "noun"], ["וְאֵ֥ת", "H853", "particle"], ["הָאָֽרֶץ", "H776", "noun"]),
};
const MATTHEW_5_3 = {
  en: phrases(["Blessed", "G3107"], ["are the poor", "G4434"], ["in spirit", "G4151"], ["for", "G3754"], ["theirs", "G846"], ["is", "G2076"], ["the kingdom", "G932"], ["of heaven", "G3772"]),
  gk: words(["Μακάριοι", "G3107", "adjective"], ["οἱ", "G3588", "article"], ["πτωχοὶ", "G4434", "noun"], ["τῷ", "G3588", "article"], ["πνεύματι,", "G4151", "noun"], ["ὅτι", "G3754", "conjunction"], ["αὐτῶν", "G846", "pronoun:personal"], ["ἐστιν", "G1510", "verb"], ["ἡ", "G3588", "article"], ["βασιλεία", "G932", "noun"], ["τῶν", "G3588", "article"], ["οὐρανῶν.", "G3772", "noun"]),
};
const PSALM_23_4 = {
  en: phrases(["Yea though I walk", "H3212"], ["through the valley", "H1516"], ["of the shadow of death", "H6757"], ["I will fear", "H3372"], ["no evil", "H7451"], ["for thou art with me thy rod", "H7626"], ["and thy staff", "H4938"], ["they comfort", "H5162"]),
  gk: words(["גַּ֤ם", "H1571", "adverb"], ["כִּֽי־", "H3588", "conjunction"], ["אֵלֵ֨ךְ", "H1980", "verb"], ["בְּגֵ֪יא", "H1516", "noun"], ["צַלְמָ֡וֶת", "H6757", "noun"], ["לֹא־", "H3808", "particle"], ["אִ֘ירָ֤א", "H3372", "verb"], ["רָ֗ע", "H7451", "adjective"], ["כִּי־", "H3588", "conjunction"], ["אַתָּ֥ה", "H859", "pronoun:personal"], ["עִמָּדִ֑י", "H5978", "preposition"], ["שִׁבְטְךָ֥", "H7626", "noun"], ["וּ֝מִשְׁעַנְתֶּ֗ךָ", "H4938", "noun"], ["הֵ֣מָּה", "H1992", "pronoun:personal"], ["יְנַֽחֲמֻֽנִי", "H5162", "verb"]),
};
const JOHN_3_3 = {
  en: phrases(["Jesus", "G2424"], ["answered", "G611"], ["and", "G2532"], ["said", "G2036"], ["unto him", "G846"], ["Verily", "G281"], ["verily", "G281"], ["I say", "G3004"], ["unto thee", "G4671"], ["Except", "G3362"], ["a man", "G5100"], ["be born", "G1080"], ["again", "G509"], ["he cannot", "G1410"], ["see", "G1492"], ["the kingdom", "G932"], ["of God", "G2316"]),
  gk: words(["Ἀπεκρίθη", "G611", "verb"], ["ὁ", "G3588", "article"], ["Ἰησοῦς", "G2424", "noun"], ["καὶ", "G2532", "conjunction"], ["εἶπεν", "G2036", "verb"], ["αὐτῷ·", "G846", "pronoun:personal"], ["ἀμὴν", "G281", "interjection"], ["ἀμὴν", "G281", "interjection"], ["λέγω", "G3004", "verb"], ["σοι·", "G4771", "pronoun:personal"], ["ἐὰν", "G1437", "conjunction"], ["μή", "G3361", "particle"], ["τις", "G5100", "pronoun:indefinite"], ["γεννηθῇ", "G1080", "verb"], ["ἄνωθεν,", "G509", "adverb"], ["οὐ", "G3756", "particle"], ["δύναται", "G1410", "verb"], ["ἰδεῖν", "G1492", "verb"], ["τὴν", "G3588", "article"], ["βασιλείαν", "G932", "noun"], ["τοῦ", "G3588", "article"], ["θεοῦ.", "G2316", "noun"]),
};

describe("englishOrderRows", () => {
  it("gives each phrase one row, with all its words in the original's order and the head's number first", () => {
    expect(read(rowsOf(EN, GK))).toEqual([
      "In | G1722 | Ἐν",
      "the beginning | G746 | ἀρχῇ",
      // The word's own number, the one its root is of, not the KJV's G2258.
      "was | G1510 | ἦν",
      // The article before λόγος as the Greek has it, λόγος the head.
      "the Word | G3056 G3588 | +ὁ λόγος",
      // Supplied: the English alone.
      "[it] |  | ",
      "should | G622 | ~ἀπόληται",
      // τὸν, untranslated, goes with the word after it.
      "not | G3361 G3588 | +τὸν μὴ",
      "perish | G622 | ἀπόληται",
    ]);
  });

  it("sets out John 1:1 as its thirteen phrases, the article of each λόγος and of θεόν in its row", () => {
    const rows = rowsOf(JOHN_1_1.en, JOHN_1_1.gk);
    expect(read(rows)).toEqual([
      "In | G1722 | Ἐν",
      "the beginning | G746 | ἀρχῇ",
      "was | G1510 | ἦν",
      "the Word | G3056 G3588 | +ὁ λόγος,",
      "and | G2532 | καὶ",
      "the Word | G3056 G3588 | +ὁ λόγος",
      "was | G1510 | ἦν",
      "with | G4314 | πρὸς",
      // τὸν, which the KJV has no "the" for, with the θεόν it marks.
      "God | G2316 G3588 | +τὸν θεόν,",
      "and | G2532 | καὶ",
      "the Word | G3056 G3588 | +ὁ λόγος.",
      "was | G1510 | ἦν",
      "God | G2316 | θεὸς",
    ]);
    expect(rows.map((r) => r.word?.original_word)).toEqual(["Ἐν", "ἀρχῇ", "ἦν", "λόγος,", "καὶ", "λόγος", "ἦν", "πρὸς", "θεόν,", "καὶ", "λόγος.", "ἦν", "θεὸς"]);
    expect(rows.every((r) => r.lead && r.phrase)).toBe(true);
  });

  it("puts the object marker the KJV leaves untranslated with the word it marks: Genesis 1:1's אֵת in \"the heaven\"", () => {
    const rows = rowsOf(GENESIS_1_1.en, GENESIS_1_1.gk);
    expect(read(rows)).toEqual([
      "In the beginning | H7225 | בְּרֵאשִׁ֖ית",
      "God | H430 | אֱלֹהִ֑ים",
      "created | H1254 | בָּרָ֣א",
      "the heaven | H8064 H853 | +אֵ֥ת הַשָּׁמַ֖יִם",
      // The KJV numbers its "and" for the וְאֵת it is written on.
      "and | H853 | וְאֵ֥ת",
      "the earth | H776 | הָאָֽרֶץ",
    ]);
    expect(rows[3].word?.original_word).toBe("הַשָּׁמַ֖יִם");
    expect(rows[3].words.map((w) => w.head)).toEqual([false, true]);
  });

  it("keeps Matthew 5:3's τῷ with πνεύματι, and the τῶν the KJV leaves out with οὐρανῶν", () => {
    expect(read(rowsOf(MATTHEW_5_3.en, MATTHEW_5_3.gk))).toEqual([
      "Blessed | G3107 | Μακάριοι",
      "are the poor | G4434 G3588 | +οἱ πτωχοὶ",
      "in spirit | G4151 G3588 | +τῷ πνεύματι,",
      "for | G3754 | ὅτι",
      "theirs | G846 | αὐτῶν",
      "is | G1510 | ἐστιν",
      "the kingdom | G932 G3588 | +ἡ βασιλεία",
      "of heaven | G3772 G3588 | +τῶν οὐρανῶν.",
    ]);
  });

  it("keeps Psalm 23:4's לֹא with the \"no evil\" the KJV put its \"no\" in, and each little word with its phrase", () => {
    const rows = rowsOf(PSALM_23_4.en, PSALM_23_4.gk);
    expect(read(rows)).toEqual([
      "Yea though I walk | H1980 H1571 H3588 | +גַּ֤ם +כִּֽי־ אֵלֵ֨ךְ",
      "through the valley | H1516 | בְּגֵ֪יא",
      "of the shadow of death | H6757 | צַלְמָ֡וֶת",
      "I will fear | H3372 | אִ֘ירָ֤א",
      "no evil | H7451 H3808 | +לֹא־ רָ֗ע",
      "for thou art with me thy rod | H7626 H3588 H859 H5978 | +כִּי־ +אַתָּ֥ה +עִמָּדִ֑י שִׁבְטְךָ֥",
      "and thy staff | H4938 | וּ֝מִשְׁעַנְתֶּ֗ךָ",
      "they comfort | H5162 H1992 | +הֵ֣מָּה יְנַֽחֲמֻֽנִי",
    ]);
    expect(rows.every((r) => r.phrase)).toBe(true);
  });

  it("shows a phrase of two words its number stands on as one row, the first the head: John 3:3's \"Except\", ἐὰν μή", () => {
    const rows = rowsOf(JOHN_3_3.en, JOHN_3_3.gk);
    const except = rows.find((r) => r.phrase?.text === "Except")!;
    expect(read([except])).toEqual(["Except | G1437 G3361 | ἐὰν μή"]);
    expect(except.words.map((w) => [w.head, w.folded])).toEqual([
      [true, false],
      [false, false],
    ]);
    // Every word of the verse is in a row, none under a dash.
    expect(rows.filter((r) => !r.phrase)).toEqual([]);
    expect(read(rows.filter((r) => ["Jesus", "he cannot", "the kingdom", "of God"].includes(r.phrase!.text)))).toEqual([
      "Jesus | G2424 G3588 | +ὁ Ἰησοῦς",
      "he cannot | G1410 G3756 | +οὐ δύναται",
      "the kingdom | G932 G3588 | +τὴν βασιλείαν",
      "of God | G2316 G3588 | +τοῦ θεοῦ.",
    ]);
  });

  it("shows every word a phrase's number stands on more than once, the number once: \"Verily verily\" as one phrase is ἀμὴν ἀμὴν", () => {
    const [row] = rowsOf(phrases(["Verily verily", "G281"]), words(["ἀμὴν", "G281", "interjection"], ["ἀμὴν", "G281", "interjection"]));
    expect(read([row])).toEqual(["Verily verily | G281 | ἀμὴν ἀμὴν"]);
    expect(row.words.map((w) => w.head)).toEqual([true, false]);
  });

  it("gives a word of weight no phrase translates a row of its own under a dash, at the foot, with the little words that go with it", () => {
    const rows = rowsOf(
      phrases(["he went", "H1980"]),
      words(["אָז", "H227", "adverb"], ["הָלַךְ", "H1980", "verb"], ["אֶת", "H853", "particle"], ["הָעִיר", "H5892", "noun"]),
    );
    expect(read(rows)).toEqual(["he went | H1980 | הָלַךְ", "— | H227 | אָז", "— | H5892 H853 | +אֶת הָעִיר"]);
    expect(rows[2].word?.original_word).toBe("הָעִיר");
  });

  it("gives a clause the KJV has no phrase for one row under a dash, its verb not folded into the phrase beside it: Genesis 1:9's וַיְהִי כֵן", () => {
    const rows = rowsOf(
      phrases(["and let the dry", "H3004"], ["land appear", "H7200"]),
      words(["הַיַּבָּשָׁה", "H3004", "noun"], ["וְתֵרָאֶה", "H7200", "verb"], ["וַיְהִי", "H1961", "verb"], ["כֵן", "H3651", "adverb"]),
    );
    // Folded into "land appear" as little words, the row said the KJV's
    // "land appear" translated "and it was so".
    expect(read(rows)).toEqual(["and let the dry | H3004 | הַיַּבָּשָׁה", "land appear | H7200 | וְתֵרָאֶה", "— | H1961 H3651 | וַיְהִי +כֵן"]);
  });

  it("keeps words of weight a row each where they are not side by side", () => {
    const rows = rowsOf(
      phrases(["he went", "H1980"]),
      words(["שָׁם", "H8033", "adverb"], ["הָלַךְ", "H1980", "verb"], ["עוֹד", "H5750", "adverb"]),
    );
    expect(read(rows)).toEqual(["he went | H1980 | הָלַךְ", "— | H8033 | שָׁם", "— | H5750 | עוֹד"]);
  });

  it("puts the unit of a teen with its עָשָׂר where the KJV numbers the עָשָׂר: Genesis 5:8's \"and twelve\"", () => {
    const rows = rowsOf(
      phrases(["and twelve", "H6240"], ["years", "H8141"]),
      words(["שְׁתֵּים", "H8147", "adjective"], ["עֶשְׂרֵה", "H6240", "noun"], ["שָׁנָה", "H8141", "noun"]),
    );
    expect(read(rows)).toEqual(["and twelve | H6240 H8147 | +שְׁתֵּים עֶשְׂרֵה", "years | H8141 | שָׁנָה"]);
    // A unit before an עָשָׂר no phrase has is a word of weight, as it was.
    expect(read(rowsOf(phrases(["years", "H8141"]), words(["שְׁתֵּים", "H8147", "adjective"], ["עֶשְׂרֵה", "H6240", "noun"], ["שָׁנָה", "H8141", "noun"])))).toEqual([
      "years | H8141 | שָׁנָה",
      "— | H8147 H6240 | שְׁתֵּים +עֶשְׂרֵה",
    ]);
  });

  it("gives a phrase whose number the verse lacks its own number and no word", () => {
    const rows = englishOrderRows(alignVerse(phrases(["Selah", "H5542"]), []), []);
    expect(read(rows)).toEqual(["Selah | H5542 | "]);
    expect(rows[0].phraseIndex).toBe(0);
    expect(rows[0].word).toBeNull();
  });

  it("keys every row uniquely", () => {
    const rows = rowsOf(JOHN_3_3.en, JOHN_3_3.gk);
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
  });
});

describe("untranslatedHomes", () => {
  const home = (en: InterlinearWord[], gk: MorphologyWord[]) => {
    const homes = untranslatedHomes(alignVerse(en, gk), gk);
    return gk.map((w) => {
      const h = homes.get(w.id)!;
      return "phrase" in h ? en[h.phrase].text : `—${gk.find((x) => x.id === h.orphan)!.original_word}`;
    });
  };

  it("puts an article with the word after it, past a δέ set in between, and the δέ with the word before it", () => {
    const en = phrases(["answered", "G611"], ["Jesus", "G2424"]);
    const gk = words(["ἀπεκρίθη", "G611", "verb"], ["ὁ", "G3588", "article"], ["δὲ", "G1161", "conjunction"], ["Ἰησοῦς", "G2424", "noun"]);
    // The δέ follows ὁ, and is with it in "Jesus": ὁ δὲ Ἰησοῦς, as written.
    expect(home(en, gk)).toEqual(["answered", "Jesus", "Jesus", "Jesus"]);
    // And past a γάρ the KJV does translate: Romans 8:2's ὁ γὰρ νόμος.
    const law = phrases(["For", "G1063"], ["the law", "G3551"]);
    expect(home(law, words(["ὁ", "G3588", "article"], ["γὰρ", "G1063", "conjunction"], ["νόμος", "G3551", "noun"]))).toEqual(["the law", "For", "the law"]);
  });

  it("puts a personal pronoun with the word before it and a conjunction with the word after", () => {
    const en = phrases(["said", "G2036"], ["the father", "G3962"]);
    const gk = words(["εἶπεν", "G2036", "verb"], ["σοι", "G4771", "pronoun:personal"], ["ὅτι", "G3754", "conjunction"], ["ὁ", "G3588", "article"], ["πατὴρ", "G3962", "noun"]);
    // The σοι the KJV leaves out goes with εἶπεν, and ὅτι with the πατήρ
    // its clause begins with.
    expect(home(en, gk)).toEqual(["said", "said", "the father", "the father", "the father"]);
  });

  it("puts an article at the end of a verse with the word before it, and a little word beside nothing in a row of its own", () => {
    expect(home(phrases(["God", "G2316"]), words(["θεός", "G2316", "noun"], ["ὁ", "G3588", "article"]))).toEqual(["God", "God"]);
    expect(home(phrases(), words(["καὶ", "G2532", "conjunction"]))).toEqual(["—καὶ"]);
  });

  it("puts the teen of a number with its unit before it", () => {
    const en = phrases(["eleven", "H259"], ["stars", "H3556"]);
    const gk = words(["אַחַד", "H259", "adjective"], ["עָשָׂר", "H6240", "noun"], ["כּוֹכָבִים", "H3556", "noun"]);
    expect(home(en, gk)).toEqual(["eleven", "eleven", "stars"]);
  });
});

describe("isLittleWord", () => {
  it("is the article, the object marker, a pronoun suffix, and a little word by its part of speech; not a word of weight", () => {
    const [art, marker, suffix, conj, pron, noun, verb, adverb, bare] = words(
      ["ὁ", "G3588"],
      ["אֵת", "H853"],
      ["לָנוּ", "H9035"],
      ["ὅτι", "G3754", "conjunction"],
      ["τις", "G5100", "pronoun:indefinite"],
      ["λόγος", "G3056", "noun"],
      ["ἦν", "G1510", "verb"],
      ["ἄνωθεν", "G509", "adverb"],
      ["x", "G1"],
    );
    expect([art, marker, suffix, conj, pron].map(isLittleWord)).toEqual([true, true, true, true, true]);
    expect([noun, verb, adverb, bare].map(isLittleWord)).toEqual([false, false, false, false]);
  });

  it("goes by the part of speech for a word FOLDED_RENDERINGS knows: הָיָה and the adverbs of place and manner are words of weight", () => {
    const [be, there, so, all, under, also, bareBe] = words(
      ["וַיְהִי", "H1961", "verb"],
      ["שָׁם", "H8033", "adverb"],
      ["כֵן", "H3651", "adverb"],
      ["כָּל", "H3605", "noun"],
      ["תַּחַת", "H8478", "noun"],
      ["גַּם", "H1571", "adverb"],
      ["הָיָה", "H1961"],
    );
    expect([be, there, so].map(isLittleWord)).toEqual([false, false, false]);
    // The nouns the Hebrew uses as a quantifier or a preposition, a clause's
    // "also", and a word with no parsing to say otherwise are little.
    expect([all, under, also, bareBe].map(isLittleWord)).toEqual([true, true, true, true]);
  });
});

describe("otherNumbers", () => {
  it("is each other word's number once, after the head's, none for a word without one", () => {
    // The article after λόγος, at the verse's end, goes with it too.
    const rows = rowsOf(phrases(["the Word", "G3056"]), words(["ὁ", "G3588", "article"], ["λόγος", "G3056", "noun"], ["ὁ", "G3588", "article"]));
    expect(read(rows)).toEqual(["the Word | G3056 G3588 | +ὁ λόγος +ὁ"]);
    expect(otherNumbers(rows[0]).map((n) => n.strongs)).toEqual(["G3588"]);
    const [suffix] = words(["לָנוּ", "H9035"]);
    const [row] = rowsOf(phrases(["walk", "H1980"]), [...words(["הָלַךְ", "H1980", "verb"]), { ...suffix, id: 999, headword: null }]);
    expect(row.words.length).toBe(2);
    expect(otherNumbers(row)).toEqual([]);
  });
});

describe("originalOrderRows", () => {
  it("gives each word once, in the original's order, with the phrase that translates it shown on the first of a run", () => {
    expect(read(originalOrderRows(alignVerse(EN, GK), GK))).toEqual([
      "In | G1722 | Ἐν",
      "the beginning | G746 | ἀρχῇ",
      "was | G1510 | ἦν",
      "the Word | G3588 | +ὁ",
      "↑ | G3056 | λόγος",
      "— | G3588 | τὸν",
      "not | G3361 | μὴ",
      // Under "perish", which it is shown under in full; "should" only
      // echoes it.
      "perish | G622 | ἀπόληται",
    ]);
  });
});

describe("rowRoot", () => {
  it("is the Strong's entry's headword, not the tagged text's lemma, exactly as the entry has it", () => {
    const [face, waters, ho] = words(["פְּנֵ֣י", "H6440"], ["הַמָּֽיִם׃", "H4325"], ["ὃς", "G3739"]);
    // TAHOT's lemmas spell other words; the root beside the number is the
    // entry's, points and all.
    expect(rowRoot({ ...face, lemma: "פָּנֶה", headword: "פָּנִים" })).toBe("פָּנִים");
    expect(rowRoot({ ...waters, lemma: "מַי", headword: "מַיִם" })).toBe("מַיִם");
    // A headword is whole, a name of two words included; nothing is split
    // off it or stripped from it.
    const [bethlehem] = words(["בֵּית־לֶ֥חֶם", "H1035"]);
    expect(rowRoot({ ...bethlehem, headword: "בֵּית לֶחֶם" })).toBe("בֵּית לֶחֶם");
    expect(rowRoot({ ...ho, lemma: "ὅς, ἥ", headword: "ὅς" })).toBe("ὅς");
  });

  it("has none for a number with no entry, whatever the lemma", () => {
    const [suffix] = words(["הוּ", "H9033"]);
    expect(rowRoot({ ...suffix, lemma: "Os3m", headword: null })).toBeNull();
    expect(rowRoot({ ...suffix, lemma: "Os3m" })).toBeNull();
  });

  it("leaves out the root where it is the word as written", () => {
    const [ho, kai] = words(["ὁ", "G3588"], ["καὶ", "G2532"]);
    expect(rowRoot({ ...ho, headword: "ὁ" })).toBeNull();
    // Another accent is another spelling, and the root is shown.
    expect(rowRoot({ ...kai, headword: "καί" })).toBe("καί");
  });

  it("leaves it out where it is the word as shown: without the maqaf that ties the word on, or the accents taken off", () => {
    const [al, ki] = words(["עַל־", "H5921"], ["כִּ֣י", "H3588"]);
    expect(rowRoot({ ...al, headword: "עַל" })).toBeNull();
    // Psalm 23:4 with the cantillation off: כִּי, not "כִּי כִּי".
    expect(rowRoot({ ...ki, headword: "כִּי" }, withoutCantillation)).toBeNull();
    expect(rowRoot({ ...ki, headword: "כִּי" })).toBe("כִּי");
  });
});

describe("rowNumber", () => {
  it("is the word's Strong's number where the dictionary has the entry, and none for TAHOT's own suffix numbers", () => {
    const [lanu, face, fresh] = words(["לָֽנוּ׃", "H9035"], ["פְּנֵ֣י", "H6440"], ["θεὸς", "G2316"]);
    expect(rowNumber({ ...lanu, headword: null })).toBeNull();
    expect(rowNumber({ ...face, headword: "פָּנִים" })).toBe("H6440");
    expect(rowNumber(fresh)).toBe("G2316");
    const rows = originalOrderRows(alignVerse([], [{ ...lanu, headword: null }]), [{ ...lanu, headword: null }]);
    expect(rows[0].strongs).toBeNull();
  });
});

describe("tableColumnWidths", () => {
  /** A row of the English's order with its word, root, transliteration and
   * a parsing of the given length. */
  function row(english: string, lead: boolean, form: string, headword: string, translit: string | null): InterlinearRow {
    const [word] = words([form, "G1"]);
    return {
      key: english + form,
      phrase: { id: 1, sort_order: 0, text: english, strongs_id: "G1" },
      phraseIndex: 0,
      lead,
      word: { ...word, headword, headword_transliteration: translit },
      words: [{ word: { ...word, headword, headword_transliteration: translit }, head: true, echo: false, folded: false }],
      echo: false,
      folded: false,
      strongs: "G1",
    };
  }

  it("asks for each column what nearly all its rows need, and never less than its least", () => {
    const rows = Array.from({ length: 40 }, (_, i) => row(i === 39 ? "me in the presence of mine enemies" : "God", true, "θεὸν", "θεός", "theós"));
    const widths = tableColumnWidths(rows);
    // The English leaves out its widest row in 40: the rest are one short
    // phrase, and the column is given its least.
    expect(widths.english).toBe(96);
    // θεὸν (4 letters, its accent no width) + θεός + theós and the spaces.
    expect(widths.original).toBe(Math.round(4 * 9.2 + 8 + 4 * 7.1 + 4 + 5 * 6.3));
    expect(widths.parsing).toBe(96);
  });

  it("gives a chapter of long phrases a wider English column", () => {
    const long = Array.from({ length: 10 }, () => row("and every thing that creepeth", true, "וְכֹל", "כֹּל", "kôl"));
    // Its 29 characters, and the row's padding, which the English's column
    // gives up at the row's start.
    expect(tableColumnWidths(long).english).toBe(Math.round(29 * 7.1 + 8));
    // The rows after a phrase's first show an arrow, not the phrase.
    const arrows = long.map((r) => ({ ...r, lead: false }));
    expect(tableColumnWidths(arrows).english).toBe(96);
  });

  it("counts every word of a phrase's row in the original's width, and the head's root once", () => {
    const one = row("the Word", true, "λόγος", "λόγος", "lógos");
    const [article] = words(["ὁ", "G3588"]);
    const both = { ...one, words: [{ word: article, head: false, echo: false, folded: true }, ...one.words] };
    // ὁ, a space, λόγος (its root the word as written) and lógos.
    expect(tableColumnWidths([both]).original).toBe(Math.round(1 * 9.2 + 6 + 5 * 9.2 + 8 + 5 * 6.3));
  });

  it("takes the parsing's width at its rows' nine in ten, with the row's padding at its end", () => {
    const rows = Array.from({ length: 20 }, (_, i) => {
      const r = row("God", true, "θεὸν", "θεός", "theós");
      const word = { ...r.word!, morph_code: "x".repeat(i === 19 ? 80 : 40) };
      return { ...r, word };
    });
    expect(tableColumnWidths(rows).parsing).toBe(Math.round(40 * 5.4 + 8));
  });

  it("makes a grid template of the three shares with the numbers at their own width, up to two to a line", () => {
    expect(tableGridTemplate({ english: 120, original: 180, parsing: 200 })).toBe(
      "minmax(6rem,120fr) fit-content(4.75rem) minmax(6rem,180fr) minmax(6rem,200fr)",
    );
  });
});
