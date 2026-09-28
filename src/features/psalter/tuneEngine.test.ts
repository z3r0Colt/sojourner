import { describe, expect, it } from "vitest";
import type { PsalmTune } from "../../api/types";
import { schedule } from "./tuneEngine";

// A doubled tune (C.M.D.) takes two stanzas a pass. Psalm 137 has seven, so
// the last pass has one stanza for it -- and sings only the tune's first
// half, rather than a half with no words under it.

const note = (midi: number) => [{ midi, beats: 1 }];
const line = [60, 62, 64].map(note);
const DOUBLED: PsalmTune = {
  id: "d",
  name: "Doubled",
  metre: "C.M.D.",
  pattern: [3, 3, 3, 3, 3, 3, 3, 3],
  composer: null,
  key: "C",
  tempo: 60,
  lines: Array.from({ length: 8 }, () => line),
};

describe("scheduling a tune", () => {
  it("sings every line of every pass by default", () => {
    const notes = schedule(DOUBLED, 60, { passes: 2 });
    expect(notes.length).toBe(2 * 8 * 3);
  });

  it("sings only as many lines as the last pass has words for", () => {
    const notes = schedule(DOUBLED, 60, { passes: 2, lastPassLines: 4 });
    expect(notes.filter((n) => n.pass === 0).length).toBe(24);
    expect(notes.filter((n) => n.pass === 1).map((n) => n.line)).toEqual([0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3]);
  });
});
