import { useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import * as pdfjsLib from "pdfjs-dist";
// eslint-disable-next-line import/no-unresolved
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

export function PdfReader({
  filePath,
  initialPage,
  onPageChange,
}: {
  filePath: string;
  initialPage?: number;
  onPageChange?: (page: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const docRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(initialPage ?? 1);
  const [numPages, setNumPages] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const url = convertFileSrc(filePath);
    pdfjsLib.getDocument({ url }).promise.then((doc) => {
      if (cancelled) return;
      docRef.current = doc;
      setNumPages(doc.numPages);
    });
    return () => {
      cancelled = true;
      docRef.current?.cleanup();
    };
  }, [filePath]);

  useEffect(() => {
    const doc = docRef.current;
    if (!doc || !canvasRef.current) return;
    let cancelled = false;
    doc.getPage(page).then(async (pdfPage) => {
      if (cancelled || !canvasRef.current) return;
      const viewport = pdfPage.getViewport({ scale: 1.4 });
      const canvas = canvasRef.current;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      await pdfPage.render({ canvasContext: ctx, viewport, canvas }).promise;
    });
    onPageChange?.(page);
    return () => {
      cancelled = true;
    };
  }, [page, numPages]);

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-auto bg-gray-100 p-4 dark:bg-gray-950">
        <canvas ref={canvasRef} className="mx-auto shadow" />
      </div>
      <div className="flex items-center justify-center gap-4 border-t border-gray-200 py-2 dark:border-gray-800">
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1}
          className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-100 disabled:opacity-40 dark:border-gray-700 dark:hover:bg-gray-800"
        >
          ← Prev
        </button>
        <span className="text-sm text-gray-500">
          Page {page} of {numPages || "…"}
        </span>
        <button
          onClick={() => setPage((p) => Math.min(numPages, p + 1))}
          disabled={page >= numPages}
          className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-100 disabled:opacity-40 dark:border-gray-700 dark:hover:bg-gray-800"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
