import { describe, expect, it } from "vitest";
import type { InterlinearWord, MorphologyWord, MorphParsing } from "../../api/types";
import { alignVerse, pairInOrder, phraseWord } from "./interlinearAlign";

/** The verse's KJV phrases, from [text, Strong's] pairs. */
function phrases(...rows: [string, string | null][]): InterlinearWord[] {
  return rows.map(([text, strongs_id], i) => ({ id: i + 1, sort_order: i, text, strongs_id }));
}

/** The verse's tagged words, from [word, Strong's, code] triples. */
function words(...rows: [string, string | null, string?][]): MorphologyWord[] {
  return rows.map(([original_word, strongs_id, morph_code], i) => ({
    id: 100 + i,
    sort_order: i,
    original_word,
    lemma: null,
    morph_code: morph_code ?? null,
    strongs_id,
    parsing: null,
  }));
}

/** What the alignment shows: each phrase with the words under it (an echo
 * marked with a "~", a little word folded in with a "+"), and the words not
 * translated. */
function shown(p: InterlinearWord[], w: MorphologyWord[]) {
  const a = alignVerse(p, w);
  return {
    under: a.phrases.map((x) => [x.phrase.text, x.words.map((y) => (y.echo ? "~" : "") + (y.folded ? "+" : "") + y.word.original_word).join(" ")]),
    untranslated: a.untranslated.map((x) => x.original_word).join(" "),
  };
}

// John 1:1 as the two texts tag it: the KJV numbers "was" G2258 (ἦν), the
// tagged text G1510 (εἰμί).
const JOHN_1_1_EN = phrases(
  ["In", "G1722"],
  ["the beginning", "G746"],
  ["was", "G2258"],
  ["the Word", "G3056"],
  ["and", "G2532"],
  ["the Word", "G3056"],
  ["was", "G2258"],
  ["with", "G4314"],
  ["God", "G2316"],
  ["and", "G2532"],
  ["the Word", "G3056"],
  ["was", "G2258"],
  ["God", "G2316"],
);
const JOHN_1_1_GK = words(
  ["Ἐν", "G1722"],
  ["ἀρχῇ", "G746"],
  ["ἦν", "G1510"],
  ["ὁ", "G3588"],
  ["λόγος,", "G3056"],
  ["καὶ", "G2532"],
  ["ὁ", "G3588"],
  ["λόγος", "G3056"],
  ["ἦν", "G1510"],
  ["πρὸς", "G4314"],
  ["τὸν", "G3588"],
  ["θεόν,", "G2316", "N-ASM-T"],
  ["καὶ", "G2532"],
  ["θεὸς", "G2316", "N-NSM-T"],
  ["ἦν", "G1510"],
  ["ὁ", "G3588"],
  ["λόγος.", "G3056"],
);

// Genesis 1:1.
const GEN_1_1_EN = phrases(["In the beginning", "H7225"], ["God", "H430"], ["created", "H1254"], ["the heaven", "H8064"], ["and", "H853"], ["the earth", "H776"]);
const GEN_1_1_HE = words(
  ["בְּרֵאשִׁ֖ית", "H7225"],
  ["בָּרָ֣א", "H1254"],
  ["אֱלֹהִ֑ים", "H430"],
  ["אֵ֥ת", "H853"],
  ["הַשָּׁמַ֖יִם", "H8064"],
  ["וְאֵ֥ת", "H853"],
  ["הָאָֽרֶץ", "H776"],
);

