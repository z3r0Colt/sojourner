import { describe, expect, it } from "vitest";
import { flatten, printedAt } from "./findPrinted";

describe("printedAt", () => {
  it("counts a reference after a footnote number, as the citation index does", () => {
    // NPNF1 01, letter CXXXI: the index's second printing of "Rom. viii. 28".
    const text = "according to His purpose’ (Rom. viii. 28). Of which … 2496 Luke xiii. 11–13. 2497 Rom. viii. 28. 2498 Ps.";
    expect(printedAt(text, "Rom. viii. 28")).toHaveLength(2);
  });

  it("does not count a reference inside a numbered book or a longer verse", () => {
    expect(printedAt("see 1 John i. 1 and I John i. 1", "John i. 1")).toEqual([]);
    expect(printedAt("Gen. i. 31", "Gen. i. 3")).toEqual([]);
    expect(printedAt("Gen. i. 3, 5", "Gen. i. 3")).toEqual([0]);
  });
});

describe("flatten", () => {
  it("finds a reference broken across a line and across elements", () => {
    const flat = flatten(["(Rom. viii.\n        ", "28", ")"]);
    expect(flat.text).toBe("(Rom. viii. 28)");
    const [pos] = printedAt(flat.text, "Rom. viii. 28");
    expect(flat.at[pos]).toEqual([0, 1]);
    expect(flat.at[pos + "Rom. viii. 28".length - 1]).toEqual([1, 1]);
  });

  it("reads a non-breaking space as a space", () => {
    expect(flatten(["Rom. viii. 28"]).text).toBe("Rom. viii. 28");
  });
});
