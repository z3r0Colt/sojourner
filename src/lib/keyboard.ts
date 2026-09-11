/** True when a key press is going into a text control, so page shortcuts
 * (verse navigation, Ctrl+B, Ctrl+D) must leave it alone. */
export function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

/** True while a modal dialog or confirm is up (page shortcuts stay quiet). */
export function isDialogOpen(): boolean {
  return document.querySelector('[role="dialog"], [role="alertdialog"]') != null;
}

export type VerseKeyAction = "next" | "prev" | "first" | "last" | "open";

/** Keyboard verse navigation (F1.8): arrows and j/k step the selected
 * verse, Home and End jump to the chapter's ends, Enter opens the verse
 * menu. Plain keys only; with Ctrl, Alt, or Meta held they mean something
 * else (Alt+arrows are history). */
export function verseKeyAction(e: KeyboardEvent): VerseKeyAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  switch (e.key) {
    case "ArrowDown":
    case "j":
      return "next";
    case "ArrowUp":
    case "k":
      return "prev";
    case "Home":
      return "first";
    case "End":
      return "last";
    case "Enter":
      return "open";
    default:
      return null;
  }
}
