import { describe, expect, it } from "vitest";
import psalter from "../../../reference/psalter/scottish_metrical_1650.json";

// The metrical psalter as `npm run build:psalter` leaves it for the importer
// (tools/build-psalter.mjs). The text comes from two OCR scans, and these are
// the ways a scan's misreadings have reached the page before: a stanza printed
// under the wrong psalm, a verse number read as a word or a word as a verse
// number, and the line breaks -- which set the words under the notes --
// thrown out by either.

interface Line {
  text: string;
  marks: { verse: number; word: number }[];
  syllables: string[];
}
interface Setting {
  label: string | null;
  metre: string;
  pattern: number[];
  stanzas: { number: number; lines: Line[] }[] | null;
  printed: boolean;
  verses: [number, string][];
}
const PSALMS = psalter as unknown as { number: number; versions: Setting[] }[];

const setting = (psalm: number, index = 0) => PSALMS.find((p) => p.number === psalm)!.versions[index];
const sung = PSALMS.flatMap((p) => p.versions.filter((v) => v.stanzas).map((v) => ({ psalm: p.number, v })));
const marksOf = (v: Setting) => v.stanzas!.flatMap((s) => s.lines.flatMap((l) => l.marks.map((m) => m.verse)));
const lastVerse = (v: Setting) => marksOf(v)[marksOf(v).length - 1];

