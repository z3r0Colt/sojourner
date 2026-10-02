import { describe, expect, it } from "vitest";
import { findBook } from "./openStep";

// The titles as the library pack gives them.
const library = [
  { id: 14, title: "Body of Divinity", author: "Thomas Watson" },
  { id: 73, title: "Godly Meditations upon the Lord's Prayer", author: "John Bradford" },
  { id: 93, title: "Lord's Prayer", author: "Thomas Watson" },
  { id: 220, title: "Ten Commandments", author: "Thomas Watson" },
];

describe("finding a lesson's book in the library", () => {
  it("finds Watson's books under the pack's titles", () => {
    expect(findBook(library, "A Body of Divinity", "Watson")?.id).toBe(14);
    expect(findBook(library, "The Lord's Prayer", "Watson")?.id).toBe(93);
    expect(findBook(library, "The Ten Commandments", "Watson")?.id).toBe(220);
  });

  it("does not mind curly apostrophes", () => {
    expect(findBook(library, "The Lord’s Prayer", "Watson")?.id).toBe(93);
  });

  it("never takes another author's book of a like title", () => {
    expect(findBook(library.filter((b) => b.id !== 93), "The Lord's Prayer", "Watson")).toBeUndefined();
  });
});
