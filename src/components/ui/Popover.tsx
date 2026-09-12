import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import { cx } from "./classes";

/** Small anchored dropdown. Closes on outside click, Escape, or when the
 * trigger is clicked again. `trigger` receives the open state so it can
 * render as active. */
export function Popover({
  trigger,
  children,
  align = "right",
  width = "w-56",
  className,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: "left" | "right";
  width?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div ref={rootRef} className={cx("relative", className)}>
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open && (
        <div
          className={cx(
            "absolute z-30 mt-1 rounded-lg border border-line bg-surface p-2 text-sm shadow-xl",
            align === "right" ? "right-0" : "left-0",
            width,
          )}
        >
          {typeof children === "function" ? children(close) : children}
        </div>
      )}
    </div>
  );
}

/** A row inside a Popover: full-width, left-aligned, hover wash. `selected`
 * marks the current choice in a menu that picks one of several. */
export function PopoverItem({
  onClick,
  children,
  className,
  danger,
  selected,
}: {
  onClick: () => void;
  children: ReactNode;
  className?: string;
  danger?: boolean;
  selected?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-checked={selected}
      role={selected === undefined ? undefined : "menuitemradio"}
      className={cx(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
        danger ? "text-danger hover:bg-danger-soft" : "text-ink-2 hover:bg-hover hover:text-ink",
        selected && !danger && "font-medium text-ink",
        className,
      )}
    >
      {selected !== undefined && (
        <Check className={cx("h-3.5 w-3.5 shrink-0", selected ? "text-accent" : "opacity-0")} aria-hidden="true" />
      )}
      {children}
    </button>
  );
}

export function PopoverLabel({ children }: { children: ReactNode }) {
  return <div className="px-2 pb-1 pt-1.5 text-xs font-semibold uppercase tracking-wide text-ink-3">{children}</div>;
}
