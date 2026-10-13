/**
 * Offline copies, in the backend's worker: a database read over HTTP
 * (content.db, or a library shelf's library.db) downloaded piece by piece
 * from R2 into the browser's private files (OPFS), each checked against the
 * manifest's SHA-256 before the HTTP VFS reads it (`offline_add` in
 * wasm.rs). Once every piece is there, nothing of it is read over the
 * network. A shelf's copy also keeps every one of its books, in the cache
 * a single book is kept in ("Keep on this device", shelves.ts).
 *
 * On OPFS, content.db's in `sojourner-offline/<content version>/`, a
 * shelf's in `sojourner-shelf-offline/<shelf>/<shelf version>/`:
 *   manifest.json        the manifest, so the app can start without the network
 *   library.db.000 ...   the pieces, each written in place as it downloads
 *   state.json           which pieces are checked, and whether the reader paused
 *
 * A piece left half-done (the tab closed, the network dropped) is resumed
 * from where its file ends: what is there is hashed again, the rest asked
 * for with a Range. A piece that fails its checksum is downloaded again
 * once, then the download stops with the reason. Another version's folder
 * is deleted at start: its pages mean nothing to this app.
 *
 * The download runs between commands: the worker answers the page as usual,
 * and the stream waits while a command runs.
 */
import { Hasher, offline_add, offline_clear, page_cache_bytes, page_cache_clear } from "@sojourner/wasm";
import type { ContentManifest, FromWorker, OfflineOp, OfflineStatus } from "./protocol";

const STATE = "state.json";
const MANIFEST = "manifest.json";
/** Where a single kept book is, and a shelf's copy keeps all of its own. */
const BOOKS = "sojourner-books";
/** A piece being written is flushed this often, so a resume loses little. */
const FLUSH_EVERY = 8 << 20;
/** Room asked for beyond the copy itself. */
const MARGIN = 64 << 20;
/** Waits before trying the network again, then the last one over and over. */
const RETRY_MS = [5_000, 15_000, 30_000, 60_000];
/** How often progress goes to the page while bytes arrive. */
const REPORT_MS = 250;

/** A shelf's manifest: content.db's, with the shelf's books. */
type Manifest = ContentManifest & { books?: { file: string; bytes: number; sha256: string }[] };

type Saved = {
  verified: number[];
  paused: boolean;
  /** A shelf's books this copy downloaded (not those kept one by one before),
   * so removing the copy leaves those. */
  booksAdded?: string[];
  booksDone?: boolean;
  /** Books the shelf's server didn't have (404): skipped, not a failure. */
  booksSkipped?: string[];
};

/** A worker's synchronous handle on an OPFS file (not in TypeScript's DOM
 * library, which describes the page). */
type SyncHandle = {
  read(buffer: Uint8Array, options?: { at: number }): number;
  write(buffer: Uint8Array, options?: { at: number }): number;
  truncate(size: number): void;
  getSize(): number;
  flush(): void;
  close(): void;
};

/** A failure that trying again won't fix: the download stops. */
class Stop extends Error {}

/** A book the server doesn't have: the rest of the shelf still downloads. */
class Missing extends Error {}

function skippedNote(files: string[] | undefined): string | null {
  if (!files?.length) return null;
  const names = files.map((f) => f.replace(/\.epub$/i, "")).join("; ");
  return `${files.length === 1 ? "One book" : `${files.length} books`} couldn't be downloaded, as the server doesn't have ${files.length === 1 ? "it" : "them"}: ${names}.`;
}

let post: (m: FromWorker) => void = () => {};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const mb = (n: number) => `${Math.max(1, Math.round(n / 1e6))} MB`;

/** A sync handle on `name`. One a worker that just stopped still holds (a
 * reload, another tab taking over) is let go a moment later: try again. */
async function openHandle(dir: FileSystemDirectoryHandle, name: string, create: boolean): Promise<SyncHandle> {
  const file = (await dir.getFileHandle(name, { create })) as FileSystemFileHandle & { createSyncAccessHandle(): Promise<SyncHandle> };
  for (let attempt = 0; ; attempt++) {
    try {
      return await file.createSyncAccessHandle();
    } catch (e) {
      if (attempt >= 10 || !(e instanceof DOMException) || e.name === "NotFoundError") throw e;
      await sleep(300);
    }
  }
}

