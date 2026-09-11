import { useUiStore } from "../../state/uiStore";
import { toast, useToastStore } from "../../components/ui/toast";

/**
 * Zoom shortcuts (F1.7): Ctrl+= and Ctrl+- step the reading text size by
 * two pixels within the 14 to 30 range, Ctrl+0 resets it, and Ctrl+scroll
 * over a Bible pane does the same. Text size is global (one preference for
 * every pane, by decision), so the shell owns the keys and each Bible pane
 * only adds the wheel gesture. One toast at a time: a new step replaces the
 * previous announcement rather than stacking.
 */

export const TEXT_SIZE_MIN = 14;
export const TEXT_SIZE_MAX = 30;
export const TEXT_SIZE_DEFAULT = 18;
export const TEXT_SIZE_STEP = 2;

let lastToastId: number | null = null;

function announce(message: string) {
  if (lastToastId != null) useToastStore.getState().dismiss(lastToastId);
  lastToastId = toast.info(message);
}

/** Steps the text size up (1) or down (-1) and announces the new size. */
export function zoomText(direction: 1 | -1): void {
  const s = useUiStore.getState();
  const next = Math.max(TEXT_SIZE_MIN, Math.min(TEXT_SIZE_MAX, s.fontSize + direction * TEXT_SIZE_STEP));
  if (next === s.fontSize) {
    announce(`Text size ${next}px (${direction > 0 ? "largest" : "smallest"})`);
    return;
  }
  s.setFontSize(next);
  announce(`Text size ${next}px`);
}

export function resetZoom(): void {
  const s = useUiStore.getState();
  if (s.fontSize !== TEXT_SIZE_DEFAULT) s.setFontSize(TEXT_SIZE_DEFAULT);
  announce(`Text size reset to ${TEXT_SIZE_DEFAULT}px`);
}

/** True for the keyboard zoom chords: Ctrl and = / + (larger), - / _
 * (smaller), or 0 (reset). Returns what to do, or null. */
export function zoomActionFor(e: KeyboardEvent): "in" | "out" | "reset" | null {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return null;
  if (e.key === "=" || e.key === "+") return "in";
  if (e.key === "-" || e.key === "_") return "out";
  if (e.key === "0") return "reset";
  return null;
}
