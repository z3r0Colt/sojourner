import { describe, expect, it } from "vitest";
import { hebrewForDisplay, withoutCantillation } from "./originalText";

describe("withoutCantillation", () => {
  it("takes off the accents, meteg and silluq, and paseq, and nothing else", () => {
    // Genesis 1:1's words: tipha, munah, atnah, merkha, silluq.
    expect(withoutCantillation("בְּרֵאשִׁ֖ית")).toBe("בְּרֵאשִׁית");
    expect(withoutCantillation("בָּרָ֣א")).toBe("בָּרָא");
    expect(withoutCantillation("אֱלֹהִ֑ים")).toBe("אֱלֹהִים");
    expect(withoutCantillation("הָאָֽרֶץ׃")).toBe("הָאָרֶץ׃");
    // Psalm 23:1's zarqa and ole-weyored.
    expect(withoutCantillation("מִזְמ֥וֹר")).toBe("מִזְמוֹר");
    // A paseq between words goes with the accents.
    expect(withoutCantillation("א ׀ ב")).toBe("א  ב");
  });

  it("keeps every letter and point that spells the word", () => {
    // Dagesh, shin and sin dots, holam, qamats qatan, rafe, maqaf, the
    // textual dots, sof pasuq: all kept.
    const spelt = "שָּׂשׁוֹ כָּל־ ׇ ֿ ׄ ׅ ׃";
    expect(withoutCantillation(spelt)).toBe(spelt);
    // Unicode's order of the marks is left as the text has it.
    expect(withoutCantillation("בְּ").normalize("NFC")).toBe("בְּ".normalize("NFC"));
    expect([...withoutCantillation("שִׁ֖")]).toEqual(["ש", "ִ", "ׁ"]);
  });

  it("leaves Greek as it is, accents, breathings and iota subscripts and all", () => {
    for (const greek of ["Ἐν", "ἀρχῇ", "ὁ λόγος", "πρὸς τὸν θεόν", "τῇ", "Ἰησοῦ"]) {
      expect(withoutCantillation(greek)).toBe(greek);
    }
  });
});

describe("hebrewForDisplay", () => {
  it("is the source's text unless the reader asked for the cantillation off", () => {
    expect(hebrewForDisplay("פְּנֵ֣י", true)).toBe("פְּנֵ֣י");
    expect(hebrewForDisplay("פְּנֵ֣י", false)).toBe("פְּנֵי");
  });
});
