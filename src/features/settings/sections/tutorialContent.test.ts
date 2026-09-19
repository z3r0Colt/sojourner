import { describe, expect, it } from "vitest";
import { SHORTCUT_GROUPS } from "../../../layout/shortcuts";
import { parseRoute } from "../../../workspace/paneKinds";
import { TUTORIAL, entryText } from "./tutorialContent";

const entries = TUTORIAL.flatMap((c) => c.entries);
const allText = entries.map(entryText).join("\n");

describe("the tutorial", () => {
  it("has categories with entries, and entries with steps", () => {
    expect(TUTORIAL.length).toBeGreaterThan(5);
    for (const c of TUTORIAL) {
      expect(c.entries.length, c.title).toBeGreaterThan(0);
      for (const e of c.entries) {
        expect(e.steps.length, e.id).toBeGreaterThan(0);
        expect(e.what.length, e.id).toBeGreaterThan(20);
      }
    }
  });

  it("gives every entry a unique id", () => {
    const ids = entries.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("links only to routes the app can open", () => {
    for (const e of entries) {
      for (const l of e.links ?? []) {
        if ("to" in l) {
          const [pathname, search] = l.to.split("?");
          expect(parseRoute(pathname, search ? `?${search}` : ""), `${e.id}: ${l.to}`).not.toBeNull();
        }
      }
    }
  });

  it("explains every keyboard chord the shortcut sheet lists", () => {
    // A key is written in brackets; a plain word in a chord ("click",
    // "scroll") stays a word; a gesture or button named in words ("Drag
    // the grip", "Rehearse") is prose, not a chord, and is skipped.
    const NAMED = new Set(["Home", "End", "Enter", "Space", "Backspace", "Shift", "Ctrl", "Alt", "Esc", "F11", "Tab"]);
    const missing: string[] = [];
    for (const g of SHORTCUT_GROUPS) {
      for (const row of g.rows) {
        const parts = row.keys.map((k) => (k.length <= 3 || NAMED.has(k) ? `[${k}]` : /^[a-z]+$/.test(k) ? k : null));
        if (parts.some((p) => p == null)) continue;
        const chord = parts.join("+");
        if (!allText.includes(chord)) missing.push(`${g.title}: ${chord}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("uses no stale wording", () => {
    for (const stale of ["Windows voice", "1300px", "Ctrl+4 for the others", "three-step", "Unknown author", "swap the two"]) {
      expect(allText.includes(stale), stale).toBe(false);
    }
  });
});
