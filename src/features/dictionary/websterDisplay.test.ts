import { describe, expect, it } from "vitest";
import {
  browsePage,
  citesChapter,
  dictionaryWorkShown,
  entryRelations,
  fitScale,
  fullestIndex,
  isInflectionEntry,
  markWebsterParagraphs,
  paragraphText,
  partOfSpeechName,
  splitHeading,
  unbreakableRuns,
  websterEnterTarget,
  websterPreview,
  websterSenses,
} from "./websterDisplay";

// Entries as reference/webster1828 has them, cut down where the rest adds
// nothing to what is tested.
const PREVENT_VT = {
  pos: "v.t.",
  html:
    "<p><b>PREVENT'</b>, v.t. [L. proevenio, supra.]</p><p>1. To go before; to precede.</p>" +
    '<p>I prevented the dawning of the morning, and cried. <a class="scripref" data-osis="Ps.119.147">Ps.119</a>.</p>' +
    "<p>2. To precede, as something unexpected or unsought.</p>" +
    '<p>The days of my affliction prevented me. <a class="scripref" data-osis="Job.30.27">Job.30</a>.</p>' +
    '<p><a class="scripref" data-osis="2Sam.22.1-2Sam.22.51">2 Sam.22</a>.</p>' +
    "<p>3. To go before; to precede; to favor by anticipation or by hindering distress or evil.</p>" +
    '<p>The God of my mercy shall prevent me. <a class="scripref" data-osis="Ps.59.10">Ps.59</a>.</p>' +
    "<p>6. To hinder; to obstruct; to intercept the approach or access of. This is now the only sense.</p>",
};
const PREVENT_VI = { pos: "v.i.", html: "<p><b>PREVENT'</b>, v.i. To come before the usual time. [Not in use.]</p>" };

const LET_VT = {
  pos: "v.t.",
  html:
    "<p><b>LET</b>, v.t. pret. and pp. let. Letted is obsolete. [To let out, like L. elocare, is to lease.]</p>" +
    "<p>1. To permit; to allow; to suffer; to give leave or power by a positive act.</p>" +
    '<p>Pharaoh said, I will let you go. <a class="scripref" data-osis="Exod.8.1-Exod.8.32">Ex. 8</a>.</p>' +
    "<p>2. To lease; to grant possession and use for a compensation.</p>" +
    "<p>3. To suffer; to permit; with the usual sign of the infinitive.</p>" +
    '<p>4. In the imperative mode, let has the following uses. <a class="scripref" data-osis="Ps.119.1-Ps.119.176">Ps. 119</a>.</p>' +
    '<p>5. To retard; to hinder; to impede; to interpose obstructions. <a class="scripref" data-osis="2Thess.2.1-2Thess.2.17">2Thess. 2</a>.</p>' +
    "<p>[This sense is now obsolete, or nearly so.]</p>",
};
const LET_VI = { pos: "v.i.", html: "<p><b>LET</b>, v.i. To forbear. Obs.</p>" };
const LET_N = { pos: "n.", html: "<p><b>LET</b>, n. A retarding; hinderance; obstacle; impediment; delay. [Obsolete, unless in some technical phrases.]</p>" };

const QUICK_VI = { pos: "v.i.", html: "<p><b>QUICK</b>, v.i.</p><p>To stir; to move. [Not in use.]</p>" };
const QUICK_A = {
  pos: "a.",
  html:
    "<p><b>QUICK</b>, a. [If q is a dialectical prefix, as I suppose, this word coincides with the L. vigeo.]</p>" +
    '<p>1. Primarily, alive; living; opposed to dead or unanimated; as quick flesh. <a class="scripref" data-osis="Lev.13.1-Lev.13.59">Lev. 13</a>.</p>' +
    '<p>The Lord Jesus Christ, who shall judge the quick and the dead. <a class="scripref" data-osis="2Tim.4.1">2Tim. 4</a>.</p>' +
    "<p>2. Swift; hasty; done with celerity; as quick dispatch.</p>" +
    "<p>3. Speedy; done or occurring in a short time; as a quick return of profits.</p>",
};

