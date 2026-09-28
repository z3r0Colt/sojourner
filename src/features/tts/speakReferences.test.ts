import { describe, expect, it } from "vitest";
import { romanToNumber, speakReferences } from "./speakReferences";
import { toSourceIndex } from "./pronunciation";

const say = (text: string) => speakReferences(text).spoken;

describe("romanToNumber", () => {
  it("reads chapter numerals and refuses the malformed", () => {
    expect(romanToNumber("viii")).toBe(8);
    expect(romanToNumber("lxvi")).toBe(66);
    expect(romanToNumber("xxxii")).toBe(32);
    expect(romanToNumber("cxix")).toBe(119);
    expect(romanToNumber("iiii")).toBeNull();
    expect(romanToNumber("vx")).toBeNull();
    expect(romanToNumber("civil")).toBeNull();
  });
});

describe("speakReferences", () => {
  it("says a Roman chapter as a number and the verses as verses", () => {
    expect(say("from thence he is, John viii. 23. “Ye are from beneath,”")).toBe("from thence he is, John 8, verse 23. “Ye are from beneath,”");
    expect(say("See Isa. lxvi. 23, 24.")).toBe("See Isaiah 66, verses 23 and 24.");
    expect(say("Isa. xxxii. 12-14.")).toBe("Isaiah 32, verses 12 to 14.");
    expect(say("Luke xiii. 7.")).toBe("Luke 13, verse 7.");
  });

  it("reads numbered books and modern references", () => {
    expect(say("1 Cor. xv. 22")).toBe("First Corinthians 15, verse 22");
    expect(say("I John iv. 8")).toBe("First John 4, verse 8");
    expect(say("save him, Ro 8:28-30.")).toBe("save him, Romans 8, verses 28 to 30.");
    expect(say("Gen. 1:1")).toBe("Genesis 1, verse 1");
    expect(say("Ps. 119.")).toBe("Psalm 119.");
  });

  it("reads Barnes's short forms of the books", () => {
    // As tauri-dev.log had the voice read them: "one Joe two fifteen".
    expect(say("Comp. Jas 4:4; 1 Jo 2:15.")).toBe("Comp. James 4, verse 4; First John 2, verse 15.");
    expect(say("He 12:2")).toBe("Hebrews 12, verse 2");
    expect(say("1 Co 13:4, and 2 Co 5:17")).toBe("First Corinthians 13, verse 4, and Second Corinthians 5, verse 17");
    expect(say("1 Th 5:17; 1 Pe 1:3; Re 22:20")).toBe("First Thessalonians 5, verse 17; First Peter 1, verse 3; Revelation 22, verse 20");
    expect(say("Mat 5:3; Mr 1:1; Lu 2:14; Joh 3:16")).toBe("Matthew 5, verse 3; Mark 1, verse 1; Luke 2, verse 14; John 3, verse 16");
    expect(say("Php 4:13; Col 3:1; Ga 2:20; Eph 2:8")).toBe("Philippians 4, verse 13; Colossians 3, verse 1; Galatians 2, verse 20; Ephesians 2, verse 8");
    expect(say("Joe 2:28; 1 Ch 16:34")).toBe("Joel 2, verse 28; First Chronicles 16, verse 34");
    // The topical Bibles set the number close up, and space their commas.
    expect(say("1Sa 5:3 , 4 ; 2Ki 4:1")).toBe("First Samuel 5, verses 3 and 4 ; Second Kings 4, verse 1");
    expect(say("Matth. 3. 11")).toBe("Matthew 3, verse 11");
    expect(say("sin not, Ep 4:26. This anger")).toBe("sin not, Ephesians 4, verse 26. This anger");
    expect(say('Comp. Ph 1:6. See Barnes "Act 1:24". (Hebrew 4:13,) (1 Chronicle 15:21)')).toBe(
      'Comp. Philippians 1, verse 6. See Barnes "Acts 1, verse 24". (Hebrews 4, verse 13,) (First Chronicles 15, verse 21)',
    );
    expect(say("Act 3, Scene 2, of the Hebrew. 3 words")).toBe("Act 3, Scene 2, of the Hebrew. 3 words");
  });

  it("finds a numbered book after a word that could have been a book", () => {
    // "See 1" and "Comp. 1" were taken for a book called See or Comp, chapter
    // 1, and "Co" and "Ti" were then left without their number.
    expect(say("See 1 Co 15:1-4; 2 Ti 1:8.")).toBe("See First Corinthians 15, verses 1 to 4; Second Timothy 1, verse 8.");
    expect(say("Comp. 1 Ti 6:21; 2 Ti 2:18.")).toBe("Comp. First Timothy 6, verse 21; Second Timothy 2, verse 18.");
    expect(say("In 2 Co 6:7, it is called")).toBe("In Second Corinthians 6, verse 7, it is called");
    expect(say("Ro 8:28, 2 Co 5:1")).toBe("Romans 8, verse 28, Second Corinthians 5, verse 1");
  });

  it("reads the books named in full, however long, and the Apocrypha", () => {
    expect(say("(2 Thessalonians 1:6-8.)")).toBe("(Second Thessalonians 1, verses 6 to 8.)");
    expect(say("(1 Maccabees 1:41; 2 Mac. 15:39). Tobit 3:17")).toBe("(First Maccabees 1, verse 41; Second Maccabees 15, verse 39). Tobit 3, verse 17");
    expect(say("Wisdom 16:12. Thomas")).toBe("Wisdom 16, verse 12. Thomas");
    expect(say("Psalm 119:47*")).toBe("Psalm 119, verse 47*");
    // Words and names that are books only with a verse.
    expect(say("Wisdom 3 times over; Cyprian, Ep. 63; old Mac 4")).toBe("Wisdom 3 times over; Cyprian, Ep. 63; old Mac 4");
  });

  it("takes a figure before a book in one part for a list's number", () => {
    expect(say("1. Gen. 3:15 is the first promise.")).toBe("1. Genesis 3, verse 15 is the first promise.");
    expect(say("friend So-and-So. I shall stay")).toBe("friend So-and-So. I shall stay");
  });

  it("reads the further chapters of a chain under the book named first", () => {
    // Was "Galatians 2, verse 19; five:one".
    expect(say('{g} "free from the law" Ga 2:19; 5:1.')).toBe('{g} "free from the law" Galatians 2, verse 19; 5, verse 1.');
    expect(say("Heb 11:1; 12:2")).toBe("Hebrews 11, verse 1; 12, verse 2");
    expect(say("Ro 8:28, 11:29")).toBe("Romans 8, verse 28, 11, verse 29");
    expect(say("Isa. xl. 3; lxi. 1-3.")).toBe("Isaiah 40, verse 3; 61, verses 1 to 3.");
    // The chain's last figure is not the next reference's book number.
    expect(say("Ga 2:19; 5:1. Matt. v. 3—12")).toBe("Galatians 2, verse 19; 5, verse 1. Matthew 5, verses 3 to 12");
    expect(say("Ga 2:19; 5:1 John 3:16")).toBe("Galatians 2, verse 19; 5, verse 1; John 3, verse 16");
    // After a whole psalm, and with nothing but a space between, as the
    // Treasury prints them.
    expect(say("Ps 29; 104:3; 18:10.")).toBe("Psalm 29; 104, verse 3; 18, verse 10.");
    // A space alone is said as a semicolon's pause: "verse 40 18, verse 17"
    // was heard as "verse forty-eighteen".
    expect(say("Ge 24:40 18:17. God doth")).toBe("Genesis 24, verse 40; 18, verse 17. God doth");
    expect(say("Ec 3:14-15,18 Ho 9:13 12:3, his")).toBe("Ecclesiastes 3, verses 14 to 15 and 18; Hosea 9, verse 13; 12, verse 3, his");
    // Henry's Roman chapters, after a comma too -- but not his "v. 12".
    expect(say("Neh. viii. 9, x. 1, and who")).toBe("Nehemiah 8, verse 9, 10, verse 1, and who");
    expect(say("John i. 3, v. 12")).toBe("John 1, verse 3, verse 12");
    // A bare chapter and verse with no book before it is left as it was.
    expect(say("at 5:1 in the morning")).toBe("at 5:1 in the morning");
  });

  it("reads a reference inside quotation marks", () => {
    expect(say('See Barnes "Ro 7:23"')).toBe('See Barnes "Romans 7, verse 23"');
    expect(say("(see “Ro 7:23”)")).toBe("(see “Romans 7, verse 23”)");
  });

  it("reads a range printed with an en or em dash as verses", () => {
    expect(say("Matt. v. 3—12")).toBe("Matthew 5, verses 3 to 12");
    expect(say("Rom. 8. 28—30.")).toBe("Romans 8, verses 28 to 30.");
    expect(say("Ro 8:28–30")).toBe("Romans 8, verses 28 to 30");
    expect(say("as in vv. 3—5, and v. 12.")).toBe("as in verses 3 to 5, and verse 12.");
    expect(say("ver. 7 and verses 28—30")).toBe("verse 7 and verses 28 to 30");
    expect(say("verse 12 says")).toBe("verse 12 says");
    // A dash between figures that are not verses is left to the numerals.
    expect(say("pp. 356—381")).toBe("pp. 356—381");
  });

  it("reads a range that runs on into another chapter", () => {
    // JFB's and Barnes's whole sections: was "Jeremiah 3, verses 6 to 6:30".
    expect(say("Jer 3:6-6:30, is a new discourse")).toBe("Jeremiah 3, verse 6, to chapter 6, verse 30, is a new discourse");
    expect(say("{l} Ac 24:1-25:27 Verses 19,20.")).toBe("{l} Acts 24, verse 1, to chapter 25, verse 27 Verses 19 and 20.");
    expect(say("(Heb 7:26-9:12; 9:13-10:18)")).toBe("(Hebrews 7, verse 26, to chapter 9, verse 12; 9, verse 13, to chapter 10, verse 18)");
  });

  it("reads Henry's chapters of the book in hand", () => {
    expect(say("till after the flood, ch. ix. 3. And before")).toBe("till after the flood, chapter 9, verse 3. And before");
    expect(say("ch. 5. 3-5. The more patience")).toBe("chapter 5, verses 3 to 5. The more patience");
    expect(say("(ch. 43.), orders concerning")).toBe("(chapter 43.), orders concerning");
    expect(say("as he did them to Job, chap. xlii. 8")).toBe("as he did them to Job, chapter 42, verse 8");
    expect(say("Chap. iii. 4, “For every house")).toBe("Chapter 3, verse 4, “For every house");
    expect(say("( ch. 4:11 ): “If any man")).toBe("( chapter 4, verse 11 ): “If any man");
    expect(say("CHAP. IV.")).toBe("CHAPTER 4.");
    // Written out, with a colon's verse.
    expect(say("Hebrews Chapter 6:16-20")).toBe("Hebrews Chapter 6, verses 16 to 20");
    expect(say("this point (chapter 15:15; 4:18; 25:5.) Not")).toBe("this point (chapter 15, verse 15; 4, verse 18; 25, verse 5.) Not");
    expect(say("In chapter 3. 5 men went up.")).toBe("In chapter 3. 5 men went up.");
    // "ch. v." is a chapter, in Roman numerals, and its "v." no verse.
    expect(say("see ch. v. 3")).toBe("see chapter 5, verse 3");
    // Chapters six and seven, not a verse.
    expect(say("sin, chap. 6,7. In chap. 8. he had")).toBe("sin, chapter 6,7. In chapter 8. he had");
    // The chain goes on under the chapter: "ch. xiv. 2, xix. 18-20".
    expect(say("called Bela, ch. xiv. 2, xix. 18-20.")).toBe("called Bela, chapter 14, verse 2, 19, verses 18 to 20.");
  });

  it("leaves prose alone", () => {
    for (const prose of [
      "I am 3 years old.",
      "He put a Mark 3 inches long.",
      "Chapter VIII begins here.",
      "Henry VIII was king.",
      "It is 40 miles, see vol. 2.",
      "the civil power",
      "In 1689 the Confession was printed.",
      "Numbers 3 and 4 are even.",
      "He 3 times denied him.",
      "So 5 men went up.",
      "Mr. Co 16 of the book.",
      "Joe 3 was his number.",
      "Mr. Smith and Co. 12 of them.",
    ]) {
      expect(say(prose)).toBe(prose);
    }
  });

  it("maps a chain back to the printed text", () => {
    const text = "Ga 2:19; 5:1 says";
    const { spoken, chunks } = speakReferences(text);
    expect(toSourceIndex(chunks!, spoken.indexOf("says"))).toBe(text.indexOf("says"));
    expect(toSourceIndex(chunks!, spoken.indexOf("5, verse 1"))).toBe(text.indexOf("5:1"));
  });

  it("maps a place in the spoken text back to the printed one", () => {
    const text = "as John viii. 23 says";
    const { spoken, chunks } = speakReferences(text);
    expect(chunks).not.toBeNull();
    // "says" is after the reference in both.
    const spokenSays = spoken.indexOf("says");
    expect(toSourceIndex(chunks!, spokenSays)).toBe(text.indexOf("says"));
    // Anywhere inside the rewritten reference lands on its start.
    expect(toSourceIndex(chunks!, spoken.indexOf("verse"))).toBe(text.indexOf("John"));
  });

  it("passes text with no references through untouched", () => {
    expect(speakReferences("Jesus wept.")).toEqual({ spoken: "Jesus wept.", chunks: null });
  });
});
