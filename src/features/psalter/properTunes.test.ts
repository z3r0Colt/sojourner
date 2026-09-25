import { describe, expect, it } from "vitest";
import type { PsalmTune } from "../../api/types";
import { defaultTuneId } from "./properTunes";

const tune = (id: string, name: string, metre: string) => ({ id, name, metre }) as PsalmTune;

const LM = [tune("christum-wir-sollen-loben-schon", "Christum Wir Sollen Loben Schon", "L.M."), tune("old-100th", "Old 100th", "L.M."), tune("duke-street", "Duke Street", "L.M.")];
const CM = [tune("azmon", "Azmon", "C.M."), tune("st-flavian", "St. Flavian", "C.M."), tune("old-137th", "Old 137th", "C.M.D.")];

describe("defaultTuneId", () => {
  it("sings Psalm 100 to Old 100th, not the first name in the list", () => {
    expect(defaultTuneId(100, "L.M.", LM, {})).toBe("old-100th");
  });

  it("gives a psalm the tune named for it over the metre's remembered tune", () => {
    expect(defaultTuneId(137, "C.M.", CM, { metre: "azmon" })).toBe("old-137th");
  });

  it("keeps a reader's own choice for that psalm above all", () => {
    expect(defaultTuneId(100, "L.M.", LM, { psalm: "duke-street" })).toBe("duke-street");
  });

  it("falls back to the metre's remembered tune, then its psalter tune", () => {
    expect(defaultTuneId(23, "C.M.", CM, { metre: "azmon" })).toBe("azmon");
    expect(defaultTuneId(23, "C.M.", CM, {})).toBe("st-flavian");
  });

  it("ignores a remembered tune the metre no longer offers", () => {
    expect(defaultTuneId(23, "C.M.", CM, { psalm: "gone", metre: "also-gone" })).toBe("st-flavian");
  });
});
