import { describe, expect, it } from "vitest";
import {
  blockIndexAt,
  blockIndexForPiece,
  blockIndexFrom,
  collectSpeechBlocks,
  epubSegments,
  fractionThroughBlock,
  mobiReadAloud,
  nextAfterReading,
  paragraphAt,
  parseSpeechId,
  pdfParagraphs,
  pdfSegments,
  rangeOfBlock,
  revealOffset,
  segmentIndexForBlock,
  shownWordRanges,
  speechTextOf,
  spokenToShown,
  startIndexForView,
  type PdfTextRun,
} from "./readAloudText";

function html(body: string): Document {
  return new DOMParser().parseFromString(`<!doctype html><html><head><title>Book</title><style>p{}</style></head><body>${body}</body></html>`, "text/html");
}

const texts = (doc: Document) => collectSpeechBlocks(doc).map((b) => b.text.replace(/\s+/g, " ").trim());

describe("collectSpeechBlocks", () => {
  it("reads paragraphs, headings and list items in order, inline markup and all", () => {
    const doc = html(`
      <h1>Chapter <em>One</em></h1>
      <p>Grace is <a href="x.html">free</a>, and <i>Deus</i>ne?</p>
      <ul><li>First</li><li>Second</li></ul>`);
    expect(texts(doc)).toEqual(["Chapter One", "Grace is free, and Deusne?", "First", "Second"]);
  });

  it("counts a nested paragraph once, and keeps text on either side of it apart", () => {
    const doc = html(`<blockquote><p>Inner one.</p><p>Inner two.</p></blockquote><div>Before <p>Middle.</p> after.</div>`);
    expect(texts(doc)).toEqual(["Inner one.", "Inner two.", "Before", "Middle.", "after."]);
    const blocks = collectSpeechBlocks(doc);
    expect(blocks[2].element).toBe(blocks[4].element);
  });

  it("leaves out the contents list, code, hidden text and note markers", () => {
    const doc = html(`
      <nav><ol><li>Chapter One</li></ol></nav>
      <script>var x = 1;</script>
      <p>Saved by grace<sup>12</sup> through faith<a href="#n3">[3]</a>.</p>
      <p hidden>Hidden.</p>
      <p style="display: none">Also hidden.</p>
      <span epub:type="pagebreak" title="23">23</span>
      <p>Rom. viii. <a href="bible.html#Rom.8.28">28</a>, and the 1<sup>st</sup> of them.</p>`);
    expect(texts(doc)).toEqual(["Saved by grace through faith.", "Rom. viii. 28, and the 1st of them."]);
  });

  it("leaves out a note that is only a Scripture reference, and reads one with more to say", () => {
    // CCEL's notes at the foot of a sermon, as they are printed.
    const doc = html(`
      <p class="Body">Let every one fly out of Sodom.</p>
      <hr/>
      <div class="mnote"><a class="Note" id="fnf_1" href="#fna_1"><sup class="NoteRef">13</sup></a>
        <span class="Footnote">   Preached at Enfield, July 8th, 1741, at a time of great awakenings.</span></div>
      <div class="mnote"><a class="Note" id="fnf_2" href="#fna_2"><sup class="NoteRef">14</sup></a>
        <span class="Footnote">   <a class="scripRef" href="http://www.ccel.org/ccel/bible/asv.Ps.63.html">Psalm lxiii. 18.</a></span></div>
      <div class="mnote"><a class="Note" href="#fna_3"><sup class="NoteRef">15</sup></a>
        <span class="Footnote">See Isa. lxvi. 23, 24; and Rom. ix. 22.</span></div>
      <aside epub:type="footnote"><p>1 Cor. 15:22.</p></aside>`);
    expect(texts(doc)).toEqual(["Let every one fly out of Sodom.", "Preached at Enfield, July 8th, 1741, at a time of great awakenings."]);
  });

  it("reads a line break as a space", () => {
    expect(texts(html(`<p>The Lord is my shepherd;<br/>I shall not want.</p>`))).toEqual(["The Lord is my shepherd; I shall not want."]);
  });

  it("finds the same blocks in the section parsed as XHTML, as it is loaded in the background", () => {
    const body = `<h2>Of Faith</h2><p>Faith is <em>the</em> gift of God.</p><div><p>Nested.</p></div>`;
    const xml = new DOMParser().parseFromString(
      `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>t</title></head><body>${body}</body></html>`,
      "application/xhtml+xml",
    );
    expect(texts(xml)).toEqual(texts(html(body)));
  });

  it("gives a range over each block's own text", () => {
    const doc = html(`<p>One <b>two</b> three.</p>`);
    const [block] = collectSpeechBlocks(doc);
    expect(rangeOfBlock(block).toString()).toBe("One two three.");
  });
});