describe("which work a Dictionary pane shows", () => {
  it("is what the pane says, whatever the reader chose last", () => {
    expect(dictionaryWorkShown({ slug: null, work: "webster" }, "bible")).toBe("webster");
    expect(dictionaryWorkShown({ slug: "love", work: "webster" }, "bible")).toBe("webster");
    expect(dictionaryWorkShown({ slug: null, work: "bible", webster: 12 }, "webster")).toBe("bible");
  });

  it("is the work of what the pane was opened on, when it does not say", () => {
    // A Bible-dictionary headword from the Factbook, into a pane whose
    // reader last had Webster open.
    expect(dictionaryWorkShown({ slug: "melchizedek" }, "webster")).toBe("bible");
    // "Open in Webster" from the word card.
    expect(dictionaryWorkShown({ slug: null, webster: 41 }, "bible")).toBe("webster");
    expect(dictionaryWorkShown({ slug: null, webster: 0 }, "bible")).toBe("webster");
  });

  it("is the reader's last choice for a bare pane, and undecided until that has loaded", () => {
    expect(dictionaryWorkShown({ slug: null }, "webster")).toBe("webster");
    expect(dictionaryWorkShown({ slug: null, webster: null }, "bible")).toBe("bible");
    expect(dictionaryWorkShown({ slug: null }, undefined)).toBeNull();
  });
});

