import { describe, expect, it } from "vitest";
import { speakCapitals } from "./speakCapitals";

describe("speakCapitals", () => {
  it("says a heading in capitals as a title", () => {
    // Was "of A-N angry God": the voice spelled the short words.
    expect(speakCapitals("SINNERS IN THE HANDS OF AN ANGRY GOD.")).toBe("Sinners in the Hands of an Angry God.");
    expect(speakCapitals("SERMON II. OF THE HOLY SCRIPTURE")).toBe("Sermon II. Of the Holy Scripture");
    expect(speakCapitals("GOD'S SELF-EXISTENCE")).toBe("God's Self-Existence");
    expect(speakCapitals("MENE, MENE, TEKEL, UPHARSIN.")).toBe("Mene, Mene, Tekel, Upharsin.");
  });

  it("leaves a word in capitals standing alone", () => {
    for (const prose of ["the LORD is my shepherd", "O LORD, how long?", "I AM hath sent me", "SERMON II.", "the KJV and the ESV"]) {
      expect(speakCapitals(prose)).toBe(prose);
    }
  });

  it("keeps numerals, the pronoun and abbreviations in their capitals", () => {
    expect(speakCapitals("CHAPTER XIV. THE COVENANT OF GRACE")).toBe("Chapter XIV. The Covenant of Grace");
    expect(speakCapitals("THE KJV AND THE NASB COMPARED")).toBe("The KJV and the NASB Compared");
    expect(speakCapitals("WRITTEN AD 1741 IN THE U.S.A.")).toBe("Written AD 1741 in the U.S.A.");
    expect(speakCapitals("WHAT I SAW")).toBe("What I Saw");
  });

  it("keeps the text's length, so offsets need no map back", () => {
    const heading = "Sermon I. A DIVINE AND SUPERNATURAL LIGHT, Immediately Imparted";
    expect(speakCapitals(heading)).toBe("Sermon I. A Divine and Supernatural Light, Immediately Imparted");
    expect(speakCapitals(heading)).toHaveLength(heading.length);
  });
});