async function writeText(dir: FileSystemDirectoryHandle, name: string, text: string) {
  const h = await openHandle(dir, name, true);
  try {
    const bytes = new TextEncoder().encode(text);
    h.truncate(0);
    h.write(bytes, { at: 0 });
    h.flush();
  } finally {
    h.close();
  }
}

async function readText(dir: FileSystemDirectoryHandle, name: string): Promise<string | null> {
  try {
    return await (await (await dir.getFileHandle(name)).getFile()).text();
  } catch {
    return null;
  }
}

async function folder(path: string[], create: boolean): Promise<FileSystemDirectoryHandle> {
  let dir = await navigator.storage.getDirectory();
  for (const name of path) dir = await dir.getDirectoryHandle(name, { create });
  return dir;
}

class OfflineCopy {
  private manifest: Manifest | null = null;
  private base = "";
  /** The reader's choice, as state.json keeps it; null when there is no copy. */
  private saved: Saved | null = null;
  private state: OfflineStatus["state"] = "none";
  private error: string | null = null;
  /** Bytes of the piece under way. */
  private partial = 0;
  /** Bytes of the books there so far (a shelf's). */
  private booksBytes = 0;
  private running: Promise<void> | null = null;
  private abort: AbortController | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retries = 0;
  private lastReport = 0;

  /**
   * @param target what the page calls it: "content", or "shelf:<id>"
   * @param file the name the VFS opened the database under
   * @param root the OPFS folders this copy's versions are kept in
   */
  constructor(
    readonly target: string,
    private readonly file: string,
    private readonly root: string[],
  ) {}

  private get books() {
    return this.manifest?.books ?? [];
  }

  status(): OfflineStatus {
    const m = this.manifest;
    const verified = this.saved?.verified ?? [];
    const dbDone = m ? verified.reduce((sum, i) => sum + (m.chunks[i]?.size ?? 0), 0) + this.partial : 0;
    const booksTotal = this.books.reduce((sum, b) => sum + b.bytes, 0);
    return {
      state: this.state,
      done: dbDone + this.booksBytes,
      total: (m?.size ?? 0) + booksTotal,
      pieces: m?.chunks.length ?? 0,
      piecesDone: verified.length,
      error: this.error,
    };
  }

  report(force = true) {
    const now = performance.now();
    if (!force && now - this.lastReport < REPORT_MS) return;
    this.lastReport = now;
    post({ kind: "offline", target: this.target, status: this.status() });
  }

  private setState(s: OfflineStatus["state"], e: string | null = null) {
    this.state = s;
    this.error = e;
    this.report();
  }

  private async versionDir(create: boolean): Promise<FileSystemDirectoryHandle | null> {
    try {
      return await (await folder(this.root, true)).getDirectoryHandle(this.manifest!.version, { create });
    } catch {
      return null;
    }
  }

  private async saveState() {
    const dir = await this.versionDir(true);
    if (dir && this.saved) await writeText(dir, STATE, JSON.stringify(this.saved));
  }