describe("reading an entry", () => {
  it("takes the paragraphs' words without the markup", () => {
    expect(paragraphText('I prevented the dawning. <a class="scripref" data-osis="Ps.119.147">Ps.119</a>.')).toBe("I prevented the dawning. Ps.119.");
    expect(paragraphText("<i>&amp;c.</i> &quot;so&quot; &lt;it&gt;")).toBe('&c. "so" <it>');
  });

  it("splits the heading line into the headword and the definition it carries", () => {
    expect(splitHeading("<b>PREVENT'</b>, v.t. [L. proevenio, supra.]", "v.t.")).toEqual({
      headword: "PREVENT'",
      definition: null,
      printed: "[L. proevenio, supra.]",
    });
    expect(splitHeading("<b>PREVENT'</b>, v.i. To come before the usual time. [Not in use.]", "v.i.")).toMatchObject({
      headword: "PREVENT'",
      definition: "To come before the usual time. [Not in use.]",
    });
    // Printed "v. t." and run up against the etymology.
    expect(splitHeading("<b>SUF'FER</b>,v. t.[L. suffero.] To bear.", "v.t.").definition).toBe("To bear.");
    expect(splitHeading("<b>ABAS'SI</b>, or <b>ABAS'SIS</b>, n. A silver coin of Persia.", "n.")).toMatchObject({
      headword: "ABAS'SI, or ABAS'SIS",
      definition: "A silver coin of Persia.",
    });
  });

  it("does not take a pronunciation, a label or the word's forms for a definition", () => {
    expect(splitHeading("<b>DEATH</b>, n. deth.", "n.").definition).toBeNull();
    expect(splitHeading("<b>BUILD</b>, v.t. bild", "v.t.").definition).toBeNull();
    // But one capitalised word can be the whole definition.
    expect(splitHeading("<b>ABOUND'ING</b>, n. Increase.", "n.").definition).toBe("Increase.");
    expect(splitHeading("<b>ACCESS'IONAL</b>, a. Additional", "a.").definition).toBe("Additional");
    expect(splitHeading("<b>QUICK</b>, v.t. Obs.", "v.t.").definition).toBeNull();
    expect(splitHeading(websterParagraph(LET_VT.html), "v.t.").definition).toBeNull();
    expect(splitHeading("<b>MAN</b>, n. plu. men.", "n.").definition).toBeNull();
    // Nor the "Obs" of another word.
    expect(splitHeading("<b>HEAD'STRONGNESS</b>,n. Obstinacy. [Not in use.]", "n.").definition).toBe("Obstinacy. [Not in use.]");
  });

  // The heading lines of some of the commonest words of the King James
  // Version, as Webster prints them: each is pronunciation, grammar and
  // etymology, and the card must go on to the numbered senses.
  it("reads past a respelling and the etymology after it", () => {
    expect(splitHeading("<b>HOUSE</b>, n. hous. [L. casa; Heb. to put on, to cover.]", "n.").definition).toBeNull();
    expect(splitHeading("<b>ONE</b>, a. wun. [L. unus; Gr.]", "a.").definition).toBeNull();
    expect(splitHeading("<b>THEREFORE</b>, adv. ther'fore. [there and for.]", "adv.").definition).toBeNull();
    expect(splitHeading("<b>ABU'SE</b>, v.t. s as z. [L. abutor, abusus of ab and utor, to use.]", "v.t.").definition).toBeNull();
    // An etymology Webster left open.
    expect(splitHeading("<b>AL'TAR</b>, n. [L. altare, probably from the same root as altus, high.", "n.").definition).toBeNull();
    // And to the definition, where one follows.
    expect(splitHeading("<b>HOUSE</b>, v.t. houz. To cover from the inclemencies of the weather; to shelter.", "v.t.").definition).toBe(
      "To cover from the inclemencies of the weather; to shelter.",
    );
    expect(splitHeading("<b>IS</b>, v.i. iz. [L. est.] The third person singular of the substantive verb.", "v.i.").definition).toBe(
      "The third person singular of the substantive verb.",
    );
    expect(splitHeading("<b>ABU'SED</b>, pp. s as z. Ill-used; used to a bad purpose.", "pp.").definition).toBe("Ill-used; used to a bad purpose.");
    expect(splitHeading("<b>BEGUI'LE</b>, v.t. begi'le. [be and guile.] To delude; to deceive.", "v.t.").definition).toBe("To delude; to deceive.");
  });

  it("reads the word's forms as grammar until a bracket closes them", () => {
    expect(splitHeading("<b>HAVE</b>, v.t. hav. pret. and pp. had. Present, I have, thou hast, he has; we, ye, they, have. [L. habeo.]", "v.t.").definition).toBeNull();
    expect(splitHeading("<b>KNOW</b>, v.t. no. pret. knew; pp. known. [L. nosco, cognosco.]", "v.t.").definition).toBeNull();
    expect(splitHeading("<b>DO</b>, v.t. or auxiliary; pret. Did; pp. Done, pronounced dun. [G.]", "v.t.").definition).toBeNull();
    expect(splitHeading("<b>BE</b>, v.i. substantive, ppr.being; pp.been.[The sense is to stand, remain or be fixed.]", "v.i.").definition).toBeNull();
    expect(splitHeading("<b>BESPREAD'</b>, v.t. bespred'. pret. and pp. bespread. [be and spread.] To spread over; to cover over.", "v.t.").definition).toBe(
      "To spread over; to cover over.",
    );
    // The word a form is of ends the forms, and stays with the definition.
    expect(splitHeading("<b>HID'DEN</b>, pp. of hide. Concealed; placed in secrecy.", "pp.").definition).toBe("of hide. Concealed; placed in secrecy.");
    expect(splitHeading("<b>KEPT</b>, pret. and pp. of keep.", "pret.").definition).toBe("of keep.");
    // "or pp." is another part of speech, and "sing. and plu." a number.
    expect(splitHeading("<b>FEINT</b>, a. or pp. Counterfeit; seeming. [Not used.]", "a.").definition).toBe("Counterfeit; seeming. [Not used.]");
    expect(splitHeading("<b>SWINE</b>, n. sing. and plu. A hog.", "n.").definition).toBe("A hog.");
    expect(splitHeading("<b>CHOSE</b>, s as z, pret. and p. of choose.", null).definition).toBe("of choose.");
  });

  it("takes a part of speech in italics for a label", () => {
    expect(splitHeading("<b>SEARCE</b>, <i>v. t. sers.</i> To shift; to bolt. [<i>Little used.</i>]", "v.t.").definition).toBe(
      "To shift; to bolt. [<i>Little used.</i>]",
    );
    expect(splitHeading("<b>SE'CRET</b>, <i>v</i>. <i>t</i>. To keep private.", "v.t.").definition).toBe("To keep private.");
    expect(splitHeading("<b>FOR'MER</b>, a. <i>comparative</i> deg.", "a.").definition).toBeNull();
  });

  it("keeps a definition that begins in lower case", () => {
    expect(splitHeading("<b>ABLAC'TATE</b>, v.t. to wean from the breast. [Little used.]", "v.t.").definition).toBe("to wean from the breast. [Little used.]");
    expect(splitHeading("<b>ABOL'ISHED</b>, pp. annulled; repealed; abrogated, or destroyed.", "pp.").definition).toBe(
      "annulled; repealed; abrogated, or destroyed.",
    );
    // Not taking the part of speech "a." out of "an".
    expect(splitHeading("<b>ABORT'</b>, a. an abortion. [Not in use.]", "a.").definition).toBe("an abortion. [Not in use.]");
  });

  it("gives the numbered senses with what the quotations under each cite", () => {
    const { headword, senses, paragraphs } = websterSenses(PREVENT_VT.html, PREVENT_VT.pos);
    expect(headword).toBe("PREVENT'");
    expect(paragraphs).toBe(9);
    expect(senses.map((s) => paragraphText(s.html).slice(0, 2))).toEqual(["1.", "2.", "3.", "6."]);
    expect(senses[0].cites).toEqual(["Ps.119.147"]);
    expect(senses[1].cites).toEqual(["Job.30.27", "2Sam.22.1-2Sam.22.51"]);
    expect(senses[3].cites).toEqual([]);
    expect(senses[1].under.map(paragraphText)).toEqual(["The days of my affliction prevented me. Job.30.", "2 Sam.22."]);
    expect(senses[3].under).toEqual([]);
  });

  it("counts a definition on the heading line as the first sense", () => {
    const { senses } = websterSenses(LET_N.html, LET_N.pos);
    expect(senses).toHaveLength(1);
    expect(senses[0].inHeading).toBe(true);
    expect(senses[0].html).toMatch(/^A retarding; hinderance/);
  });

  it("takes the first paragraph that is more than a citation when nothing is numbered", () => {
    const { senses } = websterSenses(QUICK_VI.html, QUICK_VI.pos);
    expect(senses.map((s) => s.html)).toEqual(["To stir; to move. [Not in use.]"]);
    const citedFirst = '<p><b>WORD</b>, n.</p><p><a class="scripref" data-osis="Gen.1.1">Gen. 1</a>.</p><p>A thing said.</p>';
    expect(websterSenses(citedFirst, "n.").senses.map((s) => s.html)).toEqual(["A thing said."]);
  });

  it("gives the heading line as printed for an entry that is only a cross-reference", () => {
    expect(websterSenses("<p><b>ABAISANCE</b>, [See Obeisance.]</p>", null).senses).toEqual([
      { html: "[See Obeisance.]", cites: [], under: [], inHeading: true },
    ]);
    expect(websterSenses("<p><b>X</b></p>", null).senses).toEqual([]);
  });
});