describe("alignVerse", () => {
  it("gives a number the verse has twice to its two phrases in turn: John 1:1's two Gods", () => {
    const { under } = shown(JOHN_1_1_EN, JOHN_1_1_GK);
    expect(under.filter(([en]) => en === "God").map(([, gk]) => gk)).toEqual(["θεόν,", "θεὸς"]);
    // Each λόγος with its article, which the KJV folds into "the Word".
    expect(under.filter(([en]) => en === "the Word").map(([, gk]) => gk)).toEqual(["+ὁ λόγος,", "+ὁ λόγος", "+ὁ λόγος."]);
    expect(under.filter(([en]) => en === "and").map(([, gk]) => gk)).toEqual(["καὶ", "καὶ"]);
  });

  it("reads Strong's own number for a form of εἰμί as the tagged text's", () => {
    const { under } = shown(JOHN_1_1_EN, JOHN_1_1_GK);
    expect(under.filter(([en]) => en === "was").map(([, gk]) => gk)).toEqual(["ἦν", "ἦν", "ἦν"]);
  });

  it("gathers the words no phrase translates, in the original's order: the article before θεόν, with no 'the' beside it", () => {
    expect(shown(JOHN_1_1_EN, JOHN_1_1_GK).untranslated).toBe("τὸν");
    expect(shown(phrases(["God", "G2316"]), words(["ὁ", "G3588"], ["θεὸς", "G2316"], ["γάρ", "G1063"], ["τὸν", "G3588"])).untranslated).toBe(
      "ὁ γάρ τὸν",
    );
  });

  it("folds a little word into the phrase beside it only when that phrase has one of its renderings", () => {
    const { under, untranslated } = shown(
      phrases(["God", "G2316"], ["so", "G3779"], ["loved", "G25"], ["the world", "G2889"]),
      words(["οὕτως", "G3779"], ["ἠγάπησεν", "G25"], ["ὁ", "G3588"], ["θεὸς", "G2316"], ["τὸν", "G3588"], ["κόσμον", "G2889"]),
    );
    expect(under).toEqual([
      ["God", "θεὸς"],
      ["so", "οὕτως"],
      ["loved", "ἠγάπησεν"],
      ["the world", "+τὸν κόσμον"],
    ]);
    // ὁ is beside ἠγάπησεν and θεὸς, and neither "loved" nor "God" has a "the".
    expect(untranslated).toBe("ὁ");
  });

  it("puts every word under the one phrase that claims their number", () => {
    const { under, untranslated } = shown(
      phrases(["Verily verily", "G281"], ["I say", "G3004"], ["unto thee", "G4671"]),
      words(["ἀμὴν", "G281"], ["ἀμὴν", "G281"], ["λέγω", "G3004"], ["σοι", "G4771"]),
    );
    expect(under).toEqual([
      ["Verily verily", "ἀμὴν +ἀμὴν"],
      ["I say", "λέγω"],
      ["unto thee", "σοι"],
    ]);
    expect(untranslated).toBe("");
    // Beside nothing with the phrase's English in it, still under the phrase.
    expect(shown(phrases(["for", "G1063"]), words(["γὰρ", "G1063"], ["θεὸς", "G2316"], ["γὰρ", "G1063"])).under).toEqual([["for", "γὰρ γὰρ"]]);
  });

  it("shows nothing under a word the KJV supplied, nor under a number the verse lacks", () => {
    const { under } = shown(
      phrases(["God", "G2316"], ["is", null], ["a Spirit", "G4151"], ["indeed", "G9999"]),
      words(["πνεῦμα", "G4151"], ["ὁ", "G3588"], ["θεός", "G2316"]),
    );
    expect(under).toEqual([
      ["God", "θεός"],
      ["is", ""],
      ["a Spirit", "πνεῦμα"],
      ["indeed", ""],
    ]);
  });

  it("claims both words of a compound Strong numbered as one", () => {
    const { under, untranslated } = shown(
      phrases(["that", "G2443"], ["lest", "G3363"], ["he fall", "G4098"]),
      words(["ἵνα", "G2443"], ["ἵνα", "G2443"], ["μὴ", "G3361"], ["πέσῃ", "G4098"]),
    );
    expect(under).toEqual([
      ["that", "ἵνα"],
      ["lest", "ἵνα μὴ"],
      ["he fall", "πέσῃ"],
    ]);
    expect(untranslated).toBe("");
  });

  it("keeps Strong's own number where the verse has it, table or no table", () => {
    // G848 is read as G846 only where the verse has no G848.
    const { under } = shown(phrases(["his", "G848"]), words(["αὑτοῦ", "G848"], ["αὐτοῦ", "G846"]));
    expect(under).toEqual([["his", "αὑτοῦ +αὐτοῦ"]]);
  });

  it("shows one word under two phrases the KJV spent on it, parsed under the nearer and echoed under the other", () => {
    // John 3:16's "should not perish": ἀπόληται is both "should" and "perish".
    const { under } = shown(
      phrases(["whosoever", "G3956"], ["should", "G622"], ["not", "G3361"], ["perish", "G622"]),
      words(["πᾶς", "G3956"], ["μὴ", "G3361"], ["ἀπόληται", "G622"]),
    );
    expect(under).toEqual([
      ["whosoever", "πᾶς"],
      ["should", "~ἀπόληται"],
      ["not", "μὴ"],
      ["perish", "ἀπόληται"],
    ]);
  });

  it("aligns a Hebrew verse, leaving the object marker the KJV has no word for", () => {
    const { under, untranslated } = shown(GEN_1_1_EN, GEN_1_1_HE);
    expect(under).toEqual([
      ["In the beginning", "בְּרֵאשִׁ֖ית"],
      ["God", "אֱלֹהִ֑ים"],
      ["created", "בָּרָ֣א"],
      ["the heaven", "הַשָּׁמַ֖יִם"],
      ["and", "וְאֵ֥ת"],
      ["the earth", "הָאָֽרֶץ"],
    ]);
    // The KJV's "and" is the וְאֵת with "and" written on it; the other אֵת
    // marks "the heaven" and is not translated.
    expect(untranslated).toBe("אֵ֥ת");
  });

  it("folds a Hebrew particle into the phrase its KJV number leaves it out of: Psalm 23:1", () => {
    // The KJV numbers "I shall not want" for the verb alone; the לֹא beside
    // it goes with it for its "not".
    const { under, untranslated } = shown(
      phrases(["The LORD", "H3068"], ["is my shepherd", "H7462"], ["I shall not want", "H2637"], ["of David", "H1732"], ["A Psalm", "H4210"]),
      words(["מִזְמ֥וֹר", "H4210"], ["לְדָוִ֑ד", "H1732"], ["יְהוָ֥ה", "H3068"], ["רֹ֝עִ֗י", "H7462"], ["לֹ֣א", "H3808"], ["אֶחְסָֽר", "H2637"]),
    );
    expect(under.map(([, he]) => he)).toEqual(["יְהוָ֥ה", "רֹ֝עִ֗י", "+לֹ֣א אֶחְסָֽר", "לְדָוִ֑ד", "מִזְמ֥וֹר"]);
    expect(untranslated).toBe("");
    // H3212, "went", is filed under H1980.
    expect(shown(phrases(["and went", "H3212"]), words(["וַיֵּ֣לֶךְ", "H1980"])).under).toEqual([["and went", "וַיֵּ֣לֶךְ"]]);
  });

  it("gives a word over to the phrase beside it whose English has the phrase's word: Genesis 1:2's two עַל", () => {
    const { under } = shown(
      phrases(
        ["and darkness", "H2822"],
        ["was upon the face", "H6440"],
        ["of the deep", "H8415"],
        ["moved", "H7363"],
        ["upon", "H5921"],
        ["the face", "H6440"],
        ["of the waters", "H4325"],
      ),
      words(["וְחֹ֖שֶׁךְ", "H2822"], ["עַל", "H5921"], ["פְּנֵ֣י", "H6440"], ["תְה֑וֹם", "H8415"], ["מְרַחֶ֖פֶת", "H7363"], ["עַל", "H5921"], ["פְּנֵ֥י", "H6440"], ["הַמָּֽיִם", "H4325"]),
    );
    expect(under[1]).toEqual(["was upon the face", "+עַל פְּנֵ֣י"]);
    expect(under[4]).toEqual(["upon", "עַל"]);
  });

  it("reaches the phrase beside the neighbour's in the English when the KJV carried a little word over: Psalm 23:4", () => {
    // לֹא stands beside אִירָא, "I will fear", but its "no" is in "no evil";
    // עִמָּדִי, אַתָּה and כִּי go one by one into "for thou art with me thy
    // rod", numbered only for the rod; הֵמָּה into "they comfort".
    const { under, untranslated } = shown(
      phrases(
        ["Yea though I walk", "H3212"],
        ["through the valley", "H1516"],
        ["of the shadow of death", "H6757"],
        ["I will fear", "H3372"],
        ["no evil", "H7451"],
        ["for thou art with me thy rod", "H7626"],
        ["and thy staff", "H4938"],
        ["they comfort", "H5162"],
      ),
      words(
        ["גַּ֤ם", "H1571"],
        ["כִּֽי", "H3588"],
        ["אֵלֵ֨ךְ", "H1980"],
        ["בְּגֵ֪יא", "H1516"],
        ["צַלְמָ֡וֶת", "H6757"],
        ["לֹא", "H3808"],
        ["אִ֘ירָ֤א", "H3372"],
        ["רָ֗ע", "H7451"],
        ["כִּי", "H3588"],
        ["אַתָּ֥ה", "H859"],
        ["עִמָּדִ֑י", "H5978"],
        ["שִׁבְטְךָ֥", "H7626"],
        ["וּ֝מִשְׁעַנְתֶּ֗ךָ", "H4938"],
        ["הֵ֣מָּה", "H1992"],
        ["יְנַֽחֲמֻֽנִי", "H5162"],
      ),
    );
    expect(under[0][1]).toBe("+גַּ֤ם +כִּֽי אֵלֵ֨ךְ");
    expect(under[3][1]).toBe("אִ֘ירָ֤א");
    expect(under[4][1]).toBe("+לֹא רָ֗ע");
    expect(under[5][1]).toBe("+כִּי +אַתָּ֥ה +עִמָּדִ֑י שִׁבְטְךָ֥");
    expect(under[7][1]).toBe("+הֵ֣מָּה יְנַֽחֲמֻֽנִי");
    expect(untranslated).toBe("");
  });

  it("folds an article only into the phrase of the word it goes before: Matthew 5:3's τῷ", () => {
    // "are the poor" has a "the", but τῷ is the article of πνεύματι, and "in
    // spirit" has none.
    const { under, untranslated } = shown(
      phrases(["Blessed", "G3107"], ["are the poor", "G4434"], ["in spirit", "G4151"]),
      words(["Μακάριοι", "G3107"], ["οἱ", "G3588"], ["πτωχοὶ", "G4434"], ["τῷ", "G3588"], ["πνεύματι", "G4151"]),
    );
    expect(under[1]).toEqual(["are the poor", "+οἱ πτωχοὶ"]);
    expect(under[2]).toEqual(["in spirit", "πνεύματι"]);
    expect(untranslated).toBe("τῷ");
  });

  it("does not find a word over by a common word of its phrase: Psalm 23:6's second יָמִים", () => {
    // The second יָמִים is beside יְהוָה, "of the LORD", which shares only its
    // "the" with "all the days"; it goes to "all the days" after all.
    const { under } = shown(
      phrases(["all the days", "H3117"], ["of my life", "H2416"], ["in the house", "H1004"], ["of the LORD", "H3068"], ["for ever", "H753"]),
      words(["יְמֵ֣י", "H3117"], ["חַיָּ֑י", "H2416"], ["בְּבֵית", "H1004"], ["יְ֝הוָ֗ה", "H3068"], ["לְאֹ֣רֶךְ", "H753"], ["יָמִֽים", "H3117"]),
    );
    expect(under[0]).toEqual(["all the days", "יְמֵ֣י יָמִֽים"]);
    expect(under[3]).toEqual(["of the LORD", "יְ֝הוָ֗ה"]);
  });

  it("finds ὤν for the \"is\" the KJV numbers for the whole of \"which is, and which was\" (Revelation 1:8)", () => {
    const { under } = shown(
      phrases(["I", "G1473"], ["am", "G1510"], ["the Lord", "G2962"], ["which", "G3588"], ["is", "G3801"], ["and", "G2532"], ["which", "G3588"], ["was", "G2258"], ["and", "G2532"], ["which", "G3588"], ["is", "G3801"], ["to come", "G2064"]),
      words(["ἐγώ", "G1473"], ["εἰμι", "G1510"], ["ὁ", "G3588"], ["κύριος,", "G2962"], ["ὁ", "G3588"], ["ὢν", "G1510"], ["καὶ", "G2532"], ["ὁ", "G3588"], ["ἦν", "G1510"], ["καὶ", "G2532"], ["ὁ", "G3588"], ["ἐρχόμενος,", "G2064"]),
    );
    expect(under[1]).toEqual(["am", "εἰμι"]);
    expect(under[4]).toEqual(["is", "ὢν"]);
    expect(under[7]).toEqual(["was", "ἦν"]);
  });

  it("leaves every word untranslated when the verse has no phrases", () => {
    expect(shown([], words(["ὁ", "G3588"], ["λόγος", "G3056"])).untranslated).toBe("ὁ λόγος");
  });

  it("finds the emphatic ἐμοί and ἐμοῦ under ἐγώ, not the enclitic με: Galatians 2:20's \"I\" and three \"me\"", () => {
    const en = phrases(["not", "G3765"], ["I", "G1473"], ["liveth", "G2198"], ["in", "G1722"], ["me", "G1698"], ["loved", "G25"], ["me", "G3165"], ["for", "G5228"], ["me", "G1700"]);
    const gk = words(["οὐκέτι", "G3765"], ["ἐγώ,", "G1473"], ["ζῇ", "G2198"], ["ἐν", "G1722"], ["ἐμοὶ", "G1473"], ["ἀγαπήσαντός", "G25"], ["με", "G3165"], ["ὑπὲρ", "G5228"], ["ἐμοῦ.", "G1473"]);
    // Each "me" its own word, and "I" the ἐγώ alone: looked for under με
    // first, all three "me" had claimed the one με, and "I" all three of
    // ἐγώ, ἐμοί and ἐμοῦ.
    expect(shown(en, gk).under).toEqual([
      ["not", "οὐκέτι"],
      ["I", "ἐγώ,"],
      ["liveth", "ζῇ"],
      ["in", "ἐν"],
      ["me", "ἐμοὶ"],
      ["loved", "ἀγαπήσαντός"],
      ["me", "με"],
      ["for", "ὑπὲρ"],
      ["me", "ἐμοῦ."],
    ]);
  });

  it("does not find a וַיְהִי, \"and it was\", in the KJV's present \"is\": Genesis 1:11's closing וַיְהִי כֵן", () => {
    const en = phrases(["seed", "H2233"], ["is in itself upon the earth", "H776"]);
    const [seed, on, earth, was, so] = words(["זַרְעוֹ", "H2233"], ["עַל", "H5921"], ["הָאָרֶץ", "H776"], ["וַיְהִי", "H1961"], ["כֵן", "H3651"]);
    const sequential = { ...was, parsing: { ...parsing("verb"), tense: "sequential imperfect" } };
    const a = alignVerse(en, [seed, on, earth, sequential, so]);
    expect(a.untranslated.map((w) => w.original_word)).toEqual(["וַיְהִי", "כֵן"]);
    // A הָיָה of another tense still finds its "is", as a הָיוּ does the KJV's
    // "are" in "we are no spies".
    const perfect = { ...was, parsing: { ...parsing("verb"), tense: "perfect" } };
    expect(alignVerse(en, [seed, on, earth, perfect, so]).untranslated.map((w) => w.original_word)).toEqual(["כֵן"]);
  });
});

