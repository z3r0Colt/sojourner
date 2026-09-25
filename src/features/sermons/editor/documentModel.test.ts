import { describe, expect, it } from "vitest";
import { applySectionMove, blockLevels, dropLineFor, neighborMove, parseManuscript, sectionMove, type BlockLevel } from "./documentModel";
import { calloutBlockHtml } from "./callouts";
import { buildSlides, markedRuns } from "../slides";
import type { Sermon } from "../../../api/types";

// A manuscript as its top-level blocks: an opening paragraph, then
//   I (h2) p, a (h3) p, b (h3) p, II (h2) p, III (h2) c (h3) p
const names = ["intro", "I", "I.p", "a", "a.p", "b", "b.p", "II", "II.p", "III", "c", "c.p"];
const levels: BlockLevel[] = [null, 2, null, 3, null, 3, null, 2, null, 2, 3, null];
// Heading indexes: I=0, a=1, b=2, II=3, III=4, c=5.

function moved(from: number, target: number, side: "before" | "after"): string[] | null {
  const move = sectionMove(levels, from, target, side);
  return move ? applySectionMove(names, move) : null;
}

describe("sectionMove", () => {
  it("moves a point with all its sub-points", () => {
    expect(moved(0, 4, "after")).toEqual(["intro", "II", "II.p", "III", "c", "c.p", "I", "I.p", "a", "a.p", "b", "b.p"]);
    expect(moved(4, 0, "before")).toEqual(["intro", "III", "c", "c.p", "I", "I.p", "a", "a.p", "b", "b.p", "II", "II.p"]);
  });

  it("never lets a point split another point from its sub-points", () => {
    // Dropped on sub-point b, point III lands by b's own point, I.
    expect(moved(4, 2, "before")).toEqual(moved(4, 0, "before"));
    expect(moved(4, 2, "after")).toEqual(moved(4, 0, "after"));
  });

  it("moves a sub-point on its own, among sub-points or into another point", () => {
    expect(moved(2, 1, "before")).toEqual(["intro", "I", "I.p", "b", "b.p", "a", "a.p", "II", "II.p", "III", "c", "c.p"]);
    // After a point is that point's first sub-point, where the drop line is.
    expect(moved(1, 4, "after")).toEqual(["intro", "I", "I.p", "b", "b.p", "II", "II.p", "III", "a", "a.p", "c", "c.p"]);
  });

  it("refuses a drop that changes nothing or lands inside the section itself", () => {
    expect(moved(0, 0, "before")).toBeNull();
    expect(moved(0, 0, "after")).toBeNull();
    expect(moved(0, 1, "after")).toBeNull(); // a is inside I
    expect(moved(3, 4, "before")).toBeNull(); // II is already before III
    expect(moved(9, 0, "before")).toBeNull(); // no such heading
  });

  it("keeps the opening prose where it is", () => {
    const result = moved(3, 0, "before")!;
    expect(result[0]).toBe("intro");
    expect(result.slice(1, 3)).toEqual(["II", "II.p"]);
  });
});

describe("dropLineFor", () => {
  const line = (from: number, target: number, side: "before" | "after") => dropLineFor(levels, sectionMove(levels, from, target, side)!);

  it("draws the line where the section will land, not where the pointer is", () => {
    // III on the lower half of I's row lands after I's sub-points: above II.
    expect(line(4, 0, "after")).toEqual({ index: 3, side: "before" });
    // III dropped on sub-point b lands before b's own point, I.
    expect(line(4, 2, "before")).toEqual({ index: 0, side: "before" });
    // I after III goes to the very end: under III's last sub-point.
    expect(line(0, 4, "after")).toEqual({ index: 5, side: "after" });
  });

  it("reads the levels off the manuscript's own top-level blocks", () => {
    expect(blockLevels("<p>x</p><h2>I</h2><blockquote><h3>q</h3></blockquote><h3>a</h3>")).toEqual([null, 2, null, 3]);
  });
});