describe("whether a citation is of the chapter being read", () => {
  const place = { book: "2Thess", chapter: 2 };
  it("compares book and chapter, a verse or a range", () => {
    expect(citesChapter("2Thess.2.1-2Thess.2.17", place)).toBe(true);
    expect(citesChapter("2Thess.2.7", place)).toBe(true);
    expect(citesChapter("2Thess.3.1-2Thess.3.18", place)).toBe(false);
    expect(citesChapter("1Thess.2.7", place)).toBe(false);
    expect(citesChapter("Acts.7.9-Acts.7.10", { book: "Acts", chapter: 7 })).toBe(true);
    expect(citesChapter("Acts.7.60-Acts.8.1", { book: "Acts", chapter: 8 })).toBe(true);
    expect(citesChapter("nonsense", place)).toBe(false);
  });
});

describe("what the word card shows before More", () => {
  it("shows the first two senses of the fullest entry when nothing cites the chapter", () => {
    const preview = websterPreview([PREVENT_VT, PREVENT_VI], null)!;
    expect(preview.entryIndex).toBe(0);
    expect(preview.headword).toBe("PREVENT'");
    expect(preview.senses.map((s) => paragraphText(s.html))).toEqual(["1. To go before; to precede.", "2. To precede, as something unexpected or unsought."]);
    expect(preview.senses.every((s) => !s.citesHere)).toBe(true);
    expect(preview.more).toBe(true);
  });

  it("marks the sense that cites the chapter being read", () => {
    const preview = websterPreview([PREVENT_VT, PREVENT_VI], { book: "Ps", chapter: 119 })!;
    expect(preview.senses.map((s) => s.citesHere)).toEqual([true, false]);
  });

  it("brings up the King James sense from further down when Webster cites the chapter for it", () => {
    // "Only he who now letteth will let": 2 Thessalonians 2:7.
    const preview = websterPreview([LET_VT, LET_VI, LET_N], { book: "2Thess", chapter: 2 })!;
    expect(preview.entryIndex).toBe(0);
    expect(preview.senses.map((s) => paragraphText(s.html).slice(0, 18))).toEqual(["1. To permit; to a", "5. To retard; to h"]);
    expect(preview.senses.map((s) => s.citesHere)).toEqual([false, true]);
  });

  it("chooses the entry that cites the chapter over the fullest, and the fullest over the first", () => {
    // "Who shall judge the quick and the dead": 2 Timothy 4:1.
    expect(websterPreview([QUICK_VI, QUICK_A], { book: "2Tim", chapter: 4 })!.entryIndex).toBe(1);
    expect(websterPreview([QUICK_VI, QUICK_A], null)!.entryIndex).toBe(1);
    const cites = websterPreview([QUICK_VI, QUICK_A], { book: "2Tim", chapter: 4 })!.senses;
    expect(cites[0].citesHere).toBe(true);
  });

  it("brings along the quotation that cites the chapter, where the sense's own line does not", () => {
    // QUICK's first sense ends "as quick flesh. Lev. 13."; 2 Timothy 4 is
    // cited by the quotation after it.
    const quick = websterPreview([QUICK_VI, QUICK_A], { book: "2Tim", chapter: 4 })!;
    expect(paragraphText(quick.senses[0].quote!)).toBe("The Lord Jesus Christ, who shall judge the quick and the dead. 2Tim. 4.");
    expect(quick.senses[1].quote).toBeNull();
    // Read in Leviticus 13, the sense's own line is the citation.
    expect(websterPreview([QUICK_VI, QUICK_A], { book: "Lev", chapter: 13 })!.senses[0]).toMatchObject({ citesHere: true, quote: null });
    // "I prevented the dawning of the morning": Psalm 119:147.
    const prevent = websterPreview([PREVENT_VT, PREVENT_VI], { book: "Ps", chapter: 119 })!;
    expect(paragraphText(prevent.senses[0].quote!)).toBe("I prevented the dawning of the morning, and cried. Ps.119.");
    // A citation on a line of its own is the quotation there is.
    const samuel = websterPreview([PREVENT_VT, PREVENT_VI], { book: "2Sam", chapter: 22 })!;
    expect(samuel.senses.map((s) => paragraphText(s.quote ?? ""))).toEqual(["", "2 Sam.22."]);
    // Nothing is cited, nothing is brought.
    expect(websterPreview([PREVENT_VT, PREVENT_VI], null)!.senses.every((s) => s.quote === null)).toBe(true);
  });

  it("opens a common word on its first real sense, not its pronunciation or its forms", () => {
    const house = {
      pos: "n.",
      html:
        "<p><b>HOUSE</b>, n. hous. [L. casa; Heb. to put on, to cover.]</p>" +
        "<p>1. In a general sense, a building or shed intended or used as a habitation.</p>" +
        "<p>2. An edifice or building appropriated to the worship of God; a temple.</p>",
    };
    expect(websterPreview([house], null)!.senses.map((s) => paragraphText(s.html).slice(0, 2))).toEqual(["1.", "2."]);
    const have = {
      pos: "v.t.",
      html:
        "<p><b>HAVE</b>, v.t. hav. pret. and pp. had. Present, I have, thou hast, he has; we, ye, they, have. [L. habeo.]</p>" +
        "<p>1. To possess; to hold in possession or power.</p>" +
        "<p>2. To possess, as something that is connected with, or belongs to one.</p>",
    };
    expect(paragraphText(websterPreview([have], null)!.senses[0].html)).toBe("1. To possess; to hold in possession or power.");
  });

  it("shows the matched word's own entries before another word the lookup brought in", () => {
    // "He saw": SAW's entries first, as the lookup orders them, though
    // SEE's verb says more; SEE only where Webster cites the chapter for it.
    const sawN = { key: "saw", pos: "n.", html: "<p><b>SAW</b>, n. [See the Verb.]</p><p>1. A cutting instrument.</p>" };
    const sawPret = { key: "saw", pos: "pret.", html: "<p><b>SAW</b>, pret. of see.</p>" };
    const see = {
      key: "see",
      pos: "v.t.",
      html:
        "<p><b>SEE</b>, v.t. pret. saw; pp. seen. [L. sequor.]</p><p>1. To perceive by the eye; to have knowledge of the existence and apparent qualities of objects.</p>" +
        '<p>I will now turn aside, and see this great sight. <a class="scripref" data-osis="Exod.3.1-Exod.3.22">Ex. 3</a>.</p>',
    };
    expect(websterPreview([sawPret, sawN, see], null, { prefer: "saw" })!.entryIndex).toBe(1);
    expect(websterPreview([sawPret, sawN, see], null)!.entryIndex).toBe(2);
    expect(websterPreview([sawPret, sawN, see], { book: "Exod", chapter: 3 }, { prefer: "saw" })!.entryIndex).toBe(2);
  });

  it("has nothing more to show for a one-line entry, and nothing at all for no entries", () => {
    const preview = websterPreview([LET_N], null)!;
    expect(preview.senses).toHaveLength(1);
    expect(preview.more).toBe(false);
    expect(websterPreview([LET_N, LET_VI], null)!.more).toBe(true);
    expect(websterPreview([], null)).toBeNull();
  });
});

