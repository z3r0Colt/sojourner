import { describe, expect, it } from "vitest";
import { shownSearchTabs } from "./searchTabs";

const KEYS = ["all", "verses", "commentary", "notes", "prayer", "resources", "westminster", "encyclopedia", "sermons", "illustrations", "lexicons", "factbook", "grammar"];
const tabs = (counts: Record<string, number> = {}) => KEYS.map((key) => ({ key, count: counts[key] }));
const keys = (shown: { key: string }[]) => shown.map((t) => t.key);

describe("the search box's tabs", () => {
  it("are all shown to someone never asked, and to someone who asked for everything", () => {
    expect(keys(shownSearchTabs(tabs(), "all", null, true))).toEqual(KEYS);
    expect(keys(shownSearchTabs(tabs(), "all", "everything", true))).toEqual(KEYS);
  });

  it("are five for a reader", () => {
    expect(keys(shownSearchTabs(tabs(), "all", "reading", false))).toEqual(["all", "verses", "commentary", "notes", "prayer"]);
  });

  it("add the study tabs for a student, and the sermon tabs for a preacher", () => {
    const student = keys(shownSearchTabs(tabs(), "all", "studying", false));
    expect(student).toContain("lexicons");
    expect(student).toContain("grammar");
    expect(student).not.toContain("sermons");
    expect(keys(shownSearchTabs(tabs(), "all", "preaching", true))).toEqual(KEYS);
  });

  it("never hide a tab with something found in it, nor the one in use", () => {
    const shown = keys(shownSearchTabs(tabs({ encyclopedia: 4, sermons: 1 }), "grammar", "reading", false));
    expect(shown).toContain("encyclopedia");
    expect(shown).toContain("sermons");
    expect(shown).toContain("grammar");
    expect(shown).not.toContain("lexicons");
  });

  it("keep their order", () => {
    const shown = keys(shownSearchTabs(tabs({ factbook: 2 }), "all", "family", false));
    expect(shown).toEqual(["all", "verses", "commentary", "notes", "prayer", "westminster", "factbook"]);
  });
});
