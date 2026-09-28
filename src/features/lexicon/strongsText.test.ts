import { describe, expect, it } from "vitest";
import { strongsText } from "./strongsText";

/** Entries as content.db has them, imported from reference/strongs. */
const greek = (derivation: string | null, definition: string) => ({ language: "greek" as const, derivation, definition });

describe("strongsText", () => {
  it("shows θεός as the importer split it, where Strong's has the line", () => {
    const theos = greek("of uncertain affinity;", "a deity, especially (with G3588) the supreme Divinity; figuratively, a magistrate; by Hebraism, very");
    expect(strongsText(theos)).toEqual({ definition: theos.definition, derivation: theos.derivation });
  });

  it("does not split a derivation again: the forms Strong's prints first open it", () => {
    // ὁ: the forms, then Strong's own derivation clause, which is not a
    // source ("the definite article") and must stay where it is.
    const ho = greek("including the feminine ἡ, and the neuter τό in all their inflections; the definite article;", "the (sometimes to be supplied, at others omitted, in English idiom)");
    expect(strongsText(ho)).toEqual({ definition: ho.definition, derivation: ho.derivation });
    const cases = [
      greek("the first person singular present indicative; a prolonged form of a primary and defective verb;", "I exist (used only when emphatic)"),
      greek("an adverb of confirmation; perhaps intensive of G2228; used only (in the New Testament) before G3303;", "assuredly"),
      greek("also (compare) κατωτέρω; adverb from G2596;", "downwards"),
      greek("from G303 and G4579;", "figuratively, to excite"),
    ];
    for (const entry of cases) {
      expect(strongsText(entry), entry.derivation!).toEqual({ definition: entry.definition, derivation: entry.derivation });
    }
  });

  it("shows the whole text as the definition where the file has no definition apart from it", () => {
    expect(strongsText(greek("a primary particle, denoting a supposition, wish, possibility or uncertainty", ""))).toEqual({
      definition: "a primary particle, denoting a supposition, wish, possibility or uncertainty",
      derivation: null,
    });
    expect(strongsText(greek(null, ""))).toEqual({ definition: "", derivation: null });
  });

  it("leaves a Hebrew entry as it is", () => {
    const bethlehem = {
      language: "hebrew" as const,
      derivation: "from H1004 (bayith) and H3899 (lechem); house of bread;",
      definition: "Beth-lehem = \"house of bread (food)\"; 1) a city in Judah",
    };
    expect(strongsText(bethlehem)).toEqual({ definition: bethlehem.definition, derivation: bethlehem.derivation });
  });
});