describe("marking an entry's paragraphs", () => {
  it("marks the heading, the numbered senses and the paragraphs that cite Scripture", () => {
    const marked = markWebsterParagraphs(PREVENT_VT.html);
    expect(marked.startsWith("<p class=\"wb-head\"><b>PREVENT'</b>")).toBe(true);
    expect(marked).toContain('<p class="wb-sense">1. To go before; to precede.</p>');
    expect(marked).toContain('<p class="wb-quote">I prevented the dawning');
    expect(marked).toContain('<p class="wb-quote"><a class="scripref" data-osis="2Sam.22.1-2Sam.22.51">');
    expect(markWebsterParagraphs(QUICK_VI.html)).toBe('<p class="wb-head"><b>QUICK</b>, v.i.</p><p>To stir; to move. [Not in use.]</p>');
  });
});

describe("the other entries a lookup finds", () => {
  const entry = (id: number, key: string, pos: string | null, html: string) => ({ id, key, pos, html });
  const prevent = entry(1, "prevent", "v.t.", PREVENT_VT.html);
  const preventVi = entry(2, "prevent", "v.i.", PREVENT_VI.html);
  const prevented = entry(3, "prevented", "pp.", "<p><b>PREVENT'ED</b>, pp. Hindered from happening or taking effect.</p>");

  it("gives an entry's homographs", () => {
    const { homographs, formOf, related } = entryRelations(prevent, { matched: "prevent", via: "exact", entries: [prevent, preventVi] });
    expect(homographs.map((e) => e.id)).toEqual([2]);
    expect(formOf).toBeNull();
    expect(related).toEqual([]);
  });

  it("gives the word a participle is a form of, by its fullest entry", () => {
    const { homographs, formOf } = entryRelations(prevented, { matched: "prevent", via: "base", entries: [preventVi, prevent, prevented] });
    expect(homographs).toEqual([]);
    expect(formOf?.id).toBe(1);
  });

  it("gives any other word the lookup brought in", () => {
    const saw = entry(10, "saw", "n.", "<p><b>SAW</b>, n. A cutting instrument.</p>");
    const see = entry(11, "see", "v.t.", "<p><b>SEE</b>, v.t. pret. saw.</p><p>1. To perceive by the eye.</p>");
    const { homographs, formOf, related } = entryRelations(saw, { matched: "saw", via: "exact", entries: [saw, see] });
    expect(homographs).toEqual([]);
    expect(formOf).toBeNull();
    expect(related.map((e) => e.id)).toEqual([11]);
    expect(entryRelations(saw, null)).toEqual({ homographs: [], formOf: null, related: [] });
  });

  it("does not call a word of its own a form of the verb the lookup puts first", () => {
    // The KJV's "lent" is LEND's, so the lookup goes to LEND first; LENT the
    // fast is no form of it, but LENT, pp. is.
    const lend = entry(20, "lend", "v.t.", "<p><b>LEND</b>, v.t. pret. and pp. lent.</p><p>1. To grant to another for temporary use.</p>");
    const lentPp = entry(21, "lent", "pp.", "<p><b>LENT</b>, pp. of lend.</p>");
    const lentN = entry(22, "lent", "n.", "<p><b>LENT</b>, n.</p><p>The quadragesimal fast, or fast of forty days.</p>");
    const lookup = { matched: "lend", via: "base" as const, entries: [lend, lentPp, lentN] };
    const ofTheFast = entryRelations(lentN, lookup);
    expect(ofTheFast.formOf).toBeNull();
    expect(ofTheFast.related.map((e) => e.id)).toEqual([20]);
    expect(ofTheFast.homographs.map((e) => e.id)).toEqual([21]);
    expect(entryRelations(lentPp, lookup).formOf?.id).toBe(20);
  });
});

