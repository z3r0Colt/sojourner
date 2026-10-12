/**
 * The reader's own books and PDFs on the web. The desktop copies a file into
 * its resources folder and reads its text with Rust; here the page keeps the
 * file in IndexedDB (a Blob each, so the same quota and `storage.persist()` as
 * user.db), reads the title, author and text itself with the same epub.js and
 * pdf.js the readers use, and records the book with `add_resource_file`.
 * `Resource.file_path` is the key the file is kept under: `web-file:<id>`.
 */
import { invoke } from "../lib/platform";
import type { Resource } from "../api/types";

const DB = "sojourner-files";
const STORE = "files";
const PREFIX = "web-file:";

/** A phone has to hold the file, its pages and its text at once. */
export const MAX_FILE_BYTES = 150 * 1024 * 1024;
/** Text beyond this is left out of search, as the desktop does for a huge book. */
const MAX_TEXT_CHARS = 20_000_000;

export type WebFileKind = "epub" | "pdf";

export const isWebFile = (path: string) => path.startsWith(PREFIX);

export function kindOf(file: { name: string }): WebFileKind | null {
  const ext = file.name.split(".").pop()?.toLowerCase();
  return ext === "epub" ? "epub" : ext === "pdf" ? "pdf" : null;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("The browser would not open its file storage."));
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = run(t.objectStore(STORE));
      t.oncomplete = () => resolve(req.result);
      t.onerror = () => reject(t.error ?? new Error("The browser could not save the file."));
      t.onabort = () => reject(t.error ?? new Error("The browser could not save the file (is its storage full?)."));
    });
  } finally {
    db.close();
  }
}

const urls = new Map<string, string>();

/** A URL the readers can open the file from. */
export async function blobUrl(path: string): Promise<string> {
  const known = urls.get(path);
  if (known) return known;
  const blob = await tx<Blob | undefined>("readonly", (s) => s.get(path));
  if (!blob) throw new Error("This file is no longer in this browser's storage.");
  const url = URL.createObjectURL(blob);
  urls.set(path, url);
  return url;
}

export async function removeFile(path: string): Promise<void> {
  const url = urls.get(path);
  if (url) URL.revokeObjectURL(url);
  urls.delete(path);
  await tx("readwrite", (s) => s.delete(path));
}

function clean(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

async function readEpub(buffer: ArrayBuffer): Promise<{ title?: string; author?: string; text: string }> {
  const { default: ePub } = await import("epubjs");
  const book = ePub(buffer);
  try {
    await book.ready;
    const meta = await book.loaded.metadata;
    const parts: string[] = [];
    let size = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const item of (book.spine as any).spineItems as any[]) {
      if (size > MAX_TEXT_CHARS) break;
      try {
        const root = (await item.load(book.load.bind(book))) as Element;
        root.querySelectorAll("style,script,head").forEach((n) => n.remove());
        // Tags become spaces, or "<h1>One</h1><p>Zebulun" reads "OneZebulun".
        const spaced = root.innerHTML.replace(/<[^>]*>/g, " ");
        const text = clean(new DOMParser().parseFromString(spaced, "text/html").documentElement.textContent ?? "");
        if (text) {
          parts.push(text);
          size += text.length;
        }
      } catch {
        // A section that will not load is left out; the rest is still a book.
      } finally {
        item.unload();
      }
    }
    return { title: meta.title?.trim() || undefined, author: meta.creator?.trim() || undefined, text: parts.join("\n\n") };
  } finally {
    book.destroy();
  }
}

async function readPdf(buffer: ArrayBuffer): Promise<{ title?: string; author?: string; text: string }> {
  const pdfjs = await import("pdfjs-dist");
  const workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  // pdf.js takes the buffer over, and the file's own bytes are still needed.
  const task = pdfjs.getDocument({ data: new Uint8Array(buffer.slice(0)) });
  const doc = await task.promise;
  try {
    const info = ((await doc.getMetadata().catch(() => null))?.info ?? {}) as { Title?: string; Author?: string };
    const parts: string[] = [];
    let size = 0;
    for (let n = 1; n <= doc.numPages && size <= MAX_TEXT_CHARS; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const text = clean(content.items.map((i) => ("str" in i ? i.str : "")).join(" "));
      if (text) {
        parts.push(text);
        size += text.length;
      }
      page.cleanup();
    }
    return { title: info.Title?.trim() || undefined, author: info.Author?.trim() || undefined, text: parts.join("\n\n") };
  } finally {
    await task.destroy();
  }
}

/** Keeps the file and records it as a resource. Rejects with a sentence the
 * reader can act on. */
export async function addWebFile(file: File): Promise<Resource> {
  const kind = kindOf(file);
  if (!kind) throw new Error("Only EPUB books and PDFs can be added on the web.");
  if (file.size > MAX_FILE_BYTES) throw new Error(`“${file.name}” is over ${MAX_FILE_BYTES / 1024 / 1024} MB, more than a browser can hold comfortably.`);
  const buffer = await file.arrayBuffer();
  let read: { title?: string; author?: string; text: string };
  try {
    read = kind === "epub" ? await readEpub(buffer) : await readPdf(buffer);
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    throw new Error(`“${file.name}” could not be opened as ${kind === "epub" ? "an EPUB" : "a PDF"} (${why}).`);
  }
  const key = `${PREFIX}${crypto.randomUUID()}`;
  await tx("readwrite", (s) => s.put(new Blob([buffer], { type: kind === "epub" ? "application/epub+zip" : "application/pdf" }), key));
  try {
    return await invoke<Resource>("add_resource_file", {
      kind,
      title: read.title || file.name.replace(/\.[^.]+$/, ""),
      author: read.author ?? null,
      filePath: key,
      text: read.text,
    });
  } catch (e) {
    await removeFile(key).catch(() => {});
    throw e;
  }
}
