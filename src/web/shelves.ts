/**
 * Library shelves on the web, the page's side (the worker's is shelfWorker.ts).
 * The desktop's shelves are packs installed from a file; here they are on R2
 * (`npm run build:web-shelves`, `npm run upload:web-shelves`), and the reader
 * adds the ones they want: nothing is downloaded but what they open. Which
 * shelves exist, and which version of each, is pinned in shelves.json when
 * they are uploaded.
 */
import pinned from "./shelves.json";

export type ShelfInfo = (typeof pinned.shelves)[number];

/** Where the shelves are: in dev, content/web-shelves/ as the dev server
 * serves it; in a build, R2. $VITE_SHELVES_BASE overrides both. */
export function shelvesBase(): string {
  const base: string = import.meta.env.VITE_SHELVES_BASE ?? (import.meta.env.DEV ? "/dev-shelves/" : pinned.base);
  return new URL(base, window.location.href).href;
}

/** The shelves this version of the app knows. */
export const WEB_SHELVES: ShelfInfo[] = pinned.shelves;

/** What the worker is told at start (protocol.ts `StartConfig.shelves`). */
export function shelfConfig() {
  return { base: shelvesBase(), list: pinned.shelves.map((s) => ({ id: s.id, version: s.version })) };
}

const PREFIX = "web-shelf:";

/** Whether a resource's `file_path` is a book on a shelf. */
export const isShelfBook = (path: string) => path.startsWith(PREFIX);

/** The address of a shelf book, from its `file_path`
 * (`web-shelf:<id>/<file name>`). */
export function shelfBookUrl(path: string): string | null {
  const rest = path.slice(PREFIX.length).split("\\").join("/");
  const slash = rest.indexOf("/");
  const shelf = pinned.shelves.find((s) => s.id === rest.slice(0, slash));
  if (slash < 0 || !shelf) return null;
  return `${shelvesBase()}${shelf.id}/${shelf.version}/books/${encodeURIComponent(rest.slice(slash + 1))}`;
}

// ---- Keeping a book on this device -----------------------------------------

const BOOKS = "sojourner-books";

/** Whether the book is kept in this browser (readable without the internet). */
export async function isBookKept(path: string): Promise<boolean> {
  const url = shelfBookUrl(path);
  if (!url || typeof caches === "undefined") return false;
  try {
    return !!(await (await caches.open(BOOKS)).match(url));
  } catch {
    return false;
  }
}

/** Downloads the book into the browser's storage. Rejects with a sentence. */
export async function keepBook(path: string): Promise<void> {
  const url = shelfBookUrl(path);
  if (!url) throw new Error("That book isn't on a shelf.");
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new Error("Couldn't reach the shelf: are you online?");
  }
  if (!response.ok) throw new Error(`The shelf has no such book (HTTP ${response.status}).`);
  try {
    await (await caches.open(BOOKS)).put(url, response);
  } catch {
    throw new Error("This browser has no room to keep the book.");
  }
  // As with the data: ask once for storage the browser won't clear.
  void navigator.storage?.persist?.();
}

export async function unkeepBook(path: string): Promise<void> {
  const url = shelfBookUrl(path);
  if (url) await (await caches.open(BOOKS)).delete(url);
}

/** A URL the readers can open the book from: the kept copy if there is one,
 * else the shelf's own address. */
export async function shelfBookSrc(path: string): Promise<string> {
  const url = shelfBookUrl(path);
  if (!url) throw new Error("This book's shelf isn't one this version of Sojourner knows.");
  try {
    const kept = await (await caches.open(BOOKS)).match(url);
    if (kept) return URL.createObjectURL(await kept.blob());
  } catch {
    /* no cache storage: read it from the shelf */
  }
  return url;
}