describe("whether an entry is a form of another word", () => {
  const e = (pos: string | null, html: string) => ({ pos, html });
  it("is, by its part of speech", () => {
    expect(isInflectionEntry(e("pp.", "<p><b>PREVENT'ED</b>, pp. Hindered.</p>"))).toBe(true);
    expect(isInflectionEntry(e("pret.", "<p><b>SPAKE</b>, pret. of speak.</p>"))).toBe(true);
    expect(isInflectionEntry(e("n.plu.", "<p><b>BRETH'REN</b>, n. plu. of brother.</p>"))).toBe(true);
  });

  it("is, by what its heading says", () => {
    expect(isInflectionEntry(e(null, "<p><b>'ART</b>, The second person, indicative mode, present tense, of the substantive veb am.</p>"))).toBe(true);
    expect(isInflectionEntry(e(null, "<p><b>WAST</b>, past tense of the substantive verb, in the second person.</p>"))).toBe(true);
    expect(isInflectionEntry(e(null, "<p><b>ARE</b>. The plural of the substantive verb.</p>"))).toBe(true);
    expect(isInflectionEntry(e("n.", "<p><b>FEET</b>, n. plu of foot. [See Foot.]</p>"))).toBe(true);
    expect(isInflectionEntry(e("v.i.", "<p><b>IS</b>, v.i. iz. [L. est.] The third person singular of the substantive verb.</p>"))).toBe(true);
  });

  it("is not, for a word of its own or a verb giving its own forms", () => {
    expect(isInflectionEntry(e("n.", "<p><b>'ART</b>, n. [L. ars, artis.]</p><p>1. The disposition of things by human skill.</p>"))).toBe(false);
    expect(isInflectionEntry(e("n.", "<p><b>SPOKE</b>, n. [G.]</p><p>1. The radius or ray of a wheel.</p>"))).toBe(false);
    expect(isInflectionEntry(e("v.i.", "<p><b>WILT</b>, v.i. [G., to fade.] To begin to wither.</p>"))).toBe(false);
    expect(isInflectionEntry(e("v.t.", "<p><b>HAVE</b>, v.t. hav. pret. and pp. had. [L. habeo.]</p>"))).toBe(false);
    expect(isInflectionEntry(e(null, "<p><b>BE</b>, a prefix, as in because, before, beset.</p>"))).toBe(false);
  });
});

