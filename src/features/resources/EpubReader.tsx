import { useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import ePub from "epubjs";
import type Rendition from "epubjs/types/rendition";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { LoadingState } from "../../components/ui/EmptyState";

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
  // "scrolled-doc" flow (one continuously-scrollable vertical column, like
  // a normal web page) sidesteps that whole class of bug at the cost of
  // Prev/Next paging between sections instead of columns.
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
      <div className="relative min-h-0 flex-1 bg-white">
        <div ref={containerRef} className="absolute inset-0 overflow-y-auto" />
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-bg">
            <LoadingState label="Opening book…" />
          </div>
        )}
      </div>
      <div className="flex justify-center gap-2 border-t border-line bg-surface py-2">
        <Button size="sm" icon={ChevronLeft} onClick={() => renditionRef.current?.prev()} title="Previous section">
          Previous
        </Button>
        <Button size="sm" onClick={() => renditionRef.current?.next()} title="Next section">
          Next
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
