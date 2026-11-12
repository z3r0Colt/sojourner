import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { tipPosition } from "./tipPosition";

/**
 * The name of an icon, the moment it is wanted.
 *
 * An icon-only button's name was the browser's own tooltip (`title`): a
 * second's wait under a still pointer, in the system's small type, and
 * nothing at all for someone moving by keyboard. With seven bare icons on
 * the Bible's toolbar and no room on a laptop to write their names beside
 * them, that wait was the whole cost of learning the app.
 *
 * So anything marked `data-tip="…"` (every `IconButton`) is named by this
 * instead: after a third of a second on the first, at once on the next, so
 * a pointer drawn along a toolbar reads it like a line of text; and at once
 * under keyboard focus. Not on touch, where there is no hover and a press is
 * the press. One host, mounted once (AppShell), listening on the document.
 *
 * It is paint only: the accessible name is the button's `aria-label`.
 */
const WAIT_MS = 350;
/** Within this long of the last tip closing, the next opens at once. */
const WARM_MS = 500;

export function TooltipHost() {
  const [tip, setTip] = useState<{ text: string; rect: DOMRect } | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const bubble = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let timer: number | null = null;
    let current: HTMLElement | null = null;
    let closedAt = -Infinity;

    const hide = () => {
      if (timer != null) window.clearTimeout(timer);
      timer = null;
      if (current) closedAt = performance.now();
      current = null;
      setTip(null);
    };
    const show = (el: HTMLElement) => {
      const text = el.dataset.tip;
      if (!text || !el.isConnected) return;
      setTip({ text, rect: el.getBoundingClientRect() });
    };
    const named = (target: EventTarget | null) => (target instanceof Element ? target.closest<HTMLElement>("[data-tip]") : null);

    const onOver = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const el = named(e.target);
      if (el === current) return;
      hide();
      if (!el) return;
      current = el;
      const wait = performance.now() - closedAt < WARM_MS ? 0 : WAIT_MS;
      timer = window.setTimeout(() => show(el), wait);
    };
    const onFocus = (e: FocusEvent) => {
      const el = named(e.target);
      // Only focus the reader can see: a click focuses a button too.
      if (!el || !el.matches(":focus-visible")) return;
      hide();
      current = el;
      show(el);
    };
    // What it names has gone (a menu closed under the pointer).
    const onMove = () => {
      if (current && !current.isConnected) hide();
    };

    document.addEventListener("pointerover", onOver, true);
    document.addEventListener("pointermove", onMove, true);
    document.addEventListener("pointerdown", hide, true);
    document.addEventListener("keydown", hide, true);
    document.addEventListener("focusin", onFocus, true);
    document.addEventListener("focusout", hide, true);
    document.addEventListener("scroll", hide, true);
    window.addEventListener("blur", hide);
    return () => {
      hide();
      document.removeEventListener("pointerover", onOver, true);
      document.removeEventListener("pointermove", onMove, true);
      document.removeEventListener("pointerdown", hide, true);
      document.removeEventListener("keydown", hide, true);
      document.removeEventListener("focusin", onFocus, true);
      document.removeEventListener("focusout", hide, true);
      document.removeEventListener("scroll", hide, true);
      window.removeEventListener("blur", hide);
    };
  }, []);

  // Placed once its own size is known, before it is painted.
  useLayoutEffect(() => {
    if (!tip || !bubble.current) return setPos(null);
    const size = bubble.current.getBoundingClientRect();
    setPos(tipPosition(tip.rect, size, { width: window.innerWidth, height: window.innerHeight }));
  }, [tip]);

  if (!tip) return null;
  return (
    <div
      ref={bubble}
      role="tooltip"
      aria-hidden="true"
      className="pointer-events-none fixed z-[90] max-w-xs rounded-md bg-ink px-2 py-1 text-xs font-medium leading-snug text-bg shadow-lg"
      style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? "visible" : "hidden" }}
    >
      {tip.text}
    </div>
  );
}