describe("what Enter opens", () => {
  const entry = (id: number, key: string, length: number) => ({ id, key, html: "x".repeat(length) });
  it("is the headword typed, where Webster has it, by its fullest entry", () => {
    // LEND comes first in the lookup, for the KJV's "lent", and says more.
    const lent = { query: "lent", matched: "lend", entries: [entry(1, "lend", 1258), entry(2, "lent", 30), entry(3, "lent", 220)] };
    expect(websterEnterTarget(lent)).toBe(3);
  });

  it("is the key the lookup matched, where the word typed is not a headword", () => {
    const knoweth = { query: "knoweth", matched: "know", entries: [entry(4, "know", 300), entry(5, "know", 900)] };
    expect(websterEnterTarget(knoweth)).toBe(5);
    expect(websterEnterTarget({ query: "x", matched: "x", entries: [] })).toBeNull();
    expect(websterEnterTarget(null)).toBeNull();
  });

  it("takes the fullest of all when no key is asked for, or none is under it", () => {
    const entries = [entry(1, "a", 10), entry(2, "b", 30), entry(3, "a", 20)];
    expect(fullestIndex(entries)).toBe(1);
    expect(fullestIndex(entries, "a")).toBe(2);
    expect(fullestIndex(entries, "z")).toBe(1);
  });
});

