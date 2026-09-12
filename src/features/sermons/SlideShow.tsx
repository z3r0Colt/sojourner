import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Moon, Sun, X } from "lucide-react";
import { IconButton } from "../../components/ui/Button";
import { cx } from "../../components/ui/classes";
import type { Slide } from "./slides";

/**
 * The slide show (SB4.4): the generated deck, full screen, driven from the
 * keyboard. → and ← step, Home and End jump to the ends, Esc leaves, and a
 * counter sits in the corner. The deck projects on a fixed dark ground by
 * default -- a bright screen in a dark room is what a congregation
 * complains about -- with a switch to the reader's own theme.
 */
export function SlideShow({ slides, title, onClose }: { slides: Slide[]; title: string; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [dark, setDark] = useState(true);
  const slide = slides[Math.min(index, slides.length - 1)];

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown" || e.key === "ArrowDown") {
        e.preventDefault();
        setIndex((i) => Math.min(i + 1, slides.length - 1));
      } else if (e.key === "ArrowLeft" || e.key === "PageUp" || e.key === "ArrowUp") {
        e.preventDefault();
        setIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "Home") {
        e.preventDefault();
        setIndex(0);
      } else if (e.key === "End") {
        e.preventDefault();
        setIndex(slides.length - 1);
      }
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [slides.length, onClose]);

  if (!slide) return null;

  return createPortal(
    <div
      className={cx("fixed inset-0 z-[65] flex flex-col", dark ? "bg-[#0b0d11] text-[#f2f3f5]" : "bg-bg text-ink")}
      role="dialog"
      aria-modal="true"
      aria-label={`Slides: ${title}`}
    >
      <div className="relative min-h-0 flex-1">
        <button
          type="button"
          aria-label="Previous slide"
          className="absolute inset-y-0 left-0 z-10 w-1/3 cursor-w-resize opacity-0"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
        />
        <button
          type="button"
          aria-label="Next slide"
          className="absolute inset-y-0 right-0 z-10 w-1/3 cursor-e-resize opacity-0"
          onClick={() => setIndex((i) => Math.min(i + 1, slides.length - 1))}
        />
        <div className="flex h-full flex-col items-center justify-center px-[10vw] text-center">
          <SlideBody slide={slide} />
        </div>
      </div>
      <div className={cx("flex shrink-0 items-center gap-3 px-5 py-2 text-sm", dark ? "text-[#8b909a]" : "text-ink-3")}>
        <span className="min-w-0 flex-1 truncate">{title}</span>
        <span className="tabular-nums">
          {index + 1} / {slides.length}
        </span>
        <IconButton
          icon={dark ? Sun : Moon}
          label={dark ? "Show in the app's theme" : "Show on a dark ground for projection"}
          size="sm"
          onClick={() => setDark((v) => !v)}
        />
        <IconButton icon={X} label="Leave the slides (Esc)" size="sm" onClick={onClose} />
      </div>
    </div>,
    document.body,
  );
}

function SlideBody({ slide }: { slide: Slide }) {
  if (slide.kind === "title") {
    return (
      <>
        <h1 className="reading-font text-[clamp(2rem,6vw,4.5rem)] font-semibold leading-tight">{slide.heading}</h1>
        {slide.subheading && <p className="mt-4 text-[clamp(1rem,2.2vw,1.8rem)] opacity-80">{slide.subheading}</p>}
        {slide.bullets?.map((b) => (
          <p key={b} className="mt-2 text-[clamp(0.9rem,1.6vw,1.3rem)] opacity-60">
            {b}
          </p>
        ))}
      </>
    );
  }

  if (slide.kind === "passage") {
    return (
      <>
        <h2 className="reading-font text-[clamp(1.2rem,2.6vw,2rem)] font-semibold opacity-80">
          {slide.heading}
          {slide.part && (
            <span className="ml-2 text-[0.7em] opacity-60">
              {slide.part.index} of {slide.part.total}
            </span>
          )}
        </h2>
        {slide.body && (
          <p className="reading-font mt-5 max-w-[30ch] text-[clamp(1.3rem,3.4vw,2.6rem)] leading-snug">{slide.body}</p>
        )}
      </>
    );
  }

  if (slide.kind === "quote") {
    return (
      <>
        <p className="reading-font max-w-[32ch] text-[clamp(1.2rem,3vw,2.4rem)] leading-snug">“{slide.heading}”</p>
        {slide.subheading && <p className="mt-4 text-[clamp(0.9rem,1.6vw,1.3rem)] opacity-60">— {slide.subheading}</p>}
      </>
    );
  }

  return (
    <>
      <h2 className="reading-font text-[clamp(1.8rem,5vw,3.6rem)] font-semibold leading-tight">{slide.heading}</h2>
      {slide.bullets && slide.bullets.length > 0 && (
        <ul className="mt-6 space-y-3 text-left text-[clamp(1.1rem,2.4vw,1.9rem)] opacity-85">
          {slide.bullets.map((b) => (
            <li key={b} className="flex gap-3">
              <span aria-hidden="true" className="opacity-50">
                ·
              </span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
