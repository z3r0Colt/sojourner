import { describe, expect, it } from "vitest";
import { cleanForSpeech, hasSpeakableText, splitForSpeech, SPEECH_PIECE_CHARS } from "./textUtils";

describe("cleanForSpeech", () => {
  it("takes out characters that take up no room", () => {
    expect(cleanForSpeech("grace\u200b and\u00ad peace\ufeff")).toBe("grace and peace");
    expect(cleanForSpeech("Jeho\u200dvah")).toBe("Jehovah");
  });

  it("takes out rules and leaders but keeps an ellipsis and a single dash", () => {
    expect(cleanForSpeech("CHAPTER I ---------- Of God")).toBe("CHAPTER I Of God");
    expect(cleanForSpeech("Contents . . . . . . 12")).toBe("Contents 12");
    expect(cleanForSpeech("Preface.........iv")).toBe("Preface iv");
    expect(cleanForSpeech("the end * * * Part two")).toBe("the end Part two");
    expect(cleanForSpeech("the name of —— was")).toBe("the name of was");
    expect(cleanForSpeech("and so... he went")).toBe("and so... he went");
    expect(cleanForSpeech("faith—that is, trust—is")).toBe("faith—that is, trust—is");
  });

  it("takes out a commentary's note markers in braces, and keeps a word set in them", () => {
    expect(cleanForSpeech('{n} "Say not in thine heart" De 30:12-14')).toBe('"Say not in thine heart" De 30:12-14');
    expect(cleanForSpeech('{+} "truly", or "indeed"\n{++} "Ghost", or "Spirit" {u2} {*}')).toBe('"truly", or "indeed" "Ghost", or "Spirit"');
    expect(cleanForSpeech("{b} {wive's} Tit 1:14 {*} {fables}")).toBe("wive's Tit 1:14 fables");
  });

  it("makes the spacing plain", () => {
    expect(cleanForSpeech("  In the\n\nbeginning\t God ")).toBe("In the beginning God");
  });
});

describe("hasSpeakableText", () => {
  it("says no to Greek alone and to punctuation alone", () => {
    expect(hasSpeakableText("ἐν ἀρχῇ ἦν ὁ λόγος")).toBe(false);
    expect(hasSpeakableText("— — —")).toBe(false);
    expect(hasSpeakableText("λόγος, the Word")).toBe(true);
    expect(hasSpeakableText("1689")).toBe(true);
  });
});

