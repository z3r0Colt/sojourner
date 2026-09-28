import { describe, expect, it } from "vitest";
import { spokenFor } from "./ttsStore";

// Beside ttsStore.test.ts rather than in it: that file stands in for the
// pronunciation map, and this is the map back through every rewrite.

describe("spokenFor", () => {
  it("says a heading in capitals, a bare chain and pages as a reader would, and maps back", () => {
    const text = "SERMON II. SINNERS IN THE HANDS OF AN ANGRY GOD. See Ge 24:40 18:17, pp. 3—5.";
    const { spoken, toSource } = spokenFor({ usePronunciations: false }, text);
    expect(spoken).toBe("Sermon 2. Sinners in the Hands of an Angry God. See Genesis 24, verse 40; 18, verse 17, pages 3 to 5.");
    // The highlight still lands on the words on screen.
    expect(toSource!(spoken.indexOf("Angry"))).toBe(text.indexOf("ANGRY"));
    expect(toSource!(spoken.indexOf("pages"))).toBe(text.indexOf("pp."));
  });
});
