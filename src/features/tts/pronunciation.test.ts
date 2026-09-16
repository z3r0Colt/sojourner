import { beforeAll, describe, expect, it, vi } from "vitest";

// The lexicon is read through the Tauri command; the test supplies the rows.
vi.mock("../../api/client", () => ({
  api: {
    listPronunciations: async () => [
      { word: "JACOB", respelling: "ja'-kub" },
      { word: "MEPHIBOSHETH", respelling: "me-fib'-o-sheth" },
    ],
    getSetting: async () => JSON.stringify({ NAPHTALI: "naf-ta-lie" }),
  },
}));

import { buildSpoken, loadPronunciationLexicon, plausibleRespelling, toSpoken } from "./pronunciation";

describe("plausibleRespelling", () => {
  /** The names read aloud exists for. These must never be filtered out. */
  it("keeps a respelling of the word itself", () => {
    const good: [string, string][] = [
      ["MEPHIBOSHETH", "me-fib'-o-sheth"],
      ["ZERUBBABEL", "ze-rub'-a-bel"],
      ["NEBUCHADNEZZAR", "neb-u-kad-nez'-ar"],
      ["MELCHIZEDEK", "mel-kiz'e-dek"],
      ["AHASUERUS", "a-haz-u-e'-rus"],
      ["GETHSEMANE", "geth-sem'-a-ne"],
      // ISBE writes the sound, so the first letter may change with it.
      ["CYRUS", "si'-rus"],
      ["PHARAOH", "fa'-ro"],
      ["XERXES", "zurk'-sez"],
      ["AENEAS", "e-ne'-as"],
      ["ALSO", "ol'-so"],
    ];
    for (const [word, respelling] of good) {
      expect(plausibleRespelling(word, respelling), `${word} -> ${respelling}`).toBe(true);
    }
  });

  /** Rows where the importer took a respelling belonging to another word --
   * an article's other headword, its subject, or a truncated line. */
  it("rejects a respelling of some other word", () => {
    const bad: [string, string][] = [
      ["KING", "king'-dum"], // the article is "KING; KINGDOM"
      ["FORT", "for-ti-fi-ka'-shun"],
      ["HOST", "hos-pi-tal'-i-ti"],
      ["POOL", "sis'-tern"],
      ["DILL", "an'-is"],
      ["MIXED", "mul'-ti-tud"],
      ["ACCORDINGLY", "a-kord'"], // truncated
      ["COMMUNICATION", "ko-mun'"],
      ["PROGNOSTICATORS", "munth'-li"],
      ["ARTEMIS", "di-an'-a"],
    ];
    for (const [word, respelling] of bad) {
      expect(plausibleRespelling(word, respelling), `${word} -> ${respelling}`).toBe(false);
    }
  });
});

describe("buildSpoken", () => {
  beforeAll(async () => {
    await loadPronunciationLexicon();
  });

  /** What a voice that reads text as it is spelled is given. */
  it("respells the names for a voice that needs it", () => {
    const { spoken, changed } = buildSpoken("O Jacob. And Mephibosheth sat at the king's table.");
    expect(spoken).toContain("ja-kub");
    expect(spoken).toContain("me-fib-o-sheth");
    expect(changed).toBe(2);
  });

  /**
   * What a voice with its own pronunciation dictionary is given. Handing it
   * "ja-kub" is how Jacob came out as "K, U, B": it reads the names itself,
   * and the ones it cannot read are in the lexicon it loads at startup.
   */
  it("leaves the names alone for a voice that reads them itself", () => {
    const text = "O Jacob. And Mephibosheth sat at the king's table.";
    const { spoken, changed } = buildSpoken(text, { correctionsOnly: true });
    expect(spoken).toBe(text);
    expect(changed).toBe(0);
  });

  /** The reader's own corrections are theirs, and apply to either voice. */
  it("keeps the reader's own corrections either way", () => {
    expect(buildSpoken("the sons of Naphtali", { correctionsOnly: true }).spoken).toBe("the sons of naf-ta-lie");
    expect(buildSpoken("the sons of Naphtali").spoken).toBe("the sons of naf-ta-lie");
  });
});

describe("toSpoken", () => {
  it("drops the stress mark and keeps the syllable breaks", () => {
    expect(toSpoken("me-fib'-o-sheth")).toBe("me-fib-o-sheth");
    // A stress mark standing in for the syllable break becomes one.
    expect(toSpoken("mel-kiz'e-dek")).toBe("mel-kiz-e-dek");
  });
});
