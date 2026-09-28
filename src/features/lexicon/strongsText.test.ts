import { describe, expect, it } from "vitest";
import { derivationClauses, strongsText } from "./strongsText";

/** Entries as content.db has them, imported from reference/strongs. */
const greek = (derivation: string | null, definition: string) => ({ language: "greek" as const, derivation, definition });

describe("strongsText", () => {
  it("puts θεός's meaning back at the front of its definition, where Strong's has it", () => {
    const theos = greek("of uncertain affinity; a deity, especially (with G3588) the supreme Divinity;", "figuratively, a magistrate; by Hebraism, very");
    expect(strongsText(theos)).toEqual({
      definition: "a deity, especially (with G3588) the supreme Divinity; figuratively, a magistrate; by Hebraism, very",
      derivation: "of uncertain affinity;",
    });
  });

  it("gives a definition the file left empty the meaning it put in the derivation", () => {
    expect(strongsText(greek("of uncertain affinity; red, i.e. (with G2281) the Red Sea", ""))).toEqual({
      definition: "red, i.e. (with G2281) the Red Sea",
      derivation: "of uncertain affinity;",
    });
    // ἑσπέρα, "evening": the form first, then the meaning.
    expect(strongsText(greek("feminine of an adjective hesperos (evening); the eve (G5610 being implied)", ""))).toEqual({
      definition: "the eve (G5610 being implied)",
      derivation: "feminine of an adjective hesperos (evening);",
    });
  });

  it("keeps a bracket the file split across the two fields in one sentence", () => {
    // λαμβάνω: the split falls inside "(properly objective ... to seize or remove))".
    const take = strongsText(
      greek(
        "a prolonged form of a primary verb, which is use only as an alternate in certain tenses; to take (in very many applications, literally and figuratively (properly objective or active, to get hold of; whereas G1209 is rather subjective or passive, to have offered to one;",
        "while G138 is more violent, to seize or remove))",
      ),
    );
    expect(take.derivation).toBe("a prolonged form of a primary verb, which is use only as an alternate in certain tenses;");
    expect(take.definition).toBe(
      "to take (in very many applications, literally and figuratively (properly objective or active, to get hold of; whereas G1209 is rather subjective or passive, to have offered to one; while G138 is more violent, to seize or remove))",
    );
  });

  it("leaves a derivation that is all derivation as it is, however many clauses it has", () => {
    const cases = [
      greek("the first person singular present indicative; a prolonged form of a primary and defective verb;", "I exist (used only when emphatic)"),
      greek("an adverb of confirmation; perhaps intensive of G2228; used only (in the New Testament) before G3303;", "assuredly"),
      greek("(compare G2737); adverb from G2596;", "downwards"),
      greek("of Hebrew origin; (H4872);", "Moseus, Moses, or Mouses (i.e. Mosheh), the Hebrew lawgiver"),
      greek("a (middle voice) prolonged form of the primary (middle voice) ; which is used for it in certain tenses; and both as alternate of G3708;", "to gaze"),
      greek("a prolonged form of ; which (together with another form) ; occurs only as an alternate in certain tenses;", "to imbibe (literally or figuratively)"),
      greek('("scandal"); probably from a derivative of G2578;', "a trap-stick (bent sapling), i.e. snare"),
      greek("the 22nd, 14th and an obsolete letter (G4742 as a cross) of the Greek alphabet (intermediate between the 5th and 6th), used as numbers; denoting respectively 600, 60 and 6;", "666 as a numeral"),
      greek("probably from an obsolete (to run on errands; compare G1377);", "an attendant"),
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

describe("derivationClauses", () => {
  it("breaks at semicolons outside brackets, including after a bracket the file never closes", () => {
    expect(derivationClauses("of uncertain affinity; a deity, especially (with G3588) the supreme Divinity;")).toEqual([
      "of uncertain affinity",
      "a deity, especially (with G3588) the supreme Divinity",
    ]);
    expect(derivationClauses("probably from an obsolete (to run on errands; compare G1377);")).toEqual(["probably from an obsolete (to run on errands; compare G1377)"]);
    expect(derivationClauses("new (especially in freshness; while G3501")).toEqual(["new (especially in freshness; while G3501"]);
  });
});
