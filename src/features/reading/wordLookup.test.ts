import { describe, expect, it } from "vitest";
import type { MorphologyWord, MorphParsing } from "../../api/types";
import {
  englishLookupWord,
  isEnglishText,
  matchOriginalStrongs,
  namesakesBefore,
  taggedWordForStrongs,
  wordFromSelection,
  wordsAsSelected,
} from "./wordLookup";

let nextId = 1;
/** A tagged word as the chapter's morphology gives it, its parsing standing
 *  in for what morph.rs would decode from the code. */
function tagged(original_word: string, strongs_id: string | null, morph_code: string | null): MorphologyWord {
  const parsing: MorphParsing | null = morph_code
    ? {
        language: "greek",
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
        description: morph_code,
        affixes: [],
      }
    : null;
  return { id: nextId++, sort_order: nextId, original_word, lemma: null, morph_code, strongs_id, parsing };
}

// John 3:16 in the tagged TR, as far as "the world".
const OUTWS = tagged("οὕτως", "G3779", "ADV");
const GAR = tagged("γὰρ", "G1063", "CONJ");
const LOVED = tagged("ἠγάπησεν", "G25", "V-AAI-3S");
const HO = tagged("ὁ", "G3588", "T-NSM");
const THEOS = tagged("θεὸς", "G2316", "N-NSM-T");
const TON = tagged("τὸν", "G3588", "T-ASM");
const KOSMON = tagged("κόσμον,", "G2889", "N-ASM");
const JOHN_3_16 = [OUTWS, GAR, LOVED, HO, THEOS, TON, KOSMON];

describe("matchOriginalStrongs", () => {
  it("finds the tagged word clicked, whatever its accents and punctuation, and gives it for its parsing", () => {
    expect(matchOriginalStrongs("ἠγάπησεν", 0, JOHN_3_16)).toEqual({ strongsId: "G25", word: LOVED });
    // Another edition's accents, the comma left on by the double-click.
    expect(matchOriginalStrongs("κοσμον,", 0, JOHN_3_16)).toEqual({ strongsId: "G2889", word: KOSMON });
  });

  it("takes the namesake at the place clicked", () => {
    const first = tagged("καὶ", "G2532", "CONJ");
    const verb = tagged("εἶπεν", "G2036", "V-2AAI-3S");
    const second = tagged("καὶ", "G2532", "CONJ-N");
    expect(matchOriginalStrongs("καὶ", 1, [first, verb, second])?.word).toBe(second);
    expect(matchOriginalStrongs("καί", 0, [first, verb, second])?.word).toBe(first);
  });

  it("keeps the Strong's number but gives no word past the last namesake when they parse differently", () => {
    // ὁ and ὅ are both "ο" bare; a third clicked, in an edition with one
    // more, is past them both.
    const relative = tagged("ὅ", "G3739", "R-NSN");
    expect(matchOriginalStrongs("ὁ", 2, [HO, THEOS, relative])).toEqual({ strongsId: "G3739", word: null });
    // Past the last of namesakes that all parse alike, any one of them is the word.
    const alike = [tagged("καὶ", "G2532", "CONJ"), tagged("καὶ", "G2532", "CONJ")];
    expect(matchOriginalStrongs("καὶ", 5, alike)?.word).toBe(alike[1]);
  });

  it("names the entry but not the word for a spelling matched only on its first four letters", () => {
    // ἀγαπᾷ is not in the verse; ἠγάπησεν is not even the same augment, and
    // ἀγάπην would be a noun.
    const noun = tagged("ἀγάπην", "G26", "N-ASF");
    expect(matchOriginalStrongs("ἀγαπᾷ", 0, [noun])).toEqual({ strongsId: "G26", word: null });
  });

  it("finds nothing for a word the verse's tagged words do not have, or an untagged one", () => {
    expect(matchOriginalStrongs("λόγος", 0, JOHN_3_16)).toBeNull();
    expect(matchOriginalStrongs("", 0, JOHN_3_16)).toBeNull();
    expect(matchOriginalStrongs("ἐγώ", 0, [tagged("ἐγώ", null, "P-1NS")])).toBeNull();
  });
});

