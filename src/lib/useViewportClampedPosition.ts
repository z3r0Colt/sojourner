import { useLayoutEffect, useRef, useState } from "react";

type Align =
  /** Top-left corner sits at (x, y) -- the common case for a popup opened
   * from a click point (context menus, word/footnote popovers). */
  | "top-left"
  /** Horizontally centered on x, bottom edge `gap` px above y -- for a
   * toolbar meant to float just above a text selection or highlighted span. */
  | "above-center";

interface Options {
  align?: Align;
  gap?: number;
  /** Minimum distance kept from every viewport edge. */
  margin?: number;
}

/** Positions a `position: fixed` element at a raw (x, y) point, then -- once
 * it's actually rendered and its true size is known -- nudges it back inside
 * the viewport so it's never partially or fully off-screen. Popups render
 * once at the naive unclamped position (so nothing flashes at 0,0 while
 * waiting to measure), then correct on the next paint via `useLayoutEffect`
 * (so the correction happens before the browser paints the wrong spot),
 * and again on window resize. */
export function useViewportClampedPosition<T extends HTMLElement>(
  x: number,
  y: number,
  { align = "top-left", gap = 8, margin = 8 }: Options = {},
) {
  const ref = useRef<T>(null);
  const [style, setStyle] = useState<React.CSSProperties>({ position: "fixed", left: x, top: y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    function recompute() {
      const rect = el!.getBoundingClientRect();
      let left = align === "above-center" ? x - rect.width / 2 : x;
      let top = align === "above-center" ? y - rect.height - gap : y;

      const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
      const maxTop = Math.max(margin, window.innerHeight - rect.height - margin);
      left = Math.min(Math.max(left, margin), maxLeft);
      top = Math.min(Math.max(top, margin), maxTop);

      setStyle({ position: "fixed", left, top });
    }

    recompute();
    window.addEventListener("resize", recompute);
    return () => window.removeEventListener("resize", recompute);
  }, [x, y, align, gap, margin]);

  return { ref, style };
}
