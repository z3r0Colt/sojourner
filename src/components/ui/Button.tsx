import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cx } from "./classes";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "danger-ghost";
export type ButtonSize = "sm" | "md";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-accent text-white hover:bg-accent-hover shadow-sm",
  secondary: "border border-line-2 bg-surface text-ink-2 hover:bg-hover",
  ghost: "text-ink-2 hover:bg-hover hover:text-ink",
  danger: "bg-danger text-white hover:opacity-90",
  "danger-ghost": "text-danger hover:bg-danger-soft",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "h-7 px-2 text-sm gap-1.5",
  md: "h-8 px-3 text-sm gap-2",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  /** Marks a toggle-style button as currently on (accent wash). */
  active?: boolean;
  children?: ReactNode;
}

/** The one button. Four tiers: primary (one per view), secondary (bordered),
 * ghost (text-only, for row actions), danger / danger-ghost (deletes). */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", icon: Icon, active, className, children, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx(
        "inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45",
        SIZE[size],
        active ? "border border-accent/40 bg-accent-soft text-accent hover:bg-accent-soft-2" : VARIANT[variant],
        className,
      )}
      {...rest}
    >
      {Icon && <Icon className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} aria-hidden="true" />}
      {children}
    </button>
  );
});

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  /** Required: an icon-only button must have an accessible name. */
  label: string;
  size?: ButtonSize;
  active?: boolean;
  variant?: "ghost" | "secondary";
}

/** Square icon-only button. `label` becomes both the tooltip and the
 * accessible name. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon: Icon, label, size = "md", active, variant = "ghost", className, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      title={label}
      aria-label={label}
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        size === "sm" ? "h-7 w-7" : "h-8 w-8",
        active
          ? "bg-accent-soft text-accent"
          : variant === "secondary"
            ? "border border-line-2 bg-surface text-ink-2 hover:bg-hover"
            : "text-ink-3 hover:bg-hover hover:text-ink",
        className,
      )}
      {...rest}
    >
      <Icon className={size === "sm" ? "h-4 w-4" : "h-[18px] w-[18px]"} aria-hidden="true" />
    </button>
  );
});
