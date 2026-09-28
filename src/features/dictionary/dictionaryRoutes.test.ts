import { describe, expect, it } from "vitest";
import type { PaneContent } from "../../state/workspaceStore";
import { paneTitle, parseRoute, routeFor } from "../../workspace/paneKinds";

/** The Dictionary page's two works in its routes and its pane title: the
 *  path says which work is open, so a Webster entry can be linked to and
 *  comes back from the pane's history as itself. */
const dictionary = (params: { slug: string | null; work?: "bible" | "webster"; webster?: number | null }) =>
  ({ kind: "dictionary", params }) as PaneContent;

describe("the Dictionary's routes", () => {
  it("has a path for Webster and for one of its entries", () => {
    expect(parseRoute("/dictionary/webster")).toEqual({ kind: "dictionary", params: { slug: null, work: "webster", webster: null } });
    expect(parseRoute("/dictionary/webster/4012")).toEqual({ kind: "dictionary", params: { slug: null, work: "webster", webster: 4012 } });
    expect(parseRoute("/dictionary/webster/nonsense")).toEqual({ kind: "dictionary", params: { slug: null, work: "webster", webster: null } });
  });

  it("leaves the Bible dictionaries' paths as they were", () => {
    expect(parseRoute("/dictionary")).toEqual({ kind: "dictionary", params: { slug: null } });
    expect(parseRoute("/dictionary/melchizedek")).toEqual({ kind: "dictionary", params: { slug: "melchizedek" } });
    expect(routeFor(dictionary({ slug: "melchizedek" }))).toBe("/dictionary/melchizedek");
    expect(routeFor(dictionary({ slug: null }))).toBe("/dictionary");
  });

  it("writes the work the pane shows, not the entry the other work left behind", () => {
    expect(routeFor(dictionary({ slug: null, work: "webster", webster: 4012 }))).toBe("/dictionary/webster/4012");
    expect(routeFor(dictionary({ slug: "love", work: "webster", webster: null }))).toBe("/dictionary/webster");
    expect(routeFor(dictionary({ slug: "love", work: "bible", webster: 4012 }))).toBe("/dictionary/love");
    // Opened on a Webster entry without saying which work: Webster.
    expect(routeFor(dictionary({ slug: null, webster: 4012 }))).toBe("/dictionary/webster/4012");
  });

  it("reads back what it writes", () => {
    for (const params of [{ slug: null, work: "webster" as const, webster: 7 }, { slug: null, work: "webster" as const, webster: null }]) {
      expect(parseRoute(routeFor(dictionary(params)))).toEqual({ kind: "dictionary", params });
    }
  });

  it("titles a Webster pane as Webster", () => {
    expect(paneTitle(dictionary({ slug: null, work: "webster", webster: 7 }), {})).toBe("Webster 1828");
    expect(paneTitle(dictionary({ slug: null }), {})).toBe("Dictionary");
    expect(paneTitle(dictionary({ slug: "love" }), { dictionaryIndex: [{ id: 1, slug: "love", term: "Love", sources: ["EAS"] }] as never })).toBe(
      "Dictionary · Love",
    );
  });
});