describe("the metrical psalter's text", () => {
  it("numbers every sung setting's verses from 1, each once and in order", () => {
    const wrong = sung.filter(({ v }) => marksOf(v).some((n, i) => n !== i + 1)).map(({ psalm, v }) => `${psalm} ${v.label ?? ""}`);
    expect(wrong).toEqual([]);
  });

  it("sings Psalm 2's verse 7 in Psalm 2, not at the end of Psalm 3", () => {
    const two = setting(2);
    expect(two.stanzas).toHaveLength(9);
    expect(two.stanzas![4].lines.map((l) => l.text)).toEqual([
      "The sure decree I will declare:",
      "The Lord hath said to me,",
      "Thou art mine only Son; this day",
      "I have begotten thee.",
    ]);
    expect(two.stanzas![4].lines[0].marks).toEqual([{ verse: 7, word: 0 }]);
    expect(lastVerse(setting(3))).toBe(8);
    expect(setting(3).stanzas).toHaveLength(5);
  });

  it("keeps an I that begins a line, rather than reading it as verse 1", () => {
    const three = setting(3).stanzas![1].lines;
    expect(three[2]).toMatchObject({ text: "I cry'd, and, from his holy hill,", marks: [{ verse: 4, word: 0 }] });
    expect(three[3].text).toBe("the Lord me answer made.");
    const confess = setting(32).stanzas!.flatMap((s) => s.lines).find((l) => l.text.includes("confess unto the Lord"));
    expect(confess).toMatchObject({ text: "I will confess unto the Lord", marks: [] });
  });

  it("reads verse numbers the scan set as letters, or ran onto a word", () => {
    const vow = setting(76).stanzas!.flatMap((s) => s.lines).find((l) => l.text.startsWith("Vow to the Lord"));
    expect(vow).toMatchObject({ text: "Vow to the Lord your God, and pay:", marks: [{ verse: 11, word: 0 }] });
    expect(lastVerse(setting(76))).toBe(12);
    expect(lastVerse(setting(32))).toBe(11);
  });

  it("leaves no digit, stray bracket, or misread I'll in the words that are sung", () => {
    const junk = sung.flatMap(({ psalm, v }) =>
      v.stanzas!.flatMap((s) => s.lines.filter((l) => /\d|[\]{}|]|\bl'll\b|\?\w/.test(l.text)).map((l) => `${psalm}: ${l.text}`)),
    );
    expect(junk).toEqual([]);
  });

  it("sings every setting, and every setting from the printed edition's lines", () => {
    // 150 psalms, and the 13 the book gives a second version ("Another of
    // the same"): 6, 25, 45, 50, 67, 70, 100, 102, 124, 136, 143, 145, 148.
    const settings = PSALMS.flatMap((p) => p.versions);
    expect(settings).toHaveLength(163);
    expect(settings.filter((v) => !v.stanzas)).toEqual([]);
    expect(settings.filter((v) => !v.printed).length).toBe(0);
  });

  it("sings Psalm 6's second version, which only the printed edition's scan has", () => {
    const six = PSALMS.find((p) => p.number === 6)!.versions;
    expect(six.map((v) => [v.label, v.metre])).toEqual([
      ["First Version", "L.M."],
      ["Second Version", "C.M."],
    ]);
    expect(six[1].stanzas).toHaveLength(9);
    expect(six[1].stanzas![0].lines.map((l) => l.text)).toEqual([
      "In thy great indignation,",
      "O Lord, rebuke me not;",
      "Nor on me lay thy chast'ning hand,",
      "in thy displeasure hot.",
    ]);
    expect(marksOf(six[1])).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("prints Psalm 69:4's second quatrain once, though both scans print it twice", () => {
    const sixtyNine = setting(69);
    expect(sixtyNine.stanzas).toHaveLength(33);
    const four = sixtyNine.verses.find(([n]) => n === 4)![1];
    expect(four.match(/They that would me destroy/g)).toHaveLength(1);
    expect(sixtyNine.stanzas![5].lines[0]).toMatchObject({ text: "Lord, thou my folly know'st, my sins", marks: [{ verse: 5, word: 0 }] });
  });

  it("breaks each line where its metre does, as the 1650 book does", () => {
    const stanza = (psalm: number, n: number, index = 0) => setting(psalm, index).stanzas![n - 1].lines.map((l) => l.text);
    expect(stanza(145, 1)).toEqual([
      "I'll thee extol, my God, O King;",
      "I'll bless thy name always.",
      "Thee will I bless each day, and will",
      "thy name for ever praise.",
    ]);
    expect(stanza(84, 1).slice(2)).toEqual(["The tabernacles of thy grace", "how pleasant, Lord, they be!"]);
    expect(stanza(51, 1).slice(2)).toEqual(["For thy compassions great, blot out", "all mine iniquity."]);
    expect(stanza(51, 2).slice(2)).toEqual(["For my transgressions I confess;", "my sin I ever see."]);
    expect(stanza(76, 4).slice(2)).toEqual(["Their horses and their chariots both", "were in a dead sleep cast."]);
    expect(stanza(21, 5)).toEqual([
      "In that salvation wrought by thee",
      "his glory is made great;",
      "Honour and comely majesty",
      "thou hast upon him set.",
    ]);
    expect(stanza(5, 4).slice(0, 2)).toEqual(["All that ill-doers are thou hat'st;", "Cutt'st off that liars be:"]);
  });

  it("breaks the couplets that fill the metre either way where the 1650 printing does", () => {
    // Each of these once broke a word early or late: "Thy righteousness
    // shall also / be declared", "Thou art my help and saviour, my / God".
    const couplet = (psalm: number, n: number, first: number, index = 0) =>
      setting(psalm, index).stanzas![n - 1].lines.slice(first - 1, first + 1).map((l) => l.text);
    expect(couplet(35, 25, 1)).toEqual(["Thy righteousness shall also be", "declared by my tongue;"]);
    expect(couplet(40, 19, 3)).toEqual(["Thou art my help and saviour,", "my God, no tarrying make."]);
    expect(couplet(55, 17, 3)).toEqual(["Yea, he shall cause the righteous man", "unmoved to remain."]);
    expect(couplet(70, 3, 3)).toEqual(["Let them who thy salvation love", "say still, God praised be."]);
    expect(couplet(70, 3, 3, 1)).toEqual(["Let them who thy salvation love", "say still, God praised be."]);
    expect(couplet(71, 7, 3)).toEqual(["And when my strength decayed is,", "then do not thou forsake me."]);
    expect(couplet(71, 11, 1)).toEqual(["But I with expectation", "will hope continually;"]);
    expect(couplet(72, 18, 1)).toEqual(["And blessed be his glorious name", "to all eternity:"]);
    expect(couplet(74, 4, 1)).toEqual(["To these long desolations", "thy feet lift, do not tarry;"]);
    expect(couplet(100, 4, 3, 1)).toEqual(["And to all generations", "his truth endureth ever."]);
    expect(couplet(109, 26, 3)).toEqual(["And let their own confusion", "them, as a mantle, cover."]);
    expect(couplet(111, 4, 3)).toEqual(["The Lord is gracious, and he is", "full of compassion."]);
    expect(couplet(118, 13, 3)).toEqual(["The Lord hath me chastised sore,", "but not to death giv'n over."]);
  });

  it("sings a feminine rhyme's extra syllable on the last note, not by running an earlier word together", () => {
    const notes = (psalm: number, n: number, line: number, index = 0) => setting(psalm, index).stanzas![n - 1].lines[line - 1].syllables;
    expect(notes(50, 22, 2, 1)).toEqual(["I", "will", "shew", "God's", "sal", "va", "tion"]);
    expect(notes(50, 22, 4, 1)).toEqual(["his", "life", "and", "con", "ver", "sa", "tion."]);
    expect(notes(71, 7, 2)).toEqual(["old", "age", "doth", "o", "ver", "take", "me;"]);
    expect(notes(111, 2, 4)).toEqual(["that", "doth", "there", "in", "take", "pleas", "ure."]);
    // "with shame be cloth-ed over / ... them, as a mantle, cover".
    expect(notes(109, 26, 2)).toEqual(["with", "shame", "be", "cloth", "ed", "o", "ver;"]);
  });

  it("sings a line-ending tabernacle as the book does, na-cle on the last note, not taber on one", () => {
    // The Free Church text marks "taber<u>nacle</u>" in all five lines.
    const notes = (psalm: number, n: number, line: number) => setting(psalm).stanzas![n - 1].lines[line - 1].syllables;
    expect(notes(76, 1, 3)).toEqual(["In", "Sa", "lem", "is", "his", "tab", "er", "na", "cle,"]);
    for (const [psalm, n, line] of [[27, 8, 1], [78, 23, 3], [78, 60, 1], [132, 5, 1]]) {
      expect(notes(psalm, n, line).slice(-4), `${psalm}:${n}`).toEqual(["tab", "er", "na", expect.stringMatching(/^cles?,?$/)]);
    }
  });

  it("keeps a second-person verb's stem whole", () => {
    const notes = (psalm: number, n: number, line: number) => setting(psalm).stanzas![n - 1].lines[line - 1].syllables;
    expect(notes(18, 33, 3).slice(1, 3)).toEqual(["gird", "edst"]);
    expect(notes(119, 37, 4).slice(1, 3)).toEqual(["caus", "edst"]);
    expect(notes(80, 9, 3).slice(1, 3)).toEqual(["caus", "edst"]);
    expect(notes(73, 14, 3).slice(5, 7)).toEqual(["cast", "edst"]);
    expect(notes(99, 3, 2).slice(1, 3)).toEqual(["set", "tlest"]);
  });

  it("brings every line to its metre, but for the book's own feminine endings", () => {
    // A handful of stanzas rhyme on an unstressed last syllable -- "to be my
    // King ap-point-ed", "had been my friend or bro-ther" -- and so run a
    // syllable long; Psalm 29:2's "And in the beauty of holiness" is nine in
    // both scans. Any other line off its metre is a word counted wrongly or a
    // line broken in the wrong place.
    const off = sung.flatMap(({ psalm, v }) =>
      v.stanzas!.flatMap((s) =>
        s.lines.flatMap((l, i) => (l.syllables.length === v.pattern[i] ? [] : [{ psalm, text: l.text, over: l.syllables.length - v.pattern[i] }])),
      ),
    );
    const feminine = /(er|ed|ess|ness|tion|ure|es|ies|ing|y|en|le|me)[.,;:!?]*$/;
    const unexplained = off.filter((o) => !(o.over === 1 && feminine.test(o.text)));
    expect(unexplained).toEqual([]);
    // About 90 lines: the Free Church of Scotland's text of the book marks 88
    // feminine endings, most of them in rhyming pairs ("never" / "ever").
    expect(off.length).toBeLessThan(100);
  });

  it("divides every word under the notes without losing a letter", () => {
    for (const { psalm, v } of sung) {
      for (const line of v.stanzas!.flatMap((s) => s.lines)) {
        expect(line.syllables.join("").replace(/\s/g, ""), `${psalm}: ${line.text}`).toBe(line.text.replace(/\s/g, ""));
        // "th'" is sung with the word after it, never on a note of its own.
        expect(line.syllables.filter((s) => /^th'$/i.test(s)), `${psalm}: ${line.text}`).toEqual([]);
      }
    }
    const three = setting(3).stanzas![1].lines[1];
    expect(three.syllables).toEqual(["th'up", "lift", "er", "of", "mine", "head."]);
    const hundred = setting(100).stanzas![0].lines[3];
    expect(hundred.syllables).toEqual(["Come", "ye", "be", "fore", "him", "and", "re", "joice."]);
  });

  it("mends the scan's misread letters and lower-cased names", () => {
    const text = sung.flatMap(({ v }) => v.stanzas!.flatMap((s) => s.lines.map((l) => l.text))).join("\n");
    for (const misread of ["I'U", "sHding", "aH:", "Isr'eFs", "judah", "LTpon", "Tord"]) expect(text).not.toContain(misread);
    // A capital inside a word is a misread letter ("shaU", "circHng").
    expect(text.match(/\b[a-z']+[A-Z][A-Za-z']*/g) ?? []).toEqual([]);
    // Words mended from the other scan keep that scan's case, not the
    // misread capital: "upon the street that lies", not "Lies".
    expect(text).toContain("upon the street that lies.");
    expect(text).toContain("God lives, bless'd be my Rock");
    // A misreading that happens to spell an English word gets past every
    // check but a correction: the scan's "|ust" for "Just" (Ps 119:84).
    expect(text).toContain("Just judgment on these wicked men");
    expect(text).not.toContain("Lust judgment");
    // Both scans print "thou / has made all men in vain" (Ps 89:47); the 1650
    // printing has "hast".
    expect(text).toContain("hast made all men in vain?");
    expect(text).not.toContain("has made all men");
  });

  it("reads, verse by verse, in the words it is sung in", () => {
    const words = (texts: string[]) => texts.join(" ").split(/\s+/).filter(Boolean);
    for (const { v } of sung.filter(({ v }) => v.printed)) {
      expect(words(v.verses.map(([, t]) => t))).toEqual(words(v.stanzas!.flatMap((s) => s.lines.map((l) => l.text))));
      expect(v.verses.map(([n]) => n)).toEqual(marksOf(v));
    }
  });
});