  /**
   * Before the database is opened (so its skeleton can come from the copy):
   * finds this version's copy, hands its checked pieces to the VFS, and
   * deletes any other version's.
   */
  async open(m: Manifest, base: string) {
    this.manifest = m;
    this.base = base;
    try {
      const top = await folder(this.root, true);
      const names: string[] = [];
      for await (const name of (top as unknown as { keys(): AsyncIterable<string> }).keys()) names.push(name);
      for (const name of names) if (name !== m.version) await top.removeEntry(name, { recursive: true }).catch(() => {});

      const dir = await this.versionDir(false);
      const text = dir && (await readText(dir, STATE));
      if (!dir || !text) return;
      const s = JSON.parse(text) as Saved;
      const verified: number[] = [];
      for (const i of s.verified) {
        const chunk = m.chunks[i];
        if (!chunk || verified.includes(i)) continue;
        const h = await openHandle(dir, chunk.file, false).catch(() => null);
        if (!h) continue;
        // A file that isn't whole is downloaded again (resumed from its end).
        if (h.getSize() !== chunk.size) {
          h.close();
          continue;
        }
        offline_add(this.file, i, h);
        verified.push(i);
      }
      this.saved = { ...s, verified, paused: !!s.paused };
      if (s.booksDone) this.booksBytes = this.books.reduce((sum, b) => sum + b.bytes, 0);
      const whole = verified.length === m.chunks.length && (!this.books.length || !!s.booksDone);
      this.state = whole ? "complete" : this.saved.paused ? "paused" : "downloading";
      if (whole) this.error = skippedNote(s.booksSkipped);
    } catch (e) {
      // Without OPFS (or with it held elsewhere) there is no offline copy.
      this.saved = null;
      this.state = "failed";
      this.error = `The browser's files couldn't be opened: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  /** Once the database is open: says where things stand, and carries on a
   * download the reader didn't pause. */
  resume() {
    if (this.state === "downloading") {
      this.state = "paused"; // until the loop says otherwise
      void this.op("download");
    } else {
      this.report();
    }
  }

  onOnline() {
    if (this.state === "waiting") void this.op("download");
  }

  async op(op: OfflineOp) {
    const m = this.manifest;
    switch (op) {
      case "download":
        if (!m) return;
        if (this.retryTimer) clearTimeout(this.retryTimer);
        this.retryTimer = null;
        this.saved ??= { verified: [], paused: false };
        this.saved.paused = false;
        if (this.saved.verified.length === m.chunks.length && (!this.books.length || this.saved.booksDone)) return this.setState("complete");
        if (this.running) {
          // Still stopping after a pause: start again once it has.
          if (this.abort?.signal.aborted) void this.running.then(() => this.op("download"));
        } else {
          this.running = this.run().finally(() => {
            this.running = null;
          });
        }
        return;
      case "pause":
        if (!this.saved || this.state === "complete") return this.report();
        if (this.retryTimer) clearTimeout(this.retryTimer);
        this.retryTimer = null;
        this.saved.paused = true;
        this.abort?.abort();
        await this.running?.catch(() => {});
        // Resumed (or removed) while this waited.
        if (!this.saved?.paused) return;
        await this.saveState();
        return this.setState("paused");
      case "remove": {
        if (this.retryTimer) clearTimeout(this.retryTimer);
        this.retryTimer = null;
        const added = this.saved?.booksAdded ?? [];
        this.saved = null;
        this.abort?.abort();
        await this.running?.catch(() => {});
        offline_clear(this.file);
        this.partial = 0;
        this.booksBytes = 0;
        if (m) await (await folder(this.root, true)).removeEntry(m.version, { recursive: true }).catch(() => {});
        if (added.length) {
          const cache = await caches.open(BOOKS).catch(() => null);
          for (const file of added) await cache?.delete(this.bookUrl(file)).catch(() => {});
        }
        return this.setState("none");
      }
      case "status":
        return this.report();
    }
  }

  private bookUrl(file: string) {
    return `${this.base}books/${encodeURIComponent(file)}`;
  }

  private async run() {
    const m = this.manifest!;
    const controller = new AbortController();
    this.abort = controller;
    try {
      const dir = await this.versionDir(true);
      if (!dir) throw new Stop("The browser's files couldn't be opened.");
      await writeText(dir, MANIFEST, JSON.stringify(m));
      await this.saveState();
      const cache = this.books.length ? await caches.open(BOOKS) : null;
      if (this.saved!.booksSkipped) this.saved!.booksSkipped = [];
      const missingBooks = cache ? await this.missingBooks(cache) : [];
      await this.makeRoom(m, missingBooks);
      this.setState("downloading");
      for (let i = 0; i < m.chunks.length; i++) {
        if (this.saved!.verified.includes(i)) continue;
        await this.downloadPiece(dir, i, controller.signal);
        this.retries = 0;
        this.saved!.verified.push(i);
        this.partial = 0;
        await this.saveState();
        this.report();
      }
      // Every page is here now: the cache of pages read online holds copies.
      page_cache_clear(this.file);
      if (cache) {
        for (const book of missingBooks) {
          try {
            await this.downloadBook(cache, book, controller.signal);
          } catch (e) {
            if (!(e instanceof Missing)) throw e;
            (this.saved!.booksSkipped ??= []).push(book.file);
            continue;
          }
          this.retries = 0;
          (this.saved!.booksAdded ??= []).push(book.file);
          this.booksBytes += book.bytes;
          await this.saveState();
          this.report(false);
        }
        this.saved!.booksDone = true;
        await this.saveState();
      }
      this.setState("complete", skippedNote(this.saved!.booksSkipped));
    } catch (e) {
      this.partial = 0;
      if (controller.signal.aborted) return; // paused or removed: that op reports
      if (e instanceof Stop) {
        this.setState("failed", e.message);
        return;
      }
      // The network: try again by itself, sooner when the browser says it is back.
      const wait = RETRY_MS[Math.min(this.retries++, RETRY_MS.length - 1)];
      this.setState("waiting", `Couldn't reach ${new URL(this.base).host}. Trying again in ${Math.round(wait / 1000)} seconds.`);
      this.retryTimer = setTimeout(() => void this.op("download"), wait);
    } finally {
      if (this.abort === controller) this.abort = null;
    }
  }