describe("blockIndexAt / blockIndexFrom", () => {
  const doc = html(`<div class="wrap"><p id="a">First <em id="em">paragraph</em>.</p><img id="img" src="x.png"/><p id="b">Second.</p></div>`);
  const blocks = collectSpeechBlocks(doc);

  it("finds the block of a text node or of an element inside it", () => {
    expect(blockIndexAt(blocks, doc.getElementById("em")!)).toBe(0);
    expect(blockIndexAt(blocks, doc.getElementById("em")!.firstChild!)).toBe(0);
    expect(blockIndexAt(blocks, doc.getElementById("b")!)).toBe(1);
  });

  it("finds nothing for a click in the margin or on a picture", () => {
    expect(blockIndexAt(blocks, doc.body)).toBe(-1);
    expect(blockIndexAt(blocks, doc.querySelector(".wrap")!)).toBe(-1);
  });

  it("starts a selection that begins on a picture at the next paragraph", () => {
    expect(blockIndexFrom(blocks, doc.getElementById("img")!)).toBe(1);
  });
});

describe("epubSegments", () => {
  it("cuts each block into pieces with ids and a paragraph label", () => {
    const blocks = [{ text: "Chapter One" }, { text: "   " }, { text: "Ἐν ἀρχῇ" }, { text: "In the beginning was the Word." }];
    const segments = epubSegments(blocks, 4, "Of the Word");
    expect(segments.map((s) => s.id)).toEqual(["e:4:0:0", "e:4:3:0"]);
    expect(segments.map((s) => s.label)).toEqual(["Of the Word, paragraph 1", "Of the Word, paragraph 2"]);
  });

  it("splits a long block into several pieces", () => {
    const sentence = "And he said unto them, Go ye into all the world, and preach the gospel to every creature. ";
    const segments = epubSegments([{ text: sentence.repeat(12) }], 0, null);
    expect(segments.length).toBeGreaterThan(1);
    expect(segments.every((s) => s.text.length <= 400)).toBe(true);
    expect(segments[1].id).toBe("e:0:0:1");
    expect(segments[0].label).toBe("Section 1, paragraph 1");
  });

  it("leaves out blocks the page does not show, without renumbering the rest", () => {
    const segments = epubSegments([{ text: "One." }, { text: "Two." }, { text: "Three." }], 2, "Ch", (b) => b === 1);
    expect(segments.map((s) => s.id)).toEqual(["e:2:0:0", "e:2:2:0"]);
  });
});

describe("finding a block in a reading", () => {
  const segments = [
    ...epubSegments([{ text: "Alpha." }, { text: "Beta." }], 3, "Ch"),
    ...epubSegments([{ text: "Gamma." }, { text: "" }, { text: "Delta." }, { text: "Epsilon." }], 4, "Ch"),
  ];

  it("matches the block by its first piece when the numbers drift", () => {
    // The page on screen calls "Delta." block 3; the copy read in the
    // background called it block 2.
    expect(segments[segmentIndexForBlock(segments, "e", 4, 3, "Delta.")].text).toBe("Delta.");
  });

  it("falls back to the first block at or after the number", () => {
    expect(segments[segmentIndexForBlock(segments, "e", 4, 1, null)].text).toBe("Delta.");
    expect(segmentIndexForBlock(segments, "e", 9, 0, "Alpha.")).toBe(-1);
  });

  it("finds the block on the page that holds a piece", () => {
    const shown = ["Gamma.", "", "", "Delta.", "Epsilon."];
    expect(blockIndexForPiece(shown, 2, "Delta.")).toBe(3);
    expect(blockIndexForPiece(shown, 4, "Epsilon.")).toBe(4);
    expect(blockIndexForPiece(shown, 0, "Omega.")).toBe(-1);
  });

  it("reads a block's text the way its pieces were cut", () => {
    expect(speechTextOf({ text: "  A  \n rule ——— here " })).toBe("A rule here");
  });
});

