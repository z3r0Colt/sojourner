import { beforeEach, describe, expect, it } from "vitest";
import { noteSelection, restoreSelection, sameSelection } from "./keepSelection";

const ATTR = "data-verse-text";

/** Two verses as the page draws them: plain runs, with a footnote marker in
 * the first that is drawn but is no part of the verse. */
function drawVerses(): HTMLElement {
  document.body.innerHTML = `
    <div id="pane">
      <div><span data-verse-text="3"><span>For they being ignorant</span><sup class="select-none">[a]</sup><span> of God's righteousness</span></span></div>
      <div><span data-verse-text="4"><span>For Christ is the end of the law</span></span></div>
    </div>`;
  return document.getElementById("pane")!;
}

/** Verse `n` drawn afresh the way read-aloud draws the verse it reads: a span
 * to a word, and no footnote marker. */
function redrawAsWords(container: HTMLElement, n: number, text: string) {
  const verse = container.querySelector(`[${ATTR}="${n}"]`)!;
  verse.replaceChildren(
    ...text.split(/(\s+)/).map((part) => {
      if (/^\s+$/.test(part)) return document.createTextNode(part);
      const span = document.createElement("span");
      span.textContent = part;
      return span;
    }),
  );
}

function select(anchor: Node, anchorOffset: number, focus: Node, focusOffset: number) {
  window.getSelection()!.setBaseAndExtent(anchor, anchorOffset, focus, focusOffset);
}

describe("keeping a selection while read-aloud redraws the verse", () => {
  let container: HTMLElement;
  beforeEach(() => {
    container = drawVerses();
  });

  it("notes a selection by verse and characters, footnote markers left out", () => {
    const after = container.querySelectorAll(`[${ATTR}="3"] > span`)[1].firstChild!; // " of God's righteousness"
    const before = container.querySelector(`[${ATTR}="3"] > span`)!.firstChild!; // "For they being ignorant"
    select(before, 4, after, 9);
    const noted = noteSelection(container, window.getSelection(), ATTR);
    // "they being ignorant of God's": 4 in, to 23 + 9 in -- the "[a]" not counted.
    expect(noted).toEqual({ anchor: { key: "3", offset: 4 }, focus: { key: "3", offset: 32 } });
  });

  it("puts the selection back on the verse drawn a word to a span", () => {
    const before = container.querySelector(`[${ATTR}="3"] > span`)!.firstChild!;
    const after = container.querySelectorAll(`[${ATTR}="3"] > span`)[1].firstChild!;
    select(before, 15, after, 22);
    const selection = window.getSelection()!;
    // (jsdom has no styles, so the marker's text is in what it says is selected.)
    expect(selection.toString()).toBe("ignorant[a] of God's righteousnes");
    const noted = noteSelection(container, selection, ATTR)!;

    redrawAsWords(container, 3, "For they being ignorant of God's righteousness");
    // The words went with the old nodes.
    expect(sameSelection(noteSelection(container, selection, ATTR), noted)).toBe(false);

    expect(restoreSelection(container, noted, selection, ATTR)).toBe(true);
    expect(selection.toString()).toBe("ignorant of God's righteousnes");
    expect(noteSelection(container, selection, ATTR)).toEqual(noted);
  });

  it("keeps a selection running from one verse into the next, and one made backwards", () => {
    const three = container.querySelectorAll(`[${ATTR}="3"] > span`)[1].firstChild!;
    const four = container.querySelector(`[${ATTR}="4"] > span`)!.firstChild!;
    // Dragged from "Christ" back up into verse 3.
    select(four, 10, three, 10);
    const selection = window.getSelection()!;
    const noted = noteSelection(container, selection, ATTR)!;
    const text = selection.toString();

    redrawAsWords(container, 4, "For Christ is the end of the law");
    expect(restoreSelection(container, noted, selection, ATTR)).toBe(true);
    expect(selection.toString()).toBe(text);
    expect(selection.anchorNode && container.querySelector(`[${ATTR}="4"]`)!.contains(selection.anchorNode)).toBe(true);
  });

  it("reports failure when the verse is no longer on the page, and notes nothing for no selection", () => {
    const four = container.querySelector(`[${ATTR}="4"] > span`)!.firstChild!;
    select(four, 0, four, 10);
    const noted = noteSelection(container, window.getSelection(), ATTR)!;
    container.querySelector(`[${ATTR}="4"]`)!.parentElement!.remove();
    expect(restoreSelection(container, noted, window.getSelection(), ATTR)).toBe(false);

    window.getSelection()!.removeAllRanges();
    expect(noteSelection(container, window.getSelection(), ATTR)).toBeNull();
  });
});
