import { useEffect, useRef } from "react";
import { useConfirmStore } from "./confirm";
import { Button } from "./Button";

/** Mount once at the app root; renders whatever `confirmDialog()` is
 * currently asking. Enter confirms, Escape cancels. */
export function ConfirmHost() {
  const pending = useConfirmStore((s) => s.pending);
  const settle = useConfirmStore((s) => s.settle);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!pending) return;
    confirmRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        settle(false);
      } else if (e.key === "Enter") {
        e.stopPropagation();
        settle(true);
      }
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [pending, settle]);

  if (!pending) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-6" onMouseDown={(e) => e.target === e.currentTarget && settle(false)}>
      <div role="alertdialog" aria-modal="true" className="w-full max-w-sm rounded-xl border border-line bg-surface p-5 shadow-2xl">
        <h2 className="text-base font-semibold text-ink">{pending.title}</h2>
        {pending.message && <p className="mt-1.5 text-sm text-ink-2">{pending.message}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => settle(false)}>
            {pending.cancelLabel ?? "Cancel"}
          </Button>
          <Button ref={confirmRef} variant={pending.danger ? "danger" : "primary"} onClick={() => settle(true)}>
            {pending.confirmLabel ?? "OK"}
          </Button>
        </div>
      </div>
    </div>
  );
}