describe("splitForSpeech", () => {
  it("keeps a short passage whole", () => {
    expect(splitForSpeech("Jesus wept.")).toEqual(["Jesus wept."]);
  });

  it("cuts a long paragraph at sentence ends, every piece within the limit", () => {
    const sentence = "The grace of God is the fountain of every blessing that a believer enjoys in this life and in the next. ";
    const text = sentence.repeat(40);
    const pieces = splitForSpeech(text);
    expect(pieces.length).toBeGreaterThan(5);
    for (const piece of pieces) {
      expect(piece.length).toBeLessThanOrEqual(SPEECH_PIECE_CHARS);
      expect(piece.endsWith(".")).toBe(true);
    }
    expect(pieces.join(" ")).toBe(text.trim());
  });

  it("does not break after an abbreviation, an initial, or before a reference", () => {
    const text = "See Rom. 8. 28, and cf. ch. 4 of J. Calvin on the point. Then read on.";
    expect(splitForSpeech(text, 60)).toEqual(["See Rom. 8. 28, and cf. ch. 4 of J. Calvin on the point.", "Then read on."]);
  });

  it("breaks at a semicolon or colon followed by a space, never inside 3:16", () => {
    const text = "For God so loved the world, as John 3:16 says; that he gave his only begotten Son: that whosoever believeth.";
    const pieces = splitForSpeech(text, 50);
    expect(pieces[0]).toBe("For God so loved the world, as John 3:16 says;");
    expect(pieces.join(" ")).toBe(text);
  });

  it("keeps a list's number with the sentence it numbers", () => {
    const text =
      "They are always exposed to fall suddenly, as he that walks in slippery places is every moment liable to his foot sliding. 2. They are liable to be suddenly destroyed without warning. 3. Another thing implied is, that they are liable to fall of themselves.";
    const pieces = splitForSpeech(text, 130);
    expect(pieces).toEqual([
      "They are always exposed to fall suddenly, as he that walks in slippery places is every moment liable to his foot sliding.",
      "2. They are liable to be suddenly destroyed without warning.",
      "3. Another thing implied is, that they are liable to fall of themselves.",
    ]);
    // The heads of a sermon, in Roman numerals, likewise.
    expect(splitForSpeech("the doctrine. II. How it is given. III. Show the truth of it.", 30)).toEqual([
      "the doctrine.",
      "II. How it is given.",
      "III. Show the truth of it.",
    ]);
    // A reference printed with stops is not a list.
    expect(splitForSpeech("As in John iii. 16. For God so loved the world.", 20)[0]).not.toBe("As in John iii.");
    // But a point's number after the reference that ends a sentence is the
    // next point's, not the verse's -- nor, after "Rom. 8.", is the verse a
    // point.
    expect(splitForSpeech("even as the fool. Eccl. ii. 16. 9. All wicked men's pains.", 30)).toEqual([
      "even as the fool.",
      "Eccl. ii. 16.",
      "9. All wicked men's pains.",
    ]);
    expect(splitForSpeech("even as the fool, Eccl. 2:16. 9. All wicked men's pains.", 30)).toEqual([
      "even as the fool, Eccl. 2:16.",
      "9. All wicked men's pains.",
    ]);
    expect(splitForSpeech("See Rom. 8. 28. For we know that all things work together.", 30)[0]).toBe("See Rom. 8. 28.");
  });

  it("reads a sentence at a time when asked, a short one going with the one before", () => {
    const text = "How dieth the wise man? even as the fool. Eccl. ii. 16. And another sentence that is quite long enough. Selah.";
    expect(splitForSpeech(text, 400, { bySentence: true })).toEqual([
      "How dieth the wise man? even as the fool. Eccl. ii. 16.",
      "And another sentence that is quite long enough. Selah.",
    ]);
    expect(splitForSpeech(text)).toEqual([text]);
  });

  it("cuts only a sentence too long for one piece at a semicolon, so pieces start where sentences do", () => {
    const text = "He that believeth is not condemned; but he that believeth not is condemned already. And this is the condemnation.";
    // Room for the first sentence whole: it is not cut at its semicolon.
    expect(splitForSpeech(text, 90)).toEqual([
      "He that believeth is not condemned; but he that believeth not is condemned already.",
      "And this is the condemnation.",
    ]);
    // A sentence longer than a piece is cut at its semicolon rather than a comma.
    expect(splitForSpeech("Their foot shall slide in due time, as he that walks; he is liable to fall, and so on.", 60)[0]).toBe(
      "Their foot shall slide in due time, as he that walks;",
    );
  });

  it("cuts a sentence with no stops at a comma or space, and a run with no space at the limit", () => {
    const long = Array.from({ length: 120 }, (_, i) => `word${i}`).join(" ");
    for (const piece of splitForSpeech(long, 100)) expect(piece.length).toBeLessThanOrEqual(100);
    const unbroken = "x".repeat(950);
    const pieces = splitForSpeech(unbroken, 400);
    expect(pieces.map((p) => p.length)).toEqual([400, 400, 150]);
  });

  it("leaves out a piece with nothing to say", () => {
    expect(splitForSpeech("ἐν ἀρχῇ ἦν ὁ λόγος.")).toEqual([]);
    expect(splitForSpeech("-----")).toEqual([]);
  });

  it("gets through a whole book's worth of text in one pass", () => {
    const text = "In the beginning was the Word, and the Word was with God. ".repeat(40_000);
    const started = performance.now();
    const pieces = splitForSpeech(text);
    expect(performance.now() - started).toBeLessThan(3000);
    expect(pieces.length).toBeGreaterThan(1000);
  });
});
