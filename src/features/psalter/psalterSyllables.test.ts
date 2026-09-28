import { describe, expect, it } from "vitest";
import { analyse, splitWord, syllables, variants } from "../../../tools/psalter-syllables.mjs";

// The syllable counter and divider the psalter is built with
// (tools/psalter-syllables.mjs). The count decides where each stanza's lines
// break -- a C.M. line is 8 or 6 syllables and nothing else -- and the
// division decides what sits under each note of the tune. These are the
// words that have gone wrong before: split in the middle of a syllable
// ("befo re", "rejo ice"), counted with their silent e ("themsel ves"), or
// with "th'" given a note of its own.

const counts = (word: string) => variants(word).map((v) => v.n);

describe("dividing the psalter's words for the notes", () => {
  it("divides at real syllable boundaries", () => {
    expect(splitWord("before", 2)).toEqual(["be", "fore"]);
    expect(splitWord("rejoice.", 2)).toEqual(["re", "joice."]);
    expect(splitWord("themselves,", 2)).toEqual(["them", "selves,"]);
    expect(splitWord("against", 2)).toEqual(["a", "gainst"]);
    expect(splitWord("always.", 2)).toEqual(["al", "ways."]);
    expect(splitWord("dwelling-place,", 3)).toEqual(["dwell", "ing-", "place,"]);
    expect(splitWord("tabernacles", 4)).toEqual(["tab", "er", "na", "cles"]);
  });

  it("does not sound a silent final e", () => {
    for (const word of ["place", "grace", "before", "rejoice", "themselves", "praise", "made"]) {
      expect(syllables(word), word).toBe(word === "before" || word === "rejoice" || word === "themselves" ? 2 : 1);
    }
  });

  it("gives th' no syllable of its own -- it is sung with the next word", () => {
    expect(syllables("th'")).toBe(0);
    expect(splitWord("th'", 0)).toEqual([]);
  });

  it("counts the book's elisions as the syllables they leave", () => {
    expect(syllables("I'll")).toBe(1);
    expect(syllables("heav'n")).toBe(1);
    expect(syllables("o'er")).toBe(1);
    expect(syllables("turn'd")).toBe(1);
    expect(syllables("en'mies")).toBe(2);
    expect(splitWord("en'mies", 2)).toEqual(["en'", "mies"]);
    expect(splitWord("deliv'rance", 3)).toEqual(["de", "liv'", "rance"]);
    expect(splitWord("Isr'el's", 2)).toEqual(["Is", "r'el's"]);
    expect(syllables("whate'er")).toBe(2);
  });

  it("counts possessives as the book says them", () => {
    expect(syllables("people's")).toBe(2);
    expect(syllables("foxes'")).toBe(2);
    expect(syllables("house's")).toBe(2);
    expect(syllables("house'")).toBe(1);
  });

  it("counts the words a rule of thumb gets wrong", () => {
    expect(syllables("lying")).toBe(2);
    expect(syllables("being")).toBe(2);
    expect(syllables("tongues")).toBe(1);
    expect(syllables("likewise")).toBe(2);
    expect(syllables("created")).toBe(3);
    expect(syllables("majesty")).toBe(3);
    expect(syllables("iniquity")).toBe(4);
  });

  it("offers the other lengths the book sings a word in, for the metre to choose", () => {
    expect(counts("salvation")).toEqual([3, 4]);
    expect(splitWord("salvation", 4)).toEqual(["sal", "va", "ti", "on"]);
    expect(counts("heaven")).toEqual([2, 1]);
    expect(counts("turned")).toEqual([1, 2]);
    expect(splitWord("turned", 2)).toEqual(["turn", "ed"]);
    expect(splitWord("destroyed", 3)).toEqual(["de", "stroy", "ed"]);
    expect(splitWord("righteous", 3)).toEqual(["right", "e", "ous"]);
    expect(counts("chariots")).toContain(2);
  });

  it("sings continually in four, as the book does every time", () => {
    expect(counts("continually")).toEqual([4, 5]);
    expect(splitWord("continually;", 4)).toEqual(["con", "tin", "ual", "ly;"]);
  });

  it("prices each lengthening by how often the book makes it", () => {
    const cost = (word: string, n: number, atEnd = false) => variants(word, atEnd).find((v) => v.n === n)!.cost;
    // A spelled-out -ed is all but always sounded (the book writes "'d"
    // where it is not), so it is the cheapest way to take a word long:
    // "Thy righteousness shall also be / de-clar-ed", not "right-e-ous-ness".
    expect(cost("declared", 3)).toBeLessThan(cost("righteousness", 4));
    expect(cost("praised", 2)).toBeLessThan(cost("salvation", 4, true));
    // -tion ending a line is sounded in two ("gen-er-a-ti-on"); inside a
    // line, rarely.
    expect(cost("salvation", 4, true)).toBeLessThan(cost("salvation", 4));
    expect(cost("compassion.", 4, true)).toBeLessThan(cost("gracious,", 3));
    // Only the length a word is taken at is priced by place: its usual
    // length costs nothing anywhere.
    expect(cost("salvation", 3, true)).toBe(0);
  });

  it("only offers a length the word can be divided into", () => {
    for (const word of ["us", "am", "fire", "prayer", "glorious", "tabernacle", "unfeignedly", "patience"]) {
      for (const { n } of variants(word)) expect(splitWord(word, n), `${word} in ${n}`).toHaveLength(n);
    }
  });

  it("keeps a word's own letters: the pieces join back into it", () => {
    for (const word of ["Jerusalem's", "loving-kindness,", "(my", "Sp'rit", "burnt-off'rings", "stretch'd-out"]) {
      const { pieces } = analyse(word);
      expect(splitWord(word, pieces.length).join(""), word).toBe(word);
    }
  });
});
