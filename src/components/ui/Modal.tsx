import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { IconButton } from "./Button";
import { cx } from "./classes";
import { confirmDialog } from "./confirm";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** The one modal. Escape and backdrop click both request close; when
 * `dirty` is set, either first asks whether to discard the unsaved work.
 * Focus is trapped inside while open and returned to the opener after. */
export function Modal({
  title,
  onClose,
  dirty,
  size = "md",
  children,
  footer,
  align = "center",
  bodyClassName,
}: {
  title?: ReactNode;
  onClose: () => void;
  dirty?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
  children: ReactNode;
  footer?: ReactNode;
  /** `top` for palette-style dialogs (search, go to). */
  align?: "center" | "top";
  bodyClassName?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  async function requestClose() {
    if (dirtyRef.current) {
      const ok = await confirmDialog({
        title: "Discard changes?",
        message: "You have unsaved changes. Close without saving?",
        confirmLabel: "Discard",
        danger: true,
      });
      if (!ok) return;
    }
    onClose();
  }

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    // Focus the first focusable control unless something inside already
    // asked for focus (autoFocus inputs).
    if (panel && !panel.contains(document.activeElement)) {
      const first = panel.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panel).focus();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        void requestClose();
        return;
      }
      if (e.key === "Tab" && panel) {
        const nodes = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null);
        if (nodes.length === 0) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    // Capture phase so the modal wins over page-level shortcuts.
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      opener?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const width = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" }[size];

  return (
    <div
      className={cx("fixed inset-0 z-50 flex justify-center bg-black/40 p-6", align === "top" ? "items-start pt-[12vh]" : "items-center")}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) void requestClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={cx("flex max-h-[85vh] w-full flex-col rounded-xl border border-line bg-surface shadow-2xl ", width)}
      >
        {title != null && (
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <h2 className="truncate text-base font-semibold text-ink">{title}</h2>
            <IconButton icon={X} label="Close" size="sm" onClick={() => void requestClose()} />
          </div>
        )}
        <div className={cx("min-h-0 flex-1 overflow-y-auto", bodyClassName ?? "p-4")}>{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-line px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}