  /** The shelf's books not yet in the cache; those that are count as done. */
  private async missingBooks(cache: Cache) {
    const missing: NonNullable<Manifest["books"]> = [];
    let have = 0;
    for (const book of this.books) {
      if (await cache.match(this.bookUrl(book.file))) have += book.bytes;
      else missing.push(book);
    }
    this.booksBytes = have;
    return missing;
  }

  /** Says no before downloading what won't fit. The page cache is emptied
   * when that is what makes it fit: its pages are in the copy too. */
  private async makeRoom(m: Manifest, missingBooks: NonNullable<Manifest["books"]>) {
    const have = this.saved!.verified.reduce((sum, i) => sum + m.chunks[i].size, 0);
    const need = m.size - have + missingBooks.reduce((sum, b) => sum + b.bytes, 0) + MARGIN;
    const est = await navigator.storage.estimate().catch(() => null);
    if (!est?.quota) return;
    const free = est.quota - (est.usage ?? 0);
    if (free >= need) return;
    if (free + page_cache_bytes(this.file) >= need) {
      page_cache_clear(this.file);
      return;
    }
    throw new Stop(`There isn't room: this needs ${mb(need)} more, and this browser allows Sojourner ${mb(Math.max(0, free))}.`);
  }

  /** One book, checked, into the cache a kept book is read from. */
  private async downloadBook(cache: Cache, book: NonNullable<Manifest["books"]>[number], signal: AbortSignal) {
    const url = this.bookUrl(book.file);
    const r = await fetch(url, { cache: "no-store", signal });
    if (r.status >= 500) throw new Error(`HTTP ${r.status}`);
    if (r.status === 404) throw new Missing(book.file);
    if (!r.ok) throw new Stop(`${book.file}: HTTP ${r.status}. Reload the page; if that doesn't help, the shelf on the server has changed.`);
    const bytes = new Uint8Array(await r.arrayBuffer());
    const hasher = new Hasher();
    hasher.update(bytes);
    if (hasher.finish() !== book.sha256) throw new Error(`${book.file} didn't match its checksum`);
    try {
      await cache.put(url, new Response(bytes, { headers: { "Content-Type": r.headers.get("Content-Type") ?? "application/epub+zip" } }));
    } catch {
      throw new Stop("This browser has no room to keep the books.");
    }
  }

