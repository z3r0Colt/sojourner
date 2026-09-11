import { useEffect } from "react";
import { isDialogOpen, isTypingTarget } from "../../lib/keyboard";

/** The four grade buttons and the key that presses each (F2.6). */
export const GRADE_KEYS: readonly { key: "1" | "2" | "3" | "4"; quality: number; label: string }[] = [
  { key: "1", quality: 1, label: "Again" },
  { key: "2", quality: 3, label: "Hard" },
  { key: "3", quality: 4, label: "Good" },
  { key: "4", quality: 5, label: "Easy" },
];

export interface PracticeKeyHandlers {
  /** Space: reveal the hidden text (first-letter and blank-word modes). */
  onReveal?: () => void;
  /** Enter: check the typed answer (type-it mode). Fires from inside the
   * textarea too; Shift+Enter still inserts a newline. */
  onCheck?: () => void;
  /** 1 to 4: grade the card once the answer is showing. */
  onGrade?: (quality: number) => void;
  /** Backspace: back to the previous card. */
  onBack?: () => void;
}

/**
 * Keyboard grading during memory practice. Each handler is only wired
 * while it is passed, so the caller expresses the card's state by what it
 * hands in (reveal before the reveal, grade after it). Keys typed into a
 * text control are left alone, except Enter in the answer box, which is
 * the check. Nothing fires while a dialog is up.
 */
export function usePracticeKeys({ onReveal, onCheck, onGrade, onBack }: PracticeKeyHandlers): void {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey || isDialogOpen()) return;
      const typing = isTypingTarget(e.target);
      if (e.key === "Enter" && onCheck && !e.shiftKey) {
        e.preventDefault();
        onCheck();
        return;
      }
      if (typing) return;
      if (e.key === " " && onReveal) {
        e.preventDefault();
        onReveal();
      } else if (e.key === "Backspace" && onBack) {
        e.preventDefault();
        onBack();
      } else if (onGrade) {
        const g = GRADE_KEYS.find((k) => k.key === e.key);
        if (g) {
          e.preventDefault();
          onGrade(g.quality);
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onReveal, onCheck, onGrade, onBack]);
}
