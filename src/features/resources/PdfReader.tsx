import { useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import * as pdfjsLib from "pdfjs-dist";
// eslint-disable-next-line import/no-unresolved
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "../../components/ui/Button";

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
      <div className="min-h-0 flex-1 overflow-auto bg-surface-2 p-4">
        <canvas ref={canvasRef} className="mx-auto shadow-lg" />
      </div>
      <div className="flex items-center justify-center gap-3 border-t border-line bg-surface py-2">
        <Button size="sm" icon={ChevronLeft} onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
          Previous
        </Button>
        <span className="text-sm text-ink-3">
          Page {page} of {numPages || "…"}
        </span>
        <Button size="sm" onClick={() => setPage((p) => Math.min(numPages, p + 1))} disabled={page >= numPages}>
          Next
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
