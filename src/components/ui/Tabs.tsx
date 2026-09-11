import type { LucideIcon } from "lucide-react";
import { cx } from "./classes";

export interface TabItem<K extends string> {
  key: K;
  label: string;
  icon?: LucideIcon;
  /** Optional trailing count badge; hidden when undefined. */
  count?: number;
  title?: string;
}

/** The one tab strip: underlined active tab, used for every in-page switch
 * (study panel, Prayer, Memory, Westminster sidebar, search results). */
export function Tabs<K extends string>({
  items,
  value,
  onChange,
  size = "md",
  stretch,
  bare,
  hideLabels,
  className,
}: {
  items: TabItem<K>[];
  value: K;
  onChange: (key: K) => void;
  size?: "sm" | "md";
  /** Distribute tabs evenly across the full width (panels). */
  stretch?: boolean;
  /** No bottom rule under the strip (when the container already has one). */
  bare?: boolean;
  /** Icons only, label as tooltip (narrow panels). Requires `icon` on items. */
  hideLabels?: boolean;
  className?: string;
}) {
  return (
    <div role="tablist" className={cx("flex", !bare && "border-b border-line", className)}>
      {items.map((item) => {
        const active = item.key === value;
        const Icon = item.icon;
        const iconOnly = hideLabels && Icon;
        return (
          <button
            key={item.key}
            role="tab"
            type="button"
            aria-selected={active}
            aria-label={iconOnly ? item.label : undefined}
            title={item.title ?? (iconOnly ? item.label : undefined)}
            onClick={() => onChange(item.key)}
            className={cx(
              "-mb-px inline-flex items-center justify-center gap-1.5 whitespace-nowrap border-b-2 font-medium transition-colors",
              size === "sm" ? "px-2.5 py-1.5 text-sm" : "px-3 py-2 text-sm",
              stretch && "flex-1",
              active ? "border-accent text-accent" : "border-transparent text-ink-3 hover:border-line-2 hover:text-ink",
            )}
          >
            {Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />}
            {!iconOnly && item.label}
            {!iconOnly && item.count != null && (
              <span className={cx("rounded-full px-1.5 text-xs", active ? "bg-accent-soft text-accent" : "bg-surface-2 text-ink-3")}>{item.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
