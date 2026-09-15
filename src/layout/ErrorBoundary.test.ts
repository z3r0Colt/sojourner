import { describe, expect, it } from "vitest";
import { ErrorBoundary, errorMessage } from "./ErrorBoundary";

describe("errorMessage", () => {
  it("reads an Error's message", () => {
    expect(errorMessage(new Error("no such column: body"))).toBe("no such column: body");
  });

  it("falls back to the name when an Error carries no message", () => {
    // `throw new TypeError()` is rare but produces an empty message, and a
    // crash screen saying nothing at all is worse than one saying "TypeError".
    expect(errorMessage(new TypeError())).toBe("TypeError");
  });

  it("says something for a thrown value that is not an Error", () => {
    expect(errorMessage("a bare string")).toBe("a bare string");
    expect(errorMessage({ code: 42 })).toBe('{"code":42}');
    expect(errorMessage(null)).toBe("null");
    expect(errorMessage(undefined)).toBe(undefined + "");
  });

  it("survives a value JSON cannot serialize", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => errorMessage(circular)).not.toThrow();
    expect(errorMessage(circular)).toBe("[object Object]");
  });
});

describe("ErrorBoundary", () => {
  it("moves whatever was thrown into its state", () => {
    const error = new Error("render threw");
    expect(ErrorBoundary.getDerivedStateFromError(error)).toEqual({ error });
  });

  it("treats a falsy thrown value as an error all the same", () => {
    // `render()` distinguishes "no error" with `== null`, not truthiness, so
    // a thrown empty string still shows the fallback rather than being
    // mistaken for a healthy boundary.
    expect(ErrorBoundary.getDerivedStateFromError("")).toEqual({ error: "" });
    expect(ErrorBoundary.getDerivedStateFromError(0)).toEqual({ error: 0 });
  });
});
