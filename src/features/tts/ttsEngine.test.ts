import { describe, expect, it } from "vitest";
import { splitForQuickStart } from "./ttsEngine";

describe("splitForQuickStart", () => {
  it("leaves a short verse whole", () => {
    const verse = "Jesus wept.";
    expect(splitForQuickStart(verse)).toEqual([verse]);
  });

  it("gives the first sentence of a long verse its own piece", () => {
    const verse = "The LORD is my shepherd; I shall not want. He maketh me to lie down in green pastures: he leadeth me beside the still waters.";
    const pieces = splitForQuickStart(verse);
    expect(pieces).toHaveLength(2);
    expect(pieces[0]).toBe("The LORD is my shepherd;");
    expect(pieces.join(" ")).toBe(verse);
  });

  it("never cuts inside a clause", () => {
    // No sentence punctuation at all, so there is nowhere to break: the verse
    // is rendered whole rather than sliced mid-phrase.
    const verse =
      "And God said Let there be a firmament in the midst of the waters and let it divide the waters from the waters which is a very long verse indeed";
    expect(splitForQuickStart(verse)).toEqual([verse]);
  });

  it("keeps the quotation mark with the sentence it closes", () => {
    const verse =
      'And he said unto them, "Follow me, and I will make you fishers of men." And they straightway left their nets, and followed him, and went their way.';
    const pieces = splitForQuickStart(verse);
    expect(pieces[0].endsWith('men."')).toBe(true);
    expect(pieces.join(" ")).toBe(verse);
  });
});
