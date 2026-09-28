import { describe, expect, it } from "vitest";
import { breakLine, fitLyrics, spaceLyrics, TIE, wordEnds, type NoteReach } from "./fitLyrics";

describe("setting a line's syllables under a tune line's notes", () => {
  it("puts one syllable under each note", () => {
    expect(fitLyrics(["All", "peo", "ple", "that"], 4)).toEqual({ under: ["All", "peo", "ple", "that"], carried: 0 });
  });

  it("carries a feminine ending onto the last note rather than dropping it", () => {
    // Psalm 2: "to be my King ap-point-ed;" -- seven syllables on six notes.
    const fitted = fitLyrics(["to", "be", "my", "King", "ap", "point", "ed;"], 6);
    expect(fitted.under).toEqual(["to", "be", "my", "King", "ap", `point${TIE}ed;`]);
    expect(fitted.carried).toBe(1);
  });

  it("keeps every syllable of a line however far it overruns", () => {
    const fitted = fitLyrics(["th'up", "lift", "er", "of", "mine", "head."], 4);
    expect(fitted.under.join(" ").split(new RegExp(`[ ${TIE}]`))).toEqual(["th'up", "lift", "er", "of", "mine", "head."]);
    expect(fitted.carried).toBe(2);
  });

  it("leaves a note bare where the line runs short", () => {
    expect(fitLyrics(["O", "Lord"], 3)).toEqual({ under: ["O", "Lord", undefined], carried: 0 });
  });
});

describe("where a line's words begin and end", () => {
  it("marks the syllables that end a word, so the rest take a hyphen", () => {
    expect(wordEnds(["Thou", "gird", "edst", "me"], "Thou girdedst me")).toEqual([true, false, true, true]);
    // "th'up-lift-er": two words run together on one note.
    expect(wordEnds(["th'up", "lift", "er", "of"], "th' uplifter of")).toEqual([false, false, true, true]);
    // A compound's own hyphen stands in for one.
    expect(wordEnds(["dwell", "ing-", "place,"], "dwelling-place,")).toEqual([false, true, true]);
  });

  it("takes every syllable as a word where they do not spell the text", () => {
    expect(wordEnds(["a", "b"], "something else")).toEqual([true, true]);
  });
});

describe("spacing the notes so their words never collide", () => {
  it("keeps the usual spacing where the words are short", () => {
    expect(spaceLyrics([34, 34, 34], [{ width: 10 }, { width: 10 }, { width: 10 }], [7, 7, 7])).toEqual([0, 34, 68]);
  });

  it("moves a note along, and the notes after it, when the words would touch", () => {
    // "thou brought'st down": the long middle word needs more than a slot.
    const at = spaceLyrics([34, 34, 34], [{ width: 20 }, { width: 50 }, { width: 25 }], [7, 7, 7]);
    const edges = [20, 50, 25].map((w, i) => [at[i] - w / 2, at[i] + w / 2]);
    for (let i = 1; i < edges.length; i++) expect(edges[i][0] - edges[i - 1][1]).toBeGreaterThanOrEqual(7);
    expect(at[1] - at[0]).toBeGreaterThan(34);
  });

  it("keeps a carried lyric, which runs on to the right of its note, clear of the one before", () => {
    const at = spaceLyrics([34, 34], [{ width: 40 }, { width: 60, left: 6 }], [11, 7]);
    expect(at[1] - 6 - (at[0] + 20)).toBeGreaterThanOrEqual(11);
  });

  it("leaves a note with no word its slot, and still keeps the next word clear", () => {
    const at = spaceLyrics([34, 34, 34], [{ width: 80 }, null, { width: 80 }], [7, 7, 7]);
    expect(at[1]).toBe(34);
    expect(at[2] - 40 - (at[0] + 40)).toBeGreaterThanOrEqual(7);
  });
});

describe("breaking a line too wide for its pane into systems", () => {
  // Eight notes a slot of 34 apart, each reaching from its own start to the
  // end of its slot: a system of k notes is 34k wide.
  const even = (n: number): NoteReach[] => Array.from({ length: n }, (_, i) => ({ from: i * 34, to: (i + 1) * 34 }));
  const words = (n: number) => Array.from({ length: n }, () => true);
  const systems = (reach: NoteReach[], starts: number[]) =>
    starts.map((a, k) => {
      const b = starts[k + 1] ?? reach.length;
      return Math.max(...reach.slice(a, b).map((r) => r.to)) - reach[a].from;
    });

  it("leaves a line that fits whole", () => {
    expect(breakLine(even(8), 8 * 34, words(8))).toEqual([0]);
  });

  it("breaks into as few systems as fit, evenly rather than greedily", () => {
    // Seven would fit on the first; four and four is the better page.
    const starts = breakLine(even(8), 7 * 34, words(8));
    expect(starts).toEqual([0, 4]);
    for (const w of systems(even(8), starts)) expect(w).toBeLessThanOrEqual(7 * 34);
  });

  it("breaks between words rather than inside one when it costs no extra system", () => {
    // "ho-ly" at notes 3-4: the even break, four and four, would split it,
    // so the line breaks three and five (or five and three) instead.
    const ends = [true, true, true, false, true, true, true, true];
    const starts = breakLine(even(8), 5 * 34, ends);
    expect(starts).toHaveLength(2);
    expect(starts).not.toContain(4);
  });

  it("still breaks inside a word when that saves a system", () => {
    const ends = [false, false, false, false, false, false, false, true];
    expect(breakLine(even(8), 4 * 34, ends)).toEqual([0, 4]);
  });

  it("keeps every system within the room, long words and all", () => {
    // A long word hangs left of its note and right past its slot.
    const reach: NoteReach[] = [
      { from: 0, to: 40 },
      { from: 20, to: 90 },
      { from: 70, to: 150 },
      { from: 140, to: 180 },
      { from: 170, to: 215 },
      { from: 200, to: 240 },
    ];
    const starts = breakLine(reach, 110, words(6));
    expect(starts[0]).toBe(0);
    for (const w of systems(reach, starts)) expect(w).toBeLessThanOrEqual(110);
  });

  it("gives a note wider than the room a system of its own rather than losing it", () => {
    const reach: NoteReach[] = [
      { from: 0, to: 30 },
      { from: 30, to: 200 },
      { from: 200, to: 230 },
    ];
    expect(breakLine(reach, 60, words(3))).toEqual([0, 1, 2]);
  });
});