describe("neighborMove", () => {
  const step = (from: number, direction: -1 | 1) => {
    const move = neighborMove(levels, from, direction);
    return move ? applySectionMove(names, move) : null;
  };

  it("steps a point past the neighboring point, whole", () => {
    expect(step(3, -1)).toEqual(["intro", "II", "II.p", "I", "I.p", "a", "a.p", "b", "b.p", "III", "c", "c.p"]);
    expect(step(0, 1)).toEqual(["intro", "II", "II.p", "I", "I.p", "a", "a.p", "b", "b.p", "III", "c", "c.p"]);
  });

  it("steps a sub-point through its siblings and then into the next point", () => {
    expect(step(1, 1)).toEqual(["intro", "I", "I.p", "b", "b.p", "a", "a.p", "II", "II.p", "III", "c", "c.p"]);
    expect(step(2, 1)).toEqual(["intro", "I", "I.p", "a", "a.p", "II", "II.p", "b", "b.p", "III", "c", "c.p"]);
  });

  it("stops at either end", () => {
    expect(step(0, -1)).toBeNull();
    expect(step(4, 1)).toBeNull();
    expect(step(5, 1)).toBeNull();
  });
});

describe("markedRuns", () => {
  const runs = (html: string) =>
    markedRuns(parseManuscript(html).getElementById("sermon-root")!).map((r) => r.text);

  it("joins a mark the editor split around bold into one run", () => {
    expect(runs('<p>Say it: <span data-slide="">Look </span><strong><span data-slide="">up</span></strong>. Then go.</p>')).toEqual(["Look up"]);
  });

  it("keeps a line break inside marked words as a space", () => {
    expect(runs('<p><span data-slide="">Look<br>up</span></p>')).toEqual(["Look up"]);
  });

  it("splits at unmarked words and at paragraph ends", () => {
    expect(runs('<p><span data-slide="">One</span> and <span data-slide="">two</span></p><p><span data-slide="">three</span></p>')).toEqual([
      "One",
      "two",
      "three",
    ]);
  });
});

function sermon(body: string): Sermon {
  return {
    id: 1,
    title: "T",
    big_idea: null,
    body,
    status: "draft",
    stage: "text",
    preach_date: null,
    series_id: null,
    series_order: null,
    venue: null,
    preacher: null,
    translation_id: null,
    target_minutes: null,
    reflection: null,
    created_at: "",
    updated_at: "",
    deleted_at: null,
    passages: [],
    sources: [],
    tags: [],
    events: [],
    series_title: null,
  };
}

describe("buildSlides", () => {
  it("puts marked words on a slide where they fall, and not a typed block by itself", () => {
    const body =
      "<h2>Point</h2>" +
      calloutBlockHtml("illustration", "<p>A long story nobody projects.</p>") +
      '<p><span data-slide="">Grace is not earned.</span></p>' +
      '<blockquote data-type="source" data-label="Owen"><p>Be killing sin.</p></blockquote>';
    const slides = buildSlides(sermon(body), { includeDetails: false });
    expect(slides.map((s) => `${s.kind}:${s.heading}`)).toEqual(["title:T", "point:Point", "line:Grace is not earned.", "quote:Be killing sin."]);
  });

  it("gives each point its own sub-points, whatever headings sit inside quotations", () => {
    const body = "<h2>I</h2><blockquote><h3>quoted</h3></blockquote><h2>II</h2><h3>b</h3>";
    const points = buildSlides(sermon(body)).filter((s) => s.kind === "point");
    expect(points.map((s) => [s.heading, s.bullets])).toEqual([
      ["I", []],
      ["II", ["b"]],
    ]);
  });

  it("does not project part of a quotation that is already on the screen whole", () => {
    const body = '<blockquote data-type="source"><p><span data-slide="">Be killing sin</span> or it will be killing you.</p></blockquote>';
    expect(buildSlides(sermon(body)).filter((s) => s.kind === "line")).toEqual([]);
  });
});
