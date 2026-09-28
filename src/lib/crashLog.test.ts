import { describe, expect, it } from "vitest";
import { isBenignWindowError } from "./crashLog";

describe("which window errors are written down as crashes", () => {
  it("leaves out the browser's ResizeObserver loop notice", () => {
    expect(isBenignWindowError("ResizeObserver loop completed with undelivered notifications.")).toBe(true);
    expect(isBenignWindowError("ResizeObserver loop limit exceeded")).toBe(true);
  });

  it("keeps every real error, and one that merely mentions a ResizeObserver", () => {
    expect(isBenignWindowError("TypeError: Cannot read properties of undefined (reading 'id')")).toBe(false);
    expect(isBenignWindowError("Uncaught Error: ResizeObserver loop completed in MyWidget")).toBe(false);
    expect(isBenignWindowError("")).toBe(false);
    expect(isBenignWindowError(null)).toBe(false);
  });
});
