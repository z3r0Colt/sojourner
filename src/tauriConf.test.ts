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

  // A book is styled by stylesheets injected inline into its frame: the
  // book's own, epub.js's, and the reader's. The policy allows that with
  // 'unsafe-inline' -- but the packaged build appends a nonce to style-src
  // for the inline splash style, and a nonce makes browsers ignore
  // 'unsafe-inline' altogether. Every book then rendered as a bare white
  // box in the installed app, while dev (no nonce) looked fine. Tauri's own
  // knob leaves style-src as written; this keeps it from being lost again.
  it("leaves style-src alone so inline stylesheets in a book's frame still apply", () => {
    expect(conf.app.security.csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(conf.app.security.dangerousDisableAssetCspModification).toContain("style-src");
  });
});
