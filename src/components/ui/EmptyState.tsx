import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Loader2 } from "lucide-react";
import { cx } from "./classes";

/** Empty list placeholder with an icon, a one-line title, an optional
 * explanation, and the primary action that fills it. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact,
}: {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={cx("flex flex-col items-center text-center", compact ? "px-4 py-6" : "rounded-lg border border-dashed border-line-2 px-6 py-10")}>
      {Icon && <Icon className="mb-3 h-8 w-8 text-ink-4" aria-hidden="true" />}
      <p className="text-sm font-medium text-ink">{title}</p>
      {description && <p className="mt-1 max-w-md text-sm text-ink-3">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Inline loading indicator; `label` is announced to screen readers. */
export function LoadingState({ label = "Loading…", className }: { label?: string; className?: string }) {
  return (
    <div role="status" className={cx("flex items-center gap-2 text-sm text-ink-3", className ?? "p-4")}>
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
