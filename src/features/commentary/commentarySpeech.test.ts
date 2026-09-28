import { describe, expect, it } from "vitest";
import {
  buildCommentaryReading,
  entryOfPiece,
  firstRowShowing,
  firstSpokenFrom,
  isReadingClick,
  locatePieces,
  onScreenStart,
  pieceIndexAt,
  speechPieceId,
  verseRangeLabel,
} from "./commentarySpeech";

const SENTENCE = "The love of God to his people is from everlasting, and it is the fountain from which every blessing flows to them. ";

function entry(id: number, verse_start: number | null, verse_end: number | null, plain_text: string) {
  return { id, verse_start, verse_end, chapter: 8, plain_text };
}

const byVerse = (e: { verse_start: number | null; verse_end: number | null }) => verseRangeLabel(e.verse_start, e.verse_end) ?? "Ch. 8";

describe("verseRangeLabel", () => {
  it("names one verse or a range", () => {
    expect(verseRangeLabel(3, 3)).toBe("v. 3");
    expect(verseRangeLabel(3, null)).toBe("v. 3");
    expect(verseRangeLabel(3, 5)).toBe("vv. 3-5");
    expect(verseRangeLabel(null, null)).toBeNull();
  });
});

describe("buildCommentaryReading", () => {
  it("cuts a long entry into pieces within the limit, ids numbered from the entry", () => {
    const reading = buildCommentaryReading([entry(41, 28, 28, SENTENCE.repeat(12))], byVerse);
    expect(reading.segments.length).toBeGreaterThan(2);
    expect(reading.segments.every((s) => s.text.length <= 400)).toBe(true);
    expect(reading.segments.map((s) => s.id)).toEqual(reading.segments.map((_, k) => `41:${k}`));
    expect(reading.pieces.get(41)).toEqual(reading.segments.map((s) => s.text));
    // One paragraph on its verse: every piece carries the verse alone.
    expect(new Set(reading.segments.map((s) => s.label))).toEqual(new Set(["v. 28"]));
  });

  it("numbers the paragraphs that share a place, and leaves a lone one plain", () => {
    const reading = buildCommentaryReading(
      [entry(1, null, null, "An outline of the chapter."), entry(2, 28, 30, "First paragraph."), entry(3, 28, 30, "Second paragraph."), entry(4, 31, 31, "On verse 31.")],
      byVerse,
    );
    expect(reading.segments.map((s) => s.label)).toEqual(["Ch. 8", "vv. 28-30 ¶1", "vv. 28-30 ¶2", "v. 31"]);
  });

  it("knows where each entry starts, and passes over one with nothing to say", () => {
    const reading = buildCommentaryReading(
      [entry(10, 1, 1, SENTENCE.repeat(5)), entry(11, 1, 1, "λόγος — — —"), entry(12, 2, 2, "Grace to you.")],
      byVerse,
    );
    const first12 = reading.firstPiece.get(12)!;
    expect(reading.firstPiece.get(10)).toBe(0);
    expect(reading.firstPiece.has(11)).toBe(false);
    expect(reading.segments[first12].id).toBe(speechPieceId(12, 0));
    // The Greek-only paragraph is not counted, so verse 1's one paragraph is not "¶1".
    expect(reading.segments[0].label).toBe("v. 1");
  });

  it("numbers paragraphs alone when they have no place", () => {
    const reading = buildCommentaryReading([entry(1, null, null, "Preface one."), entry(2, null, null, "Preface two.")], () => null);
    expect(reading.segments.map((s) => s.label)).toEqual(["¶1", "¶2"]);
    expect(buildCommentaryReading([entry(1, null, null, "Only this.")], () => null).segments[0].label).toBeUndefined();
  });

  it("labels a chapter read as a book by chapter and paragraph", () => {
    const entries = [
      { id: 5, chapter: 4, plain_text: "One." },
      { id: 6, chapter: 4, plain_text: "Two." },
      { id: 7, chapter: 5, plain_text: "Three." },
    ];
    const reading = buildCommentaryReading(entries, (e) => (e.chapter != null ? `Ch. ${e.chapter}` : null));
    expect(reading.segments.map((s) => s.label)).toEqual(["Ch. 4 ¶1", "Ch. 4 ¶2", "Ch. 5"]);
  });
});

describe("entryOfPiece", () => {
  it("reads the entry back out of a piece's id", () => {
    expect(entryOfPiece(speechPieceId(1234, 7))).toBe(1234);
  });

  it("is null for anything that is not a commentary piece", () => {
    expect(entryOfPiece(16)).toBeNull();
    expect(entryOfPiece("memory-3:v16")).toBeNull();
    expect(entryOfPiece(null)).toBeNull();
  });
});

describe("firstSpokenFrom", () => {
  const entries = [entry(1, 1, 1, "One."), entry(2, 2, 2, "— — —"), entry(3, 3, 3, "Three."), entry(4, 4, 4, "Four.")];
  const reading = buildCommentaryReading(entries, byVerse);

  it("starts at the entry asked for", () => {
    expect(firstSpokenFrom(reading, entries, 2)).toBe(1);
    expect(firstSpokenFrom(reading, entries, 0)).toBe(0);
  });

  it("moves on past an entry with nothing to say", () => {
    expect(firstSpokenFrom(reading, entries, 1)).toBe(reading.firstPiece.get(3));
  });

  it("falls back to the top past the end", () => {
    expect(firstSpokenFrom(reading, entries, 9)).toBe(0);
  });
});

