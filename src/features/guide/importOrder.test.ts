// The lessons imported before the course, as a view importing them first
// would: course.ts builds its units from the lessons, so the lessons must
// not need anything from course.ts at load time (they import its types only).
import { LESSONS } from "./lessons";
import { UNITS } from "./course";
import { describe, expect, it } from "vitest";

describe("loading the lessons first", () => {
  it("still gives the course its units", () => {
    expect(UNITS.flatMap((u) => u.lessons).length).toBe(LESSONS.length);
  });
});
