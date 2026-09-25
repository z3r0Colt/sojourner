import { createPortal } from "react-dom";
import { FamilySession } from "./FamilySession";
import { useFamilySession } from "./sessionStore";

/**
 * Gather round: family worship filling the window, in type sized to be read
 * from across a table or on a television. A full-screen overlay above the
 * panes, like preaching mode; Esc goes back to the Family worship pane.
 */
export function GatherRound() {
  const show = useFamilySession((s) => s.active && s.large);
  if (!show) return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col bg-bg text-ink" role="dialog" aria-modal="true" aria-label="Family worship">
      <FamilySession large />
    </div>,
    document.body,
  );
}