describe("firstRowShowing", () => {
  const rows = [
    { index: 0, bottom: 90 },
    { index: 1, bottom: 118 },
    { index: 2, bottom: 400 },
  ];

  it("skips rows scrolled above the view and one with only its last line left", () => {
    expect(firstRowShowing(rows, 100)).toBe(2);
    expect(firstRowShowing(rows, 50)).toBe(0);
  });

  it("is null when nothing is showing", () => {
    expect(firstRowShowing(rows, 1000)).toBeNull();
    expect(firstRowShowing([], 0)).toBeNull();
  });
});

describe("onScreenStart", () => {
  const entries = [entry(1, 1, 1, "One."), entry(2, 2, 2, "— — —"), entry(3, 3, 3, "Three.")];
  const reading = buildCommentaryReading(entries, byVerse);

  // A scrolling list whose top edge is at `top`, its rows ending at `bottoms`.
  function scroller(bottoms: number[], top: number) {
    const list = document.createElement("div");
    list.getBoundingClientRect = () => ({ top }) as DOMRect;
    bottoms.forEach((bottom, i) => {
      const row = document.createElement("div");
      row.dataset.entryIndex = String(i);
      row.getBoundingClientRect = () => ({ bottom }) as DOMRect;
      list.appendChild(row);
    });
    return list;
  }

  it("starts at the first paragraph on screen that has something to say", () => {
    // The first scrolled away, the second on screen but only a rule: the third.
    expect(onScreenStart(scroller([50, 300, 600], 100), reading, entries)).toBe(reading.firstPiece.get(3));
  });

  it("reads from the top when scrolled to the top, or with nothing to go by", () => {
    expect(onScreenStart(scroller([200, 300, 600], 100), reading, entries)).toBe(0);
    expect(onScreenStart(null, reading, entries)).toBe(0);
  });
});

describe("clicks on commentary text", () => {
  function tree() {
    const root = document.createElement("div");
    root.innerHTML =
      '<p><span data-speech-index="7"><span id="word">grace</span></span> and <a class="scripref" id="link">Rom. 8:28</a> <button id="btn">x</button></p>';
    document.body.appendChild(root);
    return root;
  }

  it("reads from a click on plain words, not on a link or a button", () => {
    const root = tree();
    const collapsed = { isCollapsed: true };
    expect(isReadingClick(root.querySelector("#word"), collapsed)).toBe(true);
    expect(isReadingClick(root.querySelector("#link"), collapsed)).toBe(false);
    expect(isReadingClick(root.querySelector("#btn"), collapsed)).toBe(false);
    root.remove();
  });

  it("leaves alone the click that ends a selection", () => {
    const root = tree();
    expect(isReadingClick(root.querySelector("#word"), { isCollapsed: false })).toBe(false);
    root.remove();
  });

  it("finds the piece under the click", () => {
    const root = tree();
    expect(pieceIndexAt(root.querySelector("#word"))).toBe(7);
    expect(pieceIndexAt(root.querySelector("#link"))).toBeNull();
    root.remove();
  });
});

describe("locatePieces", () => {
  it("finds each piece being read in the entry's own HTML, italics and links and all", () => {
    const root = document.createElement("div");
    root.innerHTML =
      '<p><i>Is enmity.</i> Is hostility.\n  Comp. <a class="scripref">Jas 4:4</a>; the carnal mind is opposed.</p><p><i>For it.</i> It is not subject.</p>';
    const pieces = ["Is enmity. Is hostility. Comp. Jas 4:4; the carnal mind is opposed.", "For it. It is not subject."];
    const { ranges, words } = locatePieces(root, pieces);
    expect(ranges.map((r) => r?.toString().replace(/\s+/g, " "))).toEqual(pieces);
    expect(words[1]?.map((w) => w?.toString())).toEqual(["For", "it.", "It", "is", "not", "subject."]);
  });

  it("finds a piece by its ends when the HTML carries a marker the voice was spared", () => {
    const root = document.createElement("div");
    root.innerHTML = '<p>{n} "Say not in thine heart" De 30:12-14</p><p>Next line<br>here.</p>';
    const { ranges, words } = locatePieces(root, ['"Say not in thine heart" De 30:12-14', "Next line here."]);
    expect(ranges[0]?.toString()).toBe('"Say not in thine heart" De 30:12-14');
    expect(words[0]?.length).toBe(7);
    // A line break is a space between words to the voice; the range over it
    // runs from the first word to the last.
    expect(ranges[1]?.toString()).toBe("Next linehere.");
    // Not there at all: nothing is marked, and nothing breaks.
    expect(locatePieces(root, ["Nowhere in this entry."]).ranges).toEqual([null]);
  });
});

describe("commentaryBookTitle", () => {
  it("does not say the book twice", async () => {
    const { commentaryBookTitle } = await import("./CommentaryStandaloneView");
    expect(commentaryBookTitle("Barnes' Notes on the New Testament", "Romans", "Romans 8")).toBe("Barnes' Notes on the New Testament: Romans 8");
    expect(commentaryBookTitle("Calvin", "Romans", "Preface")).toBe("Calvin: Romans — Preface");
    expect(commentaryBookTitle("Calvin", "Romans", null)).toBe("Calvin: Romans");
  });
});