describe("fractionThroughBlock", () => {
  it("says how far through its block a piece begins", () => {
    const segments = [
      { id: "e:0:0:0", text: "x".repeat(10) },
      { id: "e:0:1:0", text: "x".repeat(30) },
      { id: "e:0:1:1", text: "x".repeat(10) },
      { id: "e:0:2:0", text: "x".repeat(10) },
    ];
    expect(fractionThroughBlock(segments, 1)).toBe(0);
    expect(fractionThroughBlock(segments, 2)).toBe(0.75);
    expect(fractionThroughBlock(segments, 3)).toBe(0);
  });
});

describe("parseSpeechId", () => {
  it("reads the three kinds and refuses anything else", () => {
    expect(parseSpeechId("e:1:2:3")).toEqual({ kind: "e", parts: [1, 2, 3] });
    expect(parseSpeechId("m:40")).toEqual({ kind: "m", parts: [40] });
    expect(parseSpeechId(7)).toBeNull();
    expect(parseSpeechId("x:1")).toBeNull();
    expect(parseSpeechId("e:a:1")).toBeNull();
  });
});

describe("startIndexForView", () => {
  const rects = [
    { top: 0, bottom: 200 },
    { top: 210, bottom: 400 },
    { top: 410, bottom: 600 },
    { top: 610, bottom: 900 },
  ];

  it("starts with the first block that begins on screen", () => {
    expect(startIndexForView(rects, 405, 905)).toBe(2);
    expect(startIndexForView(rects, 0, 500)).toBe(0);
  });

  it("starts with a paragraph cut by the top edge only when most of the screen is it", () => {
    // 20px of block 1 showing: start with block 2.
    expect(startIndexForView(rects, 380, 680)).toBe(2);
    // 170 of 300px showing: that paragraph is what the reader is looking at.
    expect(startIndexForView(rects, 430, 730)).toBe(2);
    expect(startIndexForView([{ top: 0, bottom: 1000 }, { top: 1010, bottom: 1100 }], 400, 900)).toBe(0);
  });

  it("ignores a block that is not laid out", () => {
    expect(startIndexForView([{ top: 0, bottom: 0 }, { top: 50, bottom: 80 }], 0, 500)).toBe(1);
  });

  it("says nothing is on screen when every block is above it", () => {
    expect(startIndexForView(rects, 1000, 1500)).toBe(4);
    expect(startIndexForView([], 0, 100)).toBe(0);
  });

  it("starts with the next block when the screen shows none (a picture)", () => {
    expect(startIndexForView([{ top: 1200, bottom: 1300 }], 0, 800)).toBe(0);
  });
});

describe("revealOffset", () => {
  const view = { top: 0, bottom: 600 };

  it("leaves a block that is already in view alone", () => {
    expect(revealOffset({ top: 100, bottom: 300 }, view)).toBe(0);
  });

  it("centres a block that is out of view", () => {
    expect(revealOffset({ top: 900, bottom: 1000 }, view)).toBe(650);
    expect(revealOffset({ top: -400, bottom: -300 }, view)).toBe(-650);
  });

  it("follows the voice through a block taller than the pane", () => {
    const tall = { top: 100, bottom: 2100 };
    expect(revealOffset(tall, view, 0)).toBe(0);
    // Halfway through: y = 1100, brought up to a quarter of the way down.
    expect(revealOffset(tall, view, 0.5)).toBe(950);
  });
});