  /** One piece, from where its file ends, checked; handed to the VFS. */
  private async downloadPiece(dir: FileSystemDirectoryHandle, i: number, signal: AbortSignal) {
    const chunk = this.manifest!.chunks[i];
    const h = await openHandle(dir, chunk.file, true);
    let handedOver = false;
    try {
      for (let attempt = 0; ; attempt++) {
        let pos = h.getSize();
        if (pos > chunk.size) {
          h.truncate(0);
          pos = 0;
        }
        let hasher = new Hasher();
        // What an earlier run left: hashed again, as it is on disk.
        const buf = new Uint8Array(4 << 20);
        for (let at = 0; at < pos; ) {
          const n = h.read(buf.subarray(0, Math.min(buf.length, pos - at)), { at });
          if (n <= 0) {
            h.truncate(at);
            pos = at;
            break;
          }
          hasher.update(buf.subarray(0, n));
          at += n;
        }
        this.partial = pos;
        if (pos < chunk.size) {
          const r = await fetch(this.base + chunk.file, {
            headers: pos > 0 ? { Range: `bytes=${pos}-${chunk.size - 1}` } : {},
            // Not into the browser's HTTP cache as well: that would keep it twice.
            cache: "no-store",
            signal,
          });
          if (r.status === 200 && pos > 0) {
            // The server sent the whole file: start the piece over.
            h.truncate(0);
            pos = 0;
            hasher.free();
            hasher = new Hasher();
          } else if (r.status !== 206 && r.status !== 200) {
            if (r.status >= 500) throw new Error(`HTTP ${r.status}`);
            throw new Stop(`${chunk.file}: HTTP ${r.status}. Reload the page; if that doesn't help, the books on the server have changed.`);
          }
          const reader = r.body!.getReader();
          let sinceFlush = 0;
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (pos + value.length > chunk.size) throw new Stop(`${chunk.file} is bigger than the manifest says.`);
            h.write(value, { at: pos });
            hasher.update(value);
            pos += value.length;
            this.partial = pos;
            sinceFlush += value.length;
            if (sinceFlush >= FLUSH_EVERY) {
              h.flush();
              sinceFlush = 0;
            }
            this.report(false);
          }
        }
        h.flush();
        // The connection ended early: resumed next time from here.
        if (pos !== chunk.size) throw new Error(`${chunk.file} ended early`);
        if (hasher.finish() === chunk.sha256) {
          offline_add(this.file, i, h);
          handedOver = true;
          return;
        }
        h.truncate(0);
        h.flush();
        this.partial = 0;
        if (attempt >= 1) throw new Stop(`${chunk.file} didn't match its checksum, twice. Try again later.`);
      }
    } finally {
      if (!handedOver) {
        try {
          h.flush();
        } catch {
          /* closing anyway */
        }
        h.close();
      }
    }
  }
}

// ---- The copies --------------------------------------------------------------

const copies = new Map<string, OfflineCopy>();

export const CONTENT = "content";
export const shelfTarget = (id: string) => `shelf:${id}`;

function copyFor(target: string): OfflineCopy {
  let c = copies.get(target);
  if (!c) {
    c = target === CONTENT
      ? new OfflineCopy(CONTENT, "content.db", ["sojourner-offline"])
      : new OfflineCopy(target, `shelf-${target.slice("shelf:".length)}.db`, ["sojourner-shelf-offline", target.slice("shelf:".length)]);
    copies.set(target, c);
  }
  return c;
}

let listening = false;

/** Before the backend starts: content.db's copy (see `OfflineCopy.open`). */
export async function openOffline(m: ContentManifest, contentBase: string, send: (m: FromWorker) => void) {
  post = send;
  if (!listening) {
    listening = true;
    globalThis.addEventListener("online", () => copies.forEach((c) => c.onOnline()));
  }
  await copyFor(CONTENT).open(m, contentBase);
}

/** Before a shelf's database is attached: its copy, if it has one. */
export async function openShelfOffline(id: string, manifest: Manifest, base: string) {
  const copy = copyFor(shelfTarget(id));
  await copy.open(manifest, base);
  // A shelf added now: the page is already listening for it.
  copy.report();
}

/** After start: each copy says where it stands and carries on. */
export function resumeOffline() {
  copies.forEach((c) => c.resume());
}

export async function offlineOp(op: OfflineOp, target: string = CONTENT) {
  const c = copies.get(target);
  // A shelf that isn't added has no copy to speak of.
  if (!c) return post({ kind: "offline", target, status: { state: "none", done: 0, total: 0, pieces: 0, piecesDone: 0, error: null } });
  await c.op(op);
}

/** A shelf removed: its copy goes with it. */
export async function dropShelfOffline(id: string) {
  const c = copies.get(shelfTarget(id));
  if (!c) return;
  await c.op("remove");
  copies.delete(shelfTarget(id));
}