describe("taggedWordForStrongs", () => {
  it("gives the one word of the verse a Strong's number stands on", () => {
    // "loved" in the KJV is G25, which is ἠγάπησεν alone.
    expect(taggedWordForStrongs("G25", JOHN_3_16)).toBe(LOVED);
  });

  it("gives none when the number stands on several words that parse differently", () => {
    // John 1:1's "God": θεόν and θεός.
    const words = [tagged("θεόν", "G2316", "N-ASM-T"), tagged("θεὸς", "G2316", "N-NSM-T")];
    expect(taggedWordForStrongs("G2316", words)).toBeNull();
    // The article in John 3:16: ὁ and τὸν.
    expect(taggedWordForStrongs("G3588", JOHN_3_16)).toBeNull();
  });

  it("gives the first when every word it stands on parses alike", () => {
    // John 1:1's "the Word": ὁ λόγος three times.
    const words = [tagged("λόγος", "G3056", "N-NSM"), tagged("λόγος,", "G3056", "N-NSM"), tagged("λόγος.", "G3056", "N-NSM")];
    expect(taggedWordForStrongs("G3056", words)).toBe(words[0]);
  });

  it("gives none for no number, or one the verse does not have", () => {
    expect(taggedWordForStrongs(null, JOHN_3_16)).toBeNull();
    expect(taggedWordForStrongs("G9999", JOHN_3_16)).toBeNull();
  });
});

// Genesis 4:1 in the Leningrad Codex, and its tagged words.
const GENESIS_4_1_TEXT =
  "וְהָ֣אָדָ֔ם יָדַ֖ע אֶת־חַוָּ֣ה אִשְׁתּ֑וֹ וַתַּ֙הַר֙ וַתֵּ֣לֶד אֶת־קַ֔יִן וַתֹּ֕אמֶר קָנִ֥יתִי אִ֖ישׁ אֶת־יְהוָֽה׃";
const WITH = tagged("אֶת", "H854", "HR");
const GENESIS_4_1 = [
  tagged("וְהָ֣אָדָ֔ם", "H120", "HC/Td/Ncmsa"),
  tagged("יָדַ֖ע", "H3045", "HVqp3ms"),
  tagged("אֶת", "H853", "HTo"),
  tagged("חַוָּ֣ה", "H2332", "HNpf"),
  tagged("אִשְׁתּ֑וֹ", "H802", "HNcfsc/Sp3ms"),
  tagged("וַתַּ֙הַר֙", "H2029", "Hc/Vqw3fs"),
  tagged("וַתֵּ֣לֶד", "H3205", "Hc/Vqw3fs"),
  tagged("אֶת", "H853", "HTo"),
  tagged("קַ֔יִן", "H7014", "HNpm"),
  tagged("וַתֹּ֕אמֶר", "H559", "Hc/Vqw3fs"),
  tagged("קָנִ֥יתִי", "H7069", "HVqp1cs"),
  tagged("אִ֖ישׁ", "H376", "HNcmsa"),
  WITH,
  tagged("יְהוָֽה", "H3068", "HNpt"),
];

describe("wordFromSelection", () => {
  function selectWord(verseText: string, start: number, length: number): Selection {
    const verse = document.createElement("span");
    verse.setAttribute("data-verse-text", "16");
    verse.textContent = verseText;
    document.body.replaceChildren(verse);
    const range = document.createRange();
    range.setStart(verse.firstChild!, start);
    range.setEnd(verse.firstChild!, start + length);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    return sel;
  }

  it("counts the word's earlier namesakes by bare letters, as the match lines them up", () => {
    // ὁ ... ὅ ... ὁ: the third "ο" bare, whatever its breathing.
    const text = "ὁ λόγος ὅ ἦν καὶ ὁ θεὸς";
    const at = wordFromSelection(selectWord(text, text.lastIndexOf("ὁ"), 1));
    expect(at).toEqual({ word: "ὁ", verse: 16, occurrence: 2 });
  });

  it("counts an English word's namesakes whatever their case and punctuation", () => {
    const text = "In the beginning was the Word, and the Word was with God";
    const at = wordFromSelection(selectWord(text, text.lastIndexOf("Word"), 4));
    expect(at).toEqual({ word: "Word", verse: 16, occurrence: 1 });
  });

  it("counts each half of a Hebrew maqaf compound as a word, as the browser selects it and the tagged text tags it", () => {
    // The third אֶת of Genesis 4:1, "with the LORD": the two before it are
    // each joined to a name.
    const at = wordFromSelection(selectWord(GENESIS_4_1_TEXT, GENESIS_4_1_TEXT.lastIndexOf("אֶת"), "אֶת".length));
    expect(at?.occurrence).toBe(2);
    expect(matchOriginalStrongs(at!.word, at!.occurrence, GENESIS_4_1)).toEqual({ strongsId: "H854", word: WITH });
  });
});

