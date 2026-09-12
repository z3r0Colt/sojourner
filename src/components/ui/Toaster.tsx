import { useEffect } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { useToastStore, type ToastItem } from "./toast";
import { cx } from "./classes";

function ToastRow({ item }: { item: ToastItem }) {
  const dismiss = useToastStore((s) => s.dismiss);
  useEffect(() => {
    if (!Number.isFinite(item.durationMs)) return;
    const t = setTimeout(() => dismiss(item.id), item.durationMs);
    return () => clearTimeout(t);
  }, [item.id, item.durationMs, dismiss]);

  const Icon = item.kind === "error" ? AlertCircle : item.kind === "success" ? CheckCircle2 : Info;
  return (
    <div
      role={item.kind === "error" ? "alert" : "status"}
      className={cx(
        "toast-enter pointer-events-auto flex items-center gap-3 rounded-lg border bg-surface px-3 py-2 text-sm shadow-xl",
        item.kind === "error" ? "border-danger/40" : "border-line",
      )}
    >
      <Icon className={cx("h-4 w-4 shrink-0", item.kind === "error" ? "text-danger" : item.kind === "success" ? "text-accent" : "text-ink-3")} aria-hidden="true" />
      <span className="min-w-0 flex-1 text-ink">{item.message}</span>
      {item.action && (
        <button
          type="button"
          onClick={() => {
            item.action?.onClick();
            dismiss(item.id);
          }}
          className="shrink-0 rounded px-2 py-0.5 text-sm font-medium text-accent hover:bg-accent-soft"
        >
          {item.action.label}
        </button>
      )}
      {item.secondary && (
        <button
          type="button"
          onClick={() => {
            item.secondary?.onClick();
            dismiss(item.id);
          }}
          className="shrink-0 rounded px-2 py-0.5 text-sm text-ink-2 hover:bg-hover hover:text-ink"
        >
          {item.secondary.label}
        </button>
      )}
      <button type="button" onClick={() => dismiss(item.id)} aria-label="Dismiss" className="shrink-0 rounded p-0.5 text-ink-3 hover:text-ink">
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

/** Mount once at the app root. Bottom-center so it never covers the study
 * panel, above the read-aloud bar but beneath modals (z-50), so a toast
 * that stays up, such as the backup reminder, never sits over a dialog's
 * buttons. */
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-40 flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <ToastRow key={t.id} item={t} />
      ))}
    </div>
  );
}
