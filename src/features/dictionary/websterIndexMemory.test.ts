import { beforeEach, describe, expect, it } from "vitest";
import { forgetWebsterIndexes, keepWebsterIndex, keptWebsterIndex } from "./websterIndexMemory";

const place = (query: string) => ({ query, letter: "P", from: "pre", trail: ["a", "p"], list: { entry: 7, within: 0.25, scrollTop: 240 } });

describe("where a pane's Webster index was", () => {
  beforeEach(() => forgetWebsterIndexes());

  it("is given back to the same pane, as it was last kept", () => {
    expect(keptWebsterIndex("p1")).toBeNull();
    keepWebsterIndex("p1", place("prev"));
    keepWebsterIndex("p1", place("prevent"));
    keepWebsterIndex("p2", place("quick"));
    expect(keptWebsterIndex("p1")).toEqual(place("prevent"));
    expect(keptWebsterIndex("p2")?.query).toBe("quick");
  });

  it("lets the pane kept longest ago go first", () => {
    for (let i = 0; i < 40; i++) keepWebsterIndex(`p${i}`, place(`w${i}`));
    expect(keptWebsterIndex("p0")).toBeNull();
    expect(keptWebsterIndex("p39")?.query).toBe("w39");
    // Keeping a pane again makes it the newest.
    keepWebsterIndex("p8", place("again"));
    for (let i = 40; i < 71; i++) keepWebsterIndex(`p${i}`, place(`w${i}`));
    expect(keptWebsterIndex("p8")?.query).toBe("again");
  });
});