/** A line of text as pdf.js might hand it over: one run per word. */
function line(words: string, y: number, x = 72, size = 12, eol = true): PdfTextRun[] {
  const runs: PdfTextRun[] = [];
  let at = x;
  const parts = words.split(" ");
  parts.forEach((word, i) => {
    const width = word.length * size * 0.5;
    runs.push({ str: word, x: at, y, width, height: size, hasEOL: eol && i === parts.length - 1 });
    at += width + size * 0.3;
  });
  return runs;
}

describe("pdfParagraphs", () => {
  it("joins runs into lines and lines into paragraphs, split where the space opens up", () => {
    const runs = [
      ...line("It is not in man that walketh to direct his steps, and so", 700),
      ...line("the prophet confesses it.", 686),
      ...line("A second paragraph begins after a gap.", 650),
    ];
    const paragraphs = pdfParagraphs(runs);
    expect(paragraphs.map((p) => p.text)).toEqual([
      "It is not in man that walketh to direct his steps, and so the prophet confesses it.",
      "A second paragraph begins after a gap.",
    ]);
    expect(paragraphs[0].top).toBeGreaterThan(700);
    expect(paragraphs[0].bottom).toBeLessThan(686);
  });

  it("joins a word hyphenated across lines, and finds lines pdf.js did not mark", () => {
    const runs = [...line("the doctrine of justifi-", 700, 72, 12, false), ...line("cation by faith alone", 686, 72, 12, false)];
    expect(pdfParagraphs(runs).map((p) => p.text)).toEqual(["the doctrine of justification by faith alone"]);
  });

  it("starts a paragraph at an indented first line after a sentence ends", () => {
    const long = "word ".repeat(14).trim();
    const runs = [...line(`${long} end.`, 700), ...line(`${long} more`, 686, 90), ...line("text.", 672)];
    expect(pdfParagraphs(runs)).toHaveLength(2);
  });

  it("drops a page number at the top or bottom of the page", () => {
    const runs = [...line("42", 760, 300), ...line("Body text here.", 700), ...line("xiv", 40, 300)];
    expect(pdfParagraphs(runs).map((p) => p.text)).toEqual(["Body text here."]);
    expect(pdfParagraphs(line("7", 40))).toEqual([]);
    expect(pdfParagraphs([...line("- 12 -", 760, 300), ...line("Body.", 700)]).map((p) => p.text)).toEqual(["Body."]);
    expect(pdfParagraphs([...line("Body.", 700), ...line("cxlviii", 40, 300)]).map((p) => p.text)).toEqual(["Body."]);
  });

  it("keeps a word made of numeral letters that sits alone at the top or bottom", () => {
    // "civil", "ill" and "lilac" are all i, v, x, l and c -- but no numeral.
    const last = pdfParagraphs([...line("The body of the page, and the powers that be are", 700), ...line("civil", 686)]);
    expect(last.map((p) => p.text)).toEqual(["The body of the page, and the powers that be are civil"]);
    const first = pdfParagraphs([...line("ill", 760), ...line("will of the flesh.", 746)]);
    expect(first.map((p) => p.text)).toEqual(["ill will of the flesh."]);
    expect(pdfParagraphs([...line("Body.", 700), ...line("lilac", 40, 300)]).map((p) => p.text)).toEqual(["Body.", "lilac"]);
  });

  it("finds the paragraph under a point", () => {
    const paragraphs = pdfParagraphs([...line("First.", 700), ...line("Second.", 600)]);
    expect(paragraphAt(paragraphs, 80, 704)).toBe(0);
    expect(paragraphAt(paragraphs, 80, 602)).toBe(1);
    expect(paragraphAt(paragraphs, 80, 650)).toBe(-1);
  });

  it("labels a page's pieces with its number", () => {
    const segments = pdfSegments(["First paragraph.", "Second."], 12);
    expect(segments.map((s) => [s.id, s.label])).toEqual([
      ["p:12:0:0", "p. 12"],
      ["p:12:1:0", "p. 12"],
    ]);
  });

  it("reads a sentence broken over a page break whole, with the page it began on", () => {
    const page2 = ["The first paragraph.", "They deserve to be cast into hell; so that divine justice never stands in the way, according to the good"];
    const page3 = ["pleasure of God. And the reason why they are not fallen already is only this.", "A second paragraph."];
    const two = pdfSegments(page2, 2, { firstOfNext: page3[0] });
    const three = pdfSegments(page3, 3, { lastOfPrevious: page2[1] });
    expect(two[two.length - 1].text.endsWith("according to the good pleasure of God.")).toBe(true);
    expect(three[0]).toMatchObject({ id: "p:3:0:0", text: "And the reason why they are not fallen already is only this." });
    // Nothing lost and nothing said twice.
    const words = (segments: { text: string }[]) => segments.map((s) => s.text).join(" ");
    expect(`${words(two)} ${words(three)}`).toBe([...page2, ...page3].join(" "));
  });

  it("leaves a page break alone where a sentence or a paragraph ends there", () => {
    expect(pdfSegments(["It ends here."], 4, { firstOfNext: "and this is new" }).map((s) => s.text)).toEqual(["It ends here."]);
    expect(pdfSegments(["CHAPTER IV"], 4, { firstOfNext: "Of the Covenant." }).map((s) => s.text)).toEqual(["CHAPTER IV"]);
    // A word hyphenated over the break is one word again.
    expect(pdfSegments(["the plea-"], 5, { firstOfNext: "sure of God. Next." }).map((s) => s.text)).toEqual(["the pleasure of God."]);
    // A first paragraph given up whole keeps its number for the one after.
    expect(pdfSegments(["of God", "Next one."], 6, { lastOfPrevious: "the pleasure" }).map((s) => s.id)).toEqual(["p:6:1:0"]);
  });
});

