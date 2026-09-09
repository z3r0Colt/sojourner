import { useEffect, useRef } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import ePub from "epubjs";

export function EpubReader({ filePath }: { filePath: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<{ next: () => void; prev: () => void } | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const url = convertFileSrc(filePath);
    const book = ePub(url);
    const rendition = book.renderTo(containerRef.current, {
      width: "100%",
      height: "100%",
      flow: "paginated",
    });
    rendition.display();
    renditionRef.current = rendition;
    return () => {
      book.destroy();
    };
  }, [filePath]);

  return (
    <div className="flex h-full flex-col">
      <div ref={containerRef} className="min-h-0 flex-1" />
      <div className="flex justify-center gap-4 border-t border-gray-200 py-2 dark:border-gray-800">
        <button
          onClick={() => renditionRef.current?.prev()}
          className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
        >
          ← Previous
        </button>
        <button
          onClick={() => renditionRef.current?.next()}
          className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
