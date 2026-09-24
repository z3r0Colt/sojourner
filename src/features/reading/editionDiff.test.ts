import { describe, expect, it } from "vitest";
import { baseReadingAfter, diffAgainst, readingAfter } from "./editionDiff";

const split = (s: string) => s.split(/\s+/).filter(Boolean);

describe("edition diff", () => {
  it("finds the Comma Johanneum only in the TR", () => {
    const tr = split("ὅτι τρεῖς εἰσιν οἱ μαρτυροῦντες, ἕν τῷ οὐρανῷ ὁ πατήρ ὁ λόγος καὶ τὸ ἅγιον πνεῦμα");
    const sbl = split("ὅτι τρεῖς εἰσιν οἱ μαρτυροῦντες,");
    const d = diffAgainst(tr, sbl);
    expect(d.words.every((w) => !w.differs)).toBe(true);
    expect(d.missing.length).toBe(11);
    expect(baseReadingAfter(tr, d, 4)).toBe("ἕν τῷ οὐρανῷ ὁ πατήρ ὁ λόγος καὶ τὸ ἅγιον πνεῦμα");
  });

  it("ignores accents and punctuation, and marks a different word", () => {
    const base = split("Ἀμὼν δὲ ἐγέννησεν");
    const other = split("Ἀμὼς, δε ἐγέννησεν");
    const d = diffAgainst(base, other);
    expect(d.words.map((w) => w.differs)).toEqual([true, false, false]);
    expect(readingAfter(d, -1)).toBe("Ἀμὼς,");
    expect(baseReadingAfter(base, d, -1)).toBe("Ἀμὼν");
  });
});
