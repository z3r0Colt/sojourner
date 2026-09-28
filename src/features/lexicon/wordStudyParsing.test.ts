import { describe, expect, it } from "vitest";
import type { MorphParsing, WordStudy } from "../../api/types";
import { occurrenceParsing, parsingLine, parsingsByCode } from "./wordStudyParsing";

const parsing = (over: Partial<MorphParsing>): MorphParsing => ({
  language: "greek",
  part_of_speech: "noun",
  tense: null,
  voice: null,
  mood: null,
  person: null,
  number: "singular",
  gender: "feminine",
  case: "nominative",
  state: null,
  stem: null,
  kind: null,
  description: "noun, nominative feminine singular",
  affixes: [],
  ...over,
});

const NOM = parsing({});
const ACC = parsing({ case: "accusative", description: "noun, accusative feminine singular" });
const form = (f: string, code: string, p: MorphParsing | null): WordStudy["forms"][number] => ({ form: f, morph_code: code, description: p?.description ?? "", parsing: p, count: 1 });

describe("the word study's parsing", () => {
  it("finds an occurrence's parsing among the forms by its code", () => {
    // ἀγάπη and ἀγάπῃ spelled apart but, say, one code: the first parsing stands.
    const byCode = parsingsByCode([form("ἀγάπη", "N-NSF", NOM), form("ἀγάπην", "N-ASF", ACC), form("ἀγάπη", "N-NSF", ACC), form("x", "", null)]);
    expect(byCode.size).toBe(2);
    expect(occurrenceParsing(byCode, { morph_code: "N-ASF" })).toBe(ACC);
    expect(occurrenceParsing(byCode, { morph_code: "N-NSF" })).toBe(NOM);
    expect(occurrenceParsing(byCode, { morph_code: null })).toBeNull();
    expect(occurrenceParsing(byCode, { morph_code: "" })).toBeNull();
    expect(occurrenceParsing(byCode, { morph_code: "V-PAI-3S" })).toBeNull();
  });

  it("says a form in the interlinear's plain words, falling back to what it has", () => {
    expect(parsingLine(ACC, "noun, accusative feminine singular", "N-ASF")).toBe("Noun · acc fem sg");
    expect(parsingLine(null, "noun, accusative feminine singular", "N-ASF")).toBe("noun, accusative feminine singular");
    expect(parsingLine(null, " ", "N-ASF")).toBe("N-ASF");
    expect(parsingLine(null, null, null)).toBe("");
  });
});