function parsing(part_of_speech: string): MorphParsing {
  return {
    language: "hebrew",
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
    kind: null,
    description: part_of_speech,
    affixes: [],
  };
}

describe("pairInOrder", () => {
  it("pairs in turn when the counts agree", () => {
    expect(pairInOrder([2, 6], 10, [3, 8], 12)).toEqual([
      { phrase: 2, word: 3, kind: "pair" },
      { phrase: 6, word: 8, kind: "pair" },
    ]);
  });

  it("gives a word over to the phrase whose word is nearest it", () => {
    // Two phrases near the start and end, three words: the middle word is
    // nearer the first.
    const pairs = pairInOrder([0, 9], 10, [0, 3, 9], 10);
    expect(pairs).toContainEqual({ phrase: 0, word: 3, kind: "over" });
    expect(pairs.filter((p) => p.phrase === 9)).toEqual([{ phrase: 9, word: 9, kind: "pair" }]);
  });

  it("gives one phrase the word nearest its place, and the rest over", () => {
    expect(pairInOrder([4], 5, [3, 5], 7)).toEqual([
      { phrase: 4, word: 5, kind: "pair" },
      { phrase: 4, word: 3, kind: "over" },
    ]);
  });
});

describe("phraseWord", () => {
  it("is the one word a phrase translates by its number, echo or not, and none for several", () => {
    const a = alignVerse(JOHN_1_1_EN, JOHN_1_1_GK);
    expect(phraseWord(a.phrases[12])?.original_word).toBe("θεὸς");
    // "the Word" is λόγος, not its article.
    expect(phraseWord(a.phrases[3])?.original_word).toBe("λόγος,");
    expect(phraseWord(undefined)).toBeNull();
    expect(phraseWord(alignVerse(GEN_1_1_EN, GEN_1_1_HE).phrases[4])?.original_word).toBe("וְאֵ֥ת");
    const two = alignVerse(phrases(["for", "G1063"]), words(["γὰρ", "G1063"], ["θεὸς", "G2316"], ["γὰρ", "G1063"]));
    expect(phraseWord(two.phrases[0])).toBeNull();
  });
});
