import { describe, expect, it } from "vitest";
import conf from "../src-tauri/tauri.conf.json";

// Tauri's NSIS template pastes the product name into shortcut paths inside
// single-quoted System::Call arguments (IsShortcutTarget, UnpinShortcut and
// SetShortcutTarget in the utils.nsh the CLI generates). A quote in the name
// ends that argument early, and makensis aborts with
//
//   macro "NSISCOMCALL" requires 4 parameter(s), passed 8
//
// after the Rust release build has already spent its five minutes. That is
// how "Sojourner's Study Companion" failed every installer build it was ever
// given (REVIEW.md, C1). Catch it here, where it costs a second.
describe("tauri.conf.json", () => {
  it("keeps quotes out of the product name, which the NSIS template cannot carry", () => {
    expect(conf.productName).not.toMatch(/['"]/);
  });
});