describe("mobiReadAloud", () => {
  it("shows every piece where it stands, with what the voice skips kept on the page", () => {
    // Long enough that the Greek after it is a piece of its own, which has
    // nothing an English voice can say and is not read -- but is still shown.
    const first = `In the beginning was the Word${", and the Word was with God".repeat(13)}.`;
    const greek = "Ἐν ἀρχῇ ἦν ὁ λόγος.";
    const { paragraphs, segments } = mobiReadAloud([`${first} ${greek}`, "And the Word was God."]);
    expect(segments.map((s) => s.id)).toEqual(["m:0", "m:1"]);
    expect(paragraphs[0]).toEqual([
      { text: first, piece: 0 },
      { text: ` ${greek}`, piece: null },
    ]);
    expect(paragraphs[1]).toEqual([{ text: "And the Word was God.", piece: 1 }]);
    expect(segments[1].label).toBe("paragraph 2");
  });

  it("gives no paragraph label to a book that is all one paragraph", () => {
    expect(mobiReadAloud(["One. Two."]).segments[0].label).toBeUndefined();
  });

  it("keeps on the page what the voice is spared: scene breaks, blanks, rules", () => {
    const given = ["The end of the chapter.", "* * *", "Mr. B—— said ____ to him. Then ——— came."];
    const { paragraphs, segments } = mobiReadAloud(given);
    // Every paragraph is shown exactly as given, piece and gap alike.
    expect(paragraphs.map((runs) => runs.map((r) => r.text).join(""))).toEqual(given);
    expect(paragraphs[1]).toEqual([{ text: "* * *", piece: null }]);
    expect(paragraphs[2]).toEqual([{ text: "Mr. B—— said ____ to him. Then ——— came.", piece: 1 }]);
    // While the voice is given the text without them.
    expect(segments.map((s) => s.text)).toEqual(["The end of the chapter.", "Mr. B said to him. Then came."]);
  });

  it("marks each piece where it stands in a long paragraph, with a rule between two of them", () => {
    const sentence = "And he said unto them, Go ye into all the world, and preach the gospel to every creature. ";
    const paragraph = `${sentence.repeat(4)}* * * ${sentence.repeat(4)}`.trim();
    const { paragraphs, segments } = mobiReadAloud([paragraph]);
    const runs = paragraphs[0];
    expect(runs.map((r) => r.text).join("")).toBe(paragraph);
    // A sentence to a piece, and the scene break between the fourth and fifth.
    expect(runs.flatMap((r) => (r.piece == null ? [] : [r.piece]))).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(runs.filter((r) => r.piece == null && r.text.trim() !== "").map((r) => r.text)).toEqual([" * * * "]);
    for (const run of runs) {
      if (run.piece == null) continue;
      // What is shown for a piece is what the voice is given, give or take
      // what it is spared.
      expect(speechTextOf(run)).toBe(segments[run.piece].text);
    }
  });
});

