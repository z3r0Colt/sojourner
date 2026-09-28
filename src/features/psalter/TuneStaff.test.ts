import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PsalmTune } from "../../api/types";
import { STAFF_LYRIC_PX, TuneStaff } from "./TuneStaff";
import { TIE } from "./fitLyrics";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The staff sets each line's syllables under its notes. It used to draw only
// as many syllables as the line had notes, so a line one syllable long -- the
// book's feminine endings, "to be my King ap-point-ed" -- lost its last word
// without a sign.

const note = (midi: number) => [{ midi, beats: 1 }];
const TUNE: PsalmTune = {
  id: "test",
  name: "Test",
  metre: "S.M.",
  pattern: [6, 6],
  composer: null,
  key: "G",
  tempo: 90,
  lines: [
    [67, 67, 69, 71, 72, 74].map(note),
    [74, 72, 71, 69, 67, 67].map(note),
  ],
};

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
});

const lyricsOf = (line: number) =>
  [...host.querySelectorAll("svg")[line].querySelectorAll("text[text-anchor]")].map((t) => t.lastChild?.textContent ?? "");

describe("the tune staff", () => {
  it("sets one syllable under each note", () => {
    act(() =>
      root.render(
        createElement(TuneStaff, {
          tune: TUNE,
          words: [["Yet", "I", "have", "set", "my", "King"], ["up", "on", "my", "ho", "ly", "hill."]],
          sounding: null,
        }),
      ),
    );
    expect(lyricsOf(0)).toEqual(["Yet", "I", "have", "set", "my", "King"]);
    expect(lyricsOf(1)).toEqual(["up", "on", "my", "ho", "ly", "hill."]);
  });

  it("carries a syllable beyond the notes onto the last note, and says so", () => {
    act(() =>
      root.render(
        createElement(TuneStaff, {
          tune: TUNE,
          words: [["to", "be", "my", "King", "ap", "point", "ed;"], ["I", "have", "him", "King", "a", "noint", "ed."]],
          sounding: null,
        }),
      ),
    );
    expect(lyricsOf(0)).toEqual(["to", "be", "my", "King", "ap", `point${TIE}ed;`]);
    const carried = host.querySelectorAll("svg")[0].querySelector("text[data-carried]");
    expect(carried?.getAttribute("data-carried")).toBe("1");
    expect(carried?.querySelector("title")?.textContent).toBe("2 syllables sung to this note");
  });

  it("joins the syllables of one word with a hyphen, and leaves words apart", () => {
    act(() =>
      root.render(
        createElement(TuneStaff, {
          tune: TUNE,
          words: [["Yet", "I", "have", "set", "my", "King"], ["up", "on", "my", "ho", "ly", "hill."]],
          texts: ["Yet I have set my King", "upon my holy hill."],
          sounding: null,
        }),
      ),
    );
    expect(host.querySelectorAll("svg")[0].querySelectorAll("[data-hyphen]").length).toBe(0);
    // up-on, ho-ly
    expect(host.querySelectorAll("svg")[1].querySelectorAll("[data-hyphen]").length).toBe(2);
  });

  it("widens the spacing under long words rather than letting them overprint", () => {
    const words = [["my", "foes", "thou", "brought'st", "down", "all:"], ["up", "on", "my", "ho", "ly", "hill."]];
    act(() => root.render(createElement(TuneStaff, { tune: TUNE, words, sounding: null })));
    const texts = [...host.querySelectorAll("svg")[0].querySelectorAll("text[text-anchor]")];
    const xs = texts.map((t) => Number(t.getAttribute("x")));
    // brought'st sits further from thou than a note's usual slot.
    expect(xs[3] - xs[2]).toBeGreaterThan(34);
    expect(xs[1] - xs[0]).toBe(34);
  });

  it("breaks a line too wide for a narrow pane into systems, each with its clef, losing no word", () => {
    const words = [["Yet", "I", "have", "set", "my", "King"], ["up", "on", "my", "ho", "ly", "hill."]];
    const texts = ["Yet I have set my King", "upon my holy hill."];
    // Room for about half a line at the size asked for, and no smaller.
    const fit = { width: 200, height: 2000, minLyricPx: STAFF_LYRIC_PX };
    act(() => root.render(createElement(TuneStaff, { tune: TUNE, words, texts, sounding: null, fit })));
    const svgs = [...host.querySelectorAll("svg")];
    expect(svgs.length).toBeGreaterThan(2);
    for (const svg of svgs) {
      expect(Number(svg.getAttribute("width"))).toBeLessThanOrEqual(200);
      expect(svg.textContent).toContain("𝄞");
    }
    const all = svgs.flatMap((svg) => [...svg.querySelectorAll("text[text-anchor]")].map((t) => t.lastChild?.textContent ?? ""));
    expect(all).toEqual(words.flat());
    // up-on and ho-ly keep their hyphens, even where a system ends between the two syllables.
    expect(host.querySelectorAll("[data-hyphen]").length).toBe(2);
    // Each system names the notes it carries.
    expect(svgs[0].getAttribute("aria-label")).toMatch(/line 1, notes 1 to \d/);
  });

  it("draws a line whole where it fits", () => {
    const words = [["Yet", "I", "have", "set", "my", "King"], ["up", "on", "my", "ho", "ly", "hill."]];
    const fit = { width: 2000, height: 2000 };
    act(() => root.render(createElement(TuneStaff, { tune: TUNE, words, sounding: null, fit })));
    expect(host.querySelectorAll("svg").length).toBe(2);
  });
});
