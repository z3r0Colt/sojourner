import { describe, expect, it } from "vitest";
import { ALL_ROUTES, NAV_GROUPS } from "../../layout/nav";
import { parseRoute } from "../../workspace/paneKinds";
import { PRESET_WORKSPACES } from "../../workspace/presets";
import { ALWAYS_SHOWN, PURPOSES, landingFor, pagesFor, shouldAsk, shownPages, workspaceFor, type Purpose } from "./purpose";

const ids = PURPOSES.map((p) => p.id);

describe("the sidebar's pages", () => {
  it("are each a page the app can open, and none is listed twice", () => {
    expect(new Set(ALL_ROUTES).size).toBe(ALL_ROUTES.length);
    for (const route of ALL_ROUTES) expect(parseRoute(route), route).not.toBeNull();
  });

  it("keep the three groups the tour points at", () => {
    const groups = NAV_GROUPS.map((g) => g.id);
    for (const id of ["library", "notebook", "devotion"]) expect(groups).toContain(id);
  });
});

describe("a purpose", () => {
  it("shows only pages the sidebar has, the Bible and Today among them", () => {
    for (const id of ids) {
      const pages = pagesFor(id);
      expect(new Set(pages).size, id).toBe(pages.length);
      for (const route of pages) expect(ALL_ROUTES, `${id}: ${route}`).toContain(route);
      for (const route of ALWAYS_SHOWN) expect(pages, `${id}: ${route}`).toContain(route);
    }
  });

  it("of everything shows every page", () => {
    expect([...pagesFor("everything")].sort()).toEqual([...ALL_ROUTES].sort());
  });

  it("of reading is short, and study and preaching build on it", () => {
    expect(pagesFor("reading").length).toBeLessThanOrEqual(8);
    for (const route of pagesFor("reading")) expect(pagesFor("studying")).toContain(route);
    for (const route of pagesFor("studying")) expect(pagesFor("preaching")).toContain(route);
    expect(pagesFor("studying")).not.toContain("/sermons");
    expect(pagesFor("preaching")).toContain("/sermons");
    expect(pagesFor("family")).toContain("/family");
  });

  it("leaves no page out of reach of every purpose but everything", () => {
    // A page no purpose shows is still under More; this only says the table
    // was looked at when a page was added.
    const reachable = new Set((["reading", "studying", "preaching", "family"] as Purpose[]).flatMap((p) => [...pagesFor(p)]));
    expect(ALL_ROUTES.filter((r) => !reachable.has(r))).toEqual([]);
  });

  it("starts in a workspace the app has, or stays on Today", () => {
    const presets = PRESET_WORKSPACES.map((w) => w.name);
    for (const id of ids) {
      const name = workspaceFor(id);
      if (name != null && name !== "Study") expect(presets, id).toContain(name);
    }
    expect(workspaceFor("reading")).toBeNull();
    expect(workspaceFor("everything")).toBeNull();
    expect(landingFor("everything")).toBeNull();
    expect(landingFor("reading")).toBe("today");
    expect(landingFor("studying")).toBe("bible");
  });
});

describe("what the sidebar shows", () => {
  it("is everything for someone who was never asked", () => {
    expect([...shownPages(null, null)].sort()).toEqual([...ALL_ROUTES].sort());
  });

  it("is the purpose's pages, until the reader picks their own", () => {
    expect([...shownPages("reading", null)].sort()).toEqual([...pagesFor("reading")].sort());
    const own = shownPages("reading", ["/atlas"]);
    expect(own.has("/atlas")).toBe(true);
    expect(own.has("/notes")).toBe(false);
  });

  it("always has the Bible and Today, and never a page the app does not have", () => {
    const shown = shownPages("everything", ["/gone", "/atlas"]);
    expect([...shown].sort()).toEqual(["/", "/atlas", "/today"]);
  });
});

describe("the question at the door", () => {
  it("is asked of a new install only", () => {
    expect(shouldAsk({ purpose: null, tourDone: false, hasRead: false })).toBe(true);
    // Answered.
    expect(shouldAsk({ purpose: "reading", tourDone: false, hasRead: false })).toBe(false);
    // Here before the question: the tour was finished or skipped.
    expect(shouldAsk({ purpose: null, tourDone: true, hasRead: false })).toBe(false);
    // Here before the question, on a phone, which never ran the tour.
    expect(shouldAsk({ purpose: null, tourDone: false, hasRead: true })).toBe(false);
  });
});
