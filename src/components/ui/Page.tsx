import type { ReactNode } from "react";
import { cx } from "./classes";

/** Standard list-page frame: centered column, title row with actions on
 * the right, optional one-line lead. */
export function Page({
  title,
  lead,
  actions,
  children,
  wide,
}: {
  title: ReactNode;
  lead?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={cx("mx-auto w-full px-6 py-6", wide ? "max-w-5xl" : "max-w-3xl")}>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold text-ink">{title}</h1>
          {lead && <p className="mt-0.5 text-sm text-ink-3">{lead}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-block rounded border border-line-2 bg-surface-2 px-1.5 py-0.5 font-sans text-xs text-ink-2 shadow-[inset_0_-1px_0_var(--color-line-2)]">
      {children}
    </kbd>
  );
}