describe("mobiReadAloud, a sentence at a time", () => {
  it("starts each sentence a piece of its own, so a reading can start at the one at the top of the view", () => {
    // Sinners in the Hands, as its MOBI has it: the reading began at "As he
    // that walks in slippery places", a sentence above the one in view.
    const paragraph =
      "As he that walks in slippery places is every moment liable to fall, he cannot foresee one moment whether he shall stand or fall the next. " +
      "3. Another thing implied is, that they are liable to fall of themselves, without being thrown down by the hand of another; as he that stands or walks on slippery ground needs nothing but his own weight to throw him down.";
    const { segments } = mobiReadAloud([paragraph]);
    expect(segments.map((s) => s.text.slice(0, 26))).toEqual(["As he that walks in slippe", "3. Another thing implied i"]);
  });

  it("keeps a point's number with its point after a reference that ends a sentence", () => {
    // Was "…even as the fool. Eccl. ii. 16. 9." and then "All wicked men's…".
    const { segments } = mobiReadAloud([
      "How dieth the wise man? even as the fool. Eccl. ii. 16. 9. All wicked men's pains and contrivance which they use to escape hell, do not secure them from hell one moment.",
    ]);
    expect(segments.map((s) => s.text)).toEqual([
      "How dieth the wise man? even as the fool. Eccl. ii. 16.",
      "9. All wicked men's pains and contrivance which they use to escape hell, do not secure them from hell one moment.",
    ]);
  });
});

describe("shownWordRanges", () => {
  it("finds each word the voice says where the page shows it", () => {
    const shown = "Mr. B—— said ____ to him. Then God——the Lord came.";
    const spoken = "Mr. B said to him. Then God the Lord came.";
    const words = shownWordRanges(shown, spoken).map((w) => shown.slice(w.start, w.end));
    expect(words).toEqual(["Mr.", "B", "said", "to", "him.", "Then", "God", "the", "Lord", "came."]);
  });

  it("reads through a soft hyphen inside a word", () => {
    const shown = "justifi­cation by faith";
    const words = shownWordRanges(shown, "justification by faith").map((w) => shown.slice(w.start, w.end));
    expect(words).toEqual(["justifi­cation", "by", "faith"]);
  });

  it("stops at the first word the page does not hold", () => {
    expect(shownWordRanges("One two", "One three").map((w) => [w.start, w.end])).toEqual([[0, 3]]);
  });
});

describe("spokenToShown", () => {
  it("answers in order, and -1 once the text is lost", () => {
    const place = spokenToShown("a b", "a—— b");
    expect(place(0)).toBe(0);
    expect(place(2)).toBe(4);
    expect(place(3)).toBe(-1);
    expect(spokenToShown("xyz", "abc")(0)).toBe(-1);
  });
});

describe("nextAfterReading", () => {
  it("carries on from the section or page after the last one a reading holds", () => {
    expect(nextAfterReading([{ id: "e:3:0:0", text: "a" }, { id: "e:4:7:1", text: "b" }], "e")).toBe(5);
    expect(nextAfterReading([{ id: "p:12:3:0", text: "a" }], "p")).toBe(13);
    expect(nextAfterReading([{ id: "p:12:3:0", text: "a" }], "e")).toBeNull();
    expect(nextAfterReading([], "e")).toBeNull();
  });
});
