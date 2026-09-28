import { describe, expect, it } from "vitest";
import { ordinalInWords, ordinalWord, speakNumerals } from "./speakNumerals";
import { speakReferences } from "./speakReferences";
import { toSourceIndex } from "./pronunciation";

const say = (text: string) => speakNumerals(text).spoken;

describe("speakNumerals", () => {
  it("says the numeral of a heading as a number, not 'Roman'", () => {
    expect(say("SERMON II.")).toBe("SERMON 2.");
    expect(say("CHAPTER IV. His Diary")).toBe("CHAPTER 4. His Diary");
    expect(say("Section XII. Of the Covenant.")).toBe("Section 12. Of the Covenant.");
    expect(say("Sermon II. Sinners in the Hands of an angry God.")).toBe("Sermon 2. Sinners in the Hands of an angry God.");
    expect(say("See vol. ii. p. 213, and chap. xiv.")).toBe("See vol. 2. page 213, and chap. 14.");
    expect(say("CHAPTER I")).toBe("CHAPTER 1");
  });

  it("says 'I' as One only where it is plainly a numeral", () => {
    expect(say("SERMON I.")).toBe("SERMON 1.");
    expect(say("Sermon I. A Divine and Supernatural Light")).toBe("Sermon 1. A Divine and Supernatural Light");
    expect(say("I. Show what this spiritual and divine light is.")).toBe("1. Show what this spiritual and divine light is.");
    for (const prose of [
      "I am the LORD.",
      "the book I read, and the letter I wrote",
      "And I John saw the holy city.",
      "It was I. Then he left.",
      "Then said the Book I would not open.",
    ]) {
      expect(say(prose)).toBe(prose);
    }
  });

  it("reads the heads of a sermon", () => {
    expect(say("II. How it is given immediately by God, and not obtained by natural means.")).toBe(
      "2. How it is given immediately by God, and not obtained by natural means.",
    );
    expect(say("by natural means. III. Show the truth of the doctrine.")).toBe("by natural means. 3. Show the truth of the doctrine.");
    expect(say("The first is (ii) a mark of grace.")).toBe("The first is (2) a mark of grace.");
    expect(say("iv. That they are now the objects of wrath.")).toBe("4. That they are now the objects of wrath.");
  });

  it("names numbered books and kings", () => {
    expect(say("as in II Kings and I Cor.")).toBe("as in Second Kings and First Cor.");
    expect(say("In the reign of Charles II, and of Henry VIII.")).toBe("In the reign of Charles the Second, and of Henry the Eighth.");
    expect(say("Leo X excommunicated Luther.")).toBe("Leo the Tenth excommunicated Luther.");
    expect(say("James II fled.")).toBe("James the Second fled.");
    expect(ordinalWord(23)).toBe("Twenty-third");
    expect(ordinalWord(30)).toBe("Thirtieth");
  });

  it("says a chapter after a book written out as a number", () => {
    expect(say("Luke XV is the chapter of the lost.")).toBe("Luke 15 is the chapter of the lost.");
    expect(say("Psalm CXIX")).toBe("Psalm 119");
  });

  it("leaves letters, initials and abbreviations alone", () => {
    for (const prose of [
      "See Appendix C and Part D.",
      "C. H. Spurgeon preached it.",
      "The civil power, i. e. the magistrate.",
      "He said so. i. e. he meant it.",
      "It is so. v. 12 says the same.",
      "I'll go, said the X-ray.",
      "Vitamin C.",
      "In II Kings",
    ]) {
      expect(say(prose)).toBe(prose.replace("In II Kings", "In Second Kings"));
    }
  });

  it("says the Latin headings of collected works as numbers", () => {
    // Were "X X X Roman" and "L X I".
    expect(say("VOLUMEN XXXIII.")).toBe("VOLUMEN 33.");
    expect(say("VOLUMEN LXI.")).toBe("VOLUMEN 61.");
    expect(say("Aug. de Civ. Dei, lib. xiv. cap. ii.")).toBe("Aug. de Civ. Dei, lib. 14. cap. 2.");
  });

  it("carries a list of numerals begun after a heading", () => {
    expect(say("Parts I and II of the work")).toBe("Parts 1 and 2 of the work");
    expect(say("See Chapters iv, v and vi.")).toBe("See Chapters 4, 5 and 6.");
    expect(say("Sermons II-IV")).toBe("Sermons 2-4");
    expect(say("Parts II and I.")).toBe("Parts 2 and 1.");
    // The pronoun after a list's comma stays the pronoun.
    expect(say("As in Chapter IV, and I think rightly.")).toBe("As in Chapter 4, and I think rightly.");
    expect(say("Section I and I think")).toBe("Section I and I think");
    expect(say("On the Lord's Day I and my family")).toBe("On the Lord's Day I and my family");
    // "I" begins a list when the next heading's numeral follows.
    expect(say("Volume I and Volume II")).toBe("Volume 1 and Volume 2");
    expect(say("in Part I or Part III.")).toBe("in Part 1 or Part 3.");
    // A king's numeral begins no list, but a king's line may begin with "I".
    expect(say("Henry VIII and I")).toBe("Henry the Eighth and I");
    expect(say("Charles I and Charles II both married")).toBe("Charles the First and Charles the Second both married");
    expect(say("said John I and Peter will go")).toBe("said John I and Peter will go");
  });

  it("reads a range between figures printed with a long dash", () => {
    expect(say("Bib. Repos. 20. pp. 356—381.")).toBe("Bib. Repos. 20. pages 356 to 381.");
    expect(say("Lydia is converted at Philippi, 13–15.")).toBe("Lydia is converted at Philippi, 13 to 15.");
    expect(say("VOLUMEN XXXIII. 1741 — 1742")).toBe("VOLUMEN 33. 1741 to 1742");
    // A dash that is punctuation stays.
    expect(say("in 1741—the year of the sermon")).toBe("in 1741—the year of the sermon");
    expect(say("the 3-5 of them")).toBe("the 3-5 of them");
  });

  it("says a page and pages in words", () => {
    // Were "P P three hundred".
    expect(say("Parts I and II, pp. 356—381.")).toBe("Parts 1 and 2, pages 356 to 381.");
    expect(say("See p. 12, and p.14; pp. ix, x.")).toBe("See page 12, and page 14; pages 9, 10.");
    // Not a "p." with no number after it, nor one inside a word.
    for (const prose of ["the letter p. Then", "Mr. P. Smith", "app. 3", "cp. 4"]) expect(say(prose)).toBe(prose);
  });

  it("says ordinals in figures as words", () => {
    // Were "eight tee-aitch", "one sent", "two dee".
    expect(say("Preached at Enfield, July 8th, 1741.")).toBe("Preached at Enfield, July eighth, 1741.");
    expect(say("1st. The being of God. 2d. His attributes. 3d. The Trinity.")).toBe(
      "first. The being of God. second. His attributes. third. The Trinity.",
    );
    expect(say("the 1st, 2nd, 3rd, 4th, 5th and 13th of May")).toBe("the first, second, third, fourth, fifth and thirteenth of May");
    expect(say("the 21st, 22d, 99th, 100th and 101st")).toBe("the twenty-first, twenty-second, ninety-ninth, one hundredth and one hundred and first");
    expect(say("the 11TH CHAPTER")).toBe("the eleventh CHAPTER");
    expect(say("the XVth century and the xiith chapter")).toBe("the fifteenth century and the twelfth chapter");
    expect(ordinalInWords(40)).toBe("fortieth");
    expect(ordinalInWords(1000)).toBe("one thousandth");
    expect(ordinalInWords(1215)).toBe("one thousand two hundred and fifteenth");
  });

  it("leaves figures that are not ordinals alone", () => {
    for (const prose of [
      "It cost 2s. 6d. and 2s. 2d. in all.",
      "£1 3d was the price.",
      "Printed in 8vo, 1741.",
      "a list of 3 things",
      "the 6d and the 1d",
      "the 11st",
      "the list and the lith",
      // A scan's "with" and "draweth", misread.
      "joint heirs xvith Christ, and he draw-cth up",
      "cried out %vith a loud voice",
    ]) {
      expect(say(prose)).toBe(prose);
    }
  });

  it("maps a place in the spoken text back to the printed one", () => {
    const ordinal = "July 8th, 1741";
    const said = speakNumerals(ordinal);
    expect(toSourceIndex(said.chunks!, said.spoken.indexOf("1741"))).toBe(ordinal.indexOf("1741"));
    expect(toSourceIndex(said.chunks!, said.spoken.indexOf("eighth"))).toBe(ordinal.indexOf("8th"));

    const text = "SERMON XII. Of the Covenant";
    const { spoken, chunks } = speakNumerals(text);
    expect(spoken).toBe("SERMON 12. Of the Covenant");
    expect(toSourceIndex(chunks!, spoken.indexOf("Covenant"))).toBe(text.indexOf("Covenant"));
    expect(toSourceIndex(chunks!, spoken.indexOf("12"))).toBe(text.indexOf("XII"));
  });

  it("follows the references, whose numerals are already numbers", () => {
    const refs = speakReferences("Sermon II. On John viii. 23.");
    expect(say(refs.spoken)).toBe("Sermon 2. On John 8, verse 23.");
    expect(speakNumerals("Jesus wept.")).toEqual({ spoken: "Jesus wept.", chunks: null });
  });
});
