import { useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import ePub from "epubjs";
import type Rendition from "epubjs/types/rendition";

export function EpubReader({ filePath }: { filePath: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // epubjs's paginated flow (CSS multi-column) computes its column track
  // width from the container's pixel size at renderTo time, and is fragile
  // against many books' own stylesheets (fixed-width body, viewport meta,
  // etc): the title page would show, then every "page" after it landed on
  // genuinely empty horizontal space because the column track epub.js
  // thought it was paginating across didn't match what actually rendered.
  // A ResizeObserver-deferred renderTo (tried previously) didn't fix this --
  // it's not a sizing-timing bug, it's the column-pagination model itself
  // being unreliable across arbitrary EPUB stylesheets. "scrolled-doc" flow
  // (one continuously-scrollable vertical column, like a normal web page)
  // sidesteps that whole class of bug at the cost of Prev/Next paging
  // between sections instead of columns.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    setIsLoading(true);

    const url = convertFileSrc(filePath);
    const book = ePub(url);
    let rendition: Rendition | null = null;

    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width <= 0 || height <= 0) return;
      if (!rendition) {
        rendition = book.renderTo(container, {
          width,
          height,
          flow: "scrolled-doc",
          manager: "continuous",
        });
        rendition.themes.default({
          "html, body": { margin: "0 !important", padding: "0 !important" },
          "img, svg": { "max-width": "100% !important", height: "auto !important" },
          "*": { "box-sizing": "border-box" },
        });
        rendition.on("rendered", () => setIsLoading(false));
        rendition.display();
        renditionRef.current = rendition;
      } else {
        rendition.resize(width, height);
      }
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      book.destroy();
      renditionRef.current = null;
    };
  }, [filePath]);

  return (
    <div className="flex h-full flex-col">
      <div className="relative min-h-0 flex-1">
        <div ref={containerRef} className="absolute inset-0 overflow-y-auto" />
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white text-sm text-gray-400 dark:bg-gray-950">
            Loading…
          </div>
        )}
      </div>
      <div className="flex justify-center gap-4 border-t border-gray-200 py-2 dark:border-gray-800">
        <button
          onClick={() => renditionRef.current?.prev()}
          className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
          title="Previous section"
        >
          ← Previous
        </button>
        <button
          onClick={() => renditionRef.current?.next()}
          className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
          title="Next section"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