describe("browsing", () => {
  const rows = (...keys: string[]) => keys.map((key, i) => ({ id: i + 1, key }));

  it("gives up the word a full page stops in, for the next page to show whole", () => {
    // The page ends with LET the verb transitive and intransitive; LET the
    // noun and the suffix are the next page's.
    const page = browsePage(rows("leaven", "leavened", "lecture", "let", "let"), "L", 5);
    expect(page.rows.map((r) => r.key)).toEqual(["leaven", "leavened", "lecture"]);
    expect(page.next).toBe("let");
    // Which starts at LET, and shows all four.
    const next = browsePage(rows("let", "let", "let", "let", "lethal"), "L", 5);
    expect(next.rows.map((r) => r.key)).toEqual(["let", "let", "let", "let"]);
    expect(next.next).toBe("lethal");
  });

  it("ends a letter where the list runs past it, or comes back short", () => {
    const runsOn = browsePage(rows("azure", "azymous", "b", "baa"), "A", 4);
    expect(runsOn.rows.map((r) => r.key)).toEqual(["azure", "azymous"]);
    expect(runsOn.next).toBeNull();
    // The last page of Z: all under Z, but short of a page. No "More".
    const end = browsePage(rows("zoophyte", "zootomy", "zymology"), "Z", 200);
    expect(end.rows).toHaveLength(3);
    expect(end.next).toBeNull();
    expect(browsePage([], "Q", 200)).toEqual({ rows: [], next: null });
  });

  it("goes on after a page that is all one word, rather than showing it again", () => {
    const page = browsePage(rows("sound", "sound", "sound"), "S", 3);
    expect(page.rows).toHaveLength(3);
    // After every SOUND, before SOUND-BOARD and SOUNDED.
    expect(page.next! > "sound").toBe(true);
    expect(page.next! < "sound-board").toBe(true);
    expect(page.next! < "sounded").toBe(true);
  });
});

describe("a headword fitted to a narrow column", () => {
  const runs = (text: string) => unbreakableRuns(text).map(([a, b]) => text.slice(a, b));

  it("breaks between words and after a hyphen, never at an accent mark", () => {
    expect(runs("TRANSUBSTANTIA'TION")).toEqual(["TRANSUBSTANTIA'TION"]);
    expect(runs("CRAW-FISH, CRAY-FISH")).toEqual(["CRAW-", "FISH,", "CRAY-", "FISH"]);
    expect(runs("  A  POSTERIORI ")).toEqual(["A", "POSTERIORI"]);
    expect(runs("")).toEqual([]);
  });

  it("is set smaller only as far as its longest word needs", () => {
    // CONVERSA'TION, about 150px at the text's size.
    expect(fitScale([150], 400)).toBe(1);
    expect(fitScale([150], 150)).toBe(1);
    expect(fitScale([150], 143)).toBeCloseTo(143 / 150);
    // The longest word decides, not the line: "CRAW-" and "FISH," fit.
    expect(fitScale([60, 55, 62, 50], 100)).toBe(1);
    expect(fitScale([60, 250], 200)).toBeCloseTo(0.8);
  });

  it("breaks a word after all rather than set it too small to read", () => {
    expect(fitScale([300], 60)).toBe(0.5);
    expect(fitScale([300], 60, 0.4)).toBe(0.4);
    // Nothing to fit, or no room measured yet.
    expect(fitScale([], 100)).toBe(1);
    expect(fitScale([150], 0)).toBe(1);
  });
});

describe("part-of-speech names", () => {
  it("writes out Webster's labels, and nothing for one it does not know", () => {
    expect(partOfSpeechName("v.t.")).toBe("verb transitive");
    expect(partOfSpeechName("ppr.")).toBe("participle present");
    expect(partOfSpeechName("zz.")).toBeNull();
    expect(partOfSpeechName(null)).toBeNull();
  });
});

function websterParagraph(html: string): string {
  return /<p>([\s\S]*?)<\/p>/.exec(html)![1];
}