describe("wordsAsSelected and namesakesBefore", () => {
  it("divides a verse where a double-click does: at spaces, the maqaf, hyphens and dashes", () => {
    expect(wordsAsSelected("קָנִ֥יתִי אִ֖ישׁ אֶת־יְהוָֽה׃")).toEqual(["קָנִ֥יתִי", "אִ֖ישׁ", "אֶת", "יְהוָֽה"]);
    expect(wordsAsSelected("a sister of Tubal-Cain [is] Naamah")).toEqual(["a", "sister", "of", "Tubal", "Cain", "is", "Naamah"]);
    expect(wordsAsSelected("with me—she has given")).toEqual(["with", "me", "she", "has", "given"]);
    expect(wordsAsSelected("λέγει· ποιήσω; ἀλλ᾽ ἐν")).toEqual(["λέγει", "ποιήσω", "ἀλλ", "ἐν"]);
  });

  it("keeps an apostrophe inside a word, and the comma or point inside a number", () => {
    expect(wordsAsSelected("man's blood, by man; Ba‘al-Peor")).toEqual(["man's", "blood", "by", "man", "Ba‘al", "Peor"]);
    expect(wordsAsSelected("20,000 baths, and 2.5 cubits.")).toEqual(["20,000", "baths", "and", "2.5", "cubits"]);
  });

  it("counts the clicked word's namesakes by bare letters", () => {
    // The second אֶת of Genesis 4:1 has one before it, joined to Eve.
    expect(namesakesBefore("וְהָ֣אָדָ֔ם יָדַ֖ע אֶת־חַוָּ֣ה אִשְׁתּ֑וֹ וַתַּ֙הַר֙ וַתֵּ֣לֶד ", "אֶת")).toBe(1);
    // "man" is not "man's".
    expect(namesakesBefore("Whoso sheddeth man's blood, by ", "man")).toBe(0);
    expect(namesakesBefore("anything", "")).toBe(0);
  });
});

describe("the word Webster is asked for", () => {
  it("is the word without what the selection kept around it, in lower case", () => {
    expect(englishLookupWord("Loved,")).toBe("loved");
    expect(englishLookupWord("‘Behold")).toBe("behold");
    expect(englishLookupWord("prevented.")).toBe("prevented");
    expect(englishLookupWord("LORD")).toBe("lord");
  });

  it("drops the possessive, which Webster does not file", () => {
    expect(englishLookupWord("man's")).toBe("man");
    expect(englishLookupWord("God’s")).toBe("god");
    expect(englishLookupWord("Moses'")).toBe("moses");
  });

  it("keeps an apostrophe or hyphen inside the word", () => {
    expect(englishLookupWord("o’clock")).toBe("o'clock");
    expect(englishLookupWord("self-will")).toBe("self-will");
  });

  it("is nothing for a number or a selection with no letters", () => {
    expect(englishLookupWord("20,000")).toBeNull();
    expect(englishLookupWord("—")).toBeNull();
    expect(englishLookupWord("")).toBeNull();
  });
});

describe("which texts are English", () => {
  it("takes a Latin-script text as English unless it names another language", () => {
    expect(isEnglishText({ script: "latin", language: "ENG" })).toBe(true);
    expect(isEnglishText({ script: "latin", language: "en" })).toBe(true);
    expect(isEnglishText({ script: "latin", language: null })).toBe(true);
    expect(isEnglishText({ script: "latin", language: "la" })).toBe(false);
  });

  it("does not take a Greek or Hebrew text, or no text, as English", () => {
    expect(isEnglishText({ script: "greek", language: "grc" })).toBe(false);
    expect(isEnglishText({ script: "hebrew", language: "hbo" })).toBe(false);
    expect(isEnglishText({ script: "greek", language: null })).toBe(false);
    expect(isEnglishText(undefined)).toBe(false);
  });
});
