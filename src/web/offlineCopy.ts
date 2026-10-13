/**
 * "Make available offline", in the backend's worker: downloads content.db's
 * pieces from R2 into the browser's private files (OPFS), one at a time,
 * each checked against the manifest's SHA-256 before the HTTP VFS reads it
 * (`offline_add` in wasm.rs). Once every piece is there, nothing is read
 * over the network.
 *
 * On OPFS, `sojourner-offline/<content version>/`:
 *   manifest.json        the manifest, so the app can start without the network
 *   content.db.000 ...   the pieces, each written in place as it downloads
 *   state.json           which pieces are checked, and whether the reader paused
 *
 * A piece left half-done (the tab closed, the network dropped) is resumed
 * from where its file ends: what is there is hashed again, the rest asked
 * for with a Range. A piece that fails its checksum is downloaded again
 * once, then the download stops with the reason. Another content version's
 * folder is deleted at start: its pages mean nothing to this app.
 *
 * The download runs between commands: the worker answers the page as usual,
 * and the stream waits while a command runs.
 */
import { Hasher, offline_add, offline_clear, page_cache_bytes, page_cache_clear } from "@sojourner/wasm";
import type { ContentManifest, FromWorker, OfflineOp, OfflineStatus } from "./protocol";

const ROOT = "sojourner-offline";
const STATE = "state.json";
const MANIFEST = "manifest.json";
/** A piece being written is flushed this often, so a resume loses little. */
const FLUSH_EVERY = 8 << 20;
/** Room asked for beyond the copy itself. */
const MARGIN = 64 << 20;
/** Waits before trying the network again, then the last one over and over. */
const RETRY_MS = [5_000, 15_000, 30_000, 60_000];
/** How often progress goes to the page while bytes arrive. */
const REPORT_MS = 250;

type Saved = { verified: number[]; paused: boolean };

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

let manifest: ContentManifest | null = null;
let base = "";
let post: (m: FromWorker) => void = () => {};
/** The reader's choice, as state.json keeps it; null when there is no copy. */
let saved: Saved | null = null;
let state: OfflineStatus["state"] = "none";
let error: string | null = null;
/** Bytes of the piece under way. */
let partial = 0;
let running: Promise<void> | null = null;
let abort: AbortController | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retries = 0;
let lastReport = 0;

const mb = (n: number) => `${Math.max(1, Math.round(n / 1e6))} MB`;

function status(): OfflineStatus {
  const m = manifest;
  const verified = saved?.verified ?? [];
  const done = m ? verified.reduce((sum, i) => sum + (m.chunks[i]?.size ?? 0), 0) + partial : 0;
  return { state, done, total: m?.size ?? 0, pieces: m?.chunks.length ?? 0, piecesDone: verified.length, error };
}

function report(force = true) {
  const now = performance.now();
  if (!force && now - lastReport < REPORT_MS) return;
  lastReport = now;
  post({ kind: "offline", status: status() });
}

function setState(s: OfflineStatus["state"], e: string | null = null) {
  state = s;
  error = e;
  report();
}

async function root(): Promise<FileSystemDirectoryHandle> {
  const top = await navigator.storage.getDirectory();
  return top.getDirectoryHandle(ROOT, { create: true });
}

async function versionDir(create: boolean): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await (await root()).getDirectoryHandle(manifest!.version, { create });
  } catch {
    return null;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

async function saveState() {
  const dir = await versionDir(true);
  if (dir && saved) await writeText(dir, STATE, JSON.stringify(saved));
}

/**
 * Before the backend starts (so the skeleton can come from the copy): finds
 * this content version's copy, hands its checked pieces to the VFS, and
 * deletes any other version's.
 */
export async function openOffline(m: ContentManifest, contentBase: string, send: (m: FromWorker) => void) {
  manifest = m;
  base = contentBase;
  post = send;
  globalThis.addEventListener("online", () => {
    if (state === "waiting") void offlineOp("download");
  });
  try {
    const top = await root();
    const names: string[] = [];
    for await (const name of (top as unknown as { keys(): AsyncIterable<string> }).keys()) names.push(name);
    for (const name of names) if (name !== m.version) await top.removeEntry(name, { recursive: true }).catch(() => {});

    const dir = await versionDir(false);
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
      offline_add(i, h);
      verified.push(i);
    }
    saved = { verified, paused: !!s.paused };
    state = verified.length === m.chunks.length ? "complete" : saved.paused ? "paused" : "downloading";
  } catch (e) {
    // Without OPFS (or with it held elsewhere) there is no offline copy.
    saved = null;
    state = "failed";
    error = `The browser's files couldn't be opened: ${e instanceof Error ? e.message : String(e)}`;
  }
}

/** After the backend has started: says where things stand, and carries on
 * a download the reader didn't pause. */
export function resumeOffline() {
  if (state === "downloading") {
    state = "paused"; // until the loop says otherwise
    void offlineOp("download");
  } else {
    report();
  }
}

export async function offlineOp(op: OfflineOp) {
  switch (op) {
    case "download":
      if (!manifest) return;
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      saved ??= { verified: [], paused: false };
      saved.paused = false;
      if (saved.verified.length === manifest.chunks.length) return setState("complete");
      if (running) {
        // Still stopping after a pause: start again once it has.
        if (abort?.signal.aborted) void running.then(() => offlineOp("download"));
      } else {
        running = run().finally(() => {
          running = null;
        });
      }
      return;
    case "pause":
      if (!saved || state === "complete") return report();
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      saved.paused = true;
      abort?.abort();
      await running?.catch(() => {});
      // Resumed (or removed) while this waited.
      if (!saved?.paused) return;
      await saveState();
      return setState("paused");
    case "remove": {
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      saved = null;
      abort?.abort();
      await running?.catch(() => {});
      offline_clear();
      partial = 0;
      if (manifest) await (await root()).removeEntry(manifest.version, { recursive: true }).catch(() => {});
      return setState("none");
    }
    case "status":
      return report();
  }
}

async function run() {
  const m = manifest!;
  const controller = new AbortController();
  abort = controller;
  try {
    const dir = await versionDir(true);
    if (!dir) throw new Stop("The browser's files couldn't be opened.");
    await writeText(dir, MANIFEST, JSON.stringify(m));
    await saveState();
    await makeRoom(m);
    setState("downloading");
    for (let i = 0; i < m.chunks.length; i++) {
      if (saved!.verified.includes(i)) continue;
      await downloadPiece(dir, i, controller.signal);
      retries = 0;
      saved!.verified.push(i);
      partial = 0;
      await saveState();
      report();
    }
    // Every page is here now: the cache of pages read online holds copies.
    page_cache_clear();
    setState("complete");
  } catch (e) {
    partial = 0;
    if (controller.signal.aborted) return; // paused or removed: that op reports
    if (e instanceof Stop) {
      setState("failed", e.message);
      return;
    }
    // The network: try again by itself, sooner when the browser says it is back.
    const wait = RETRY_MS[Math.min(retries++, RETRY_MS.length - 1)];
    setState("waiting", `Couldn't reach ${new URL(base).host}. Trying again in ${Math.round(wait / 1000)} seconds.`);
    retryTimer = setTimeout(() => void offlineOp("download"), wait);
  } finally {
    if (abort === controller) abort = null;
  }
}

/** Says no before downloading what won't fit. The page cache is emptied
 * when that is what makes it fit: its pages are in the copy too. */
async function makeRoom(m: ContentManifest) {
  const have = saved!.verified.reduce((sum, i) => sum + m.chunks[i].size, 0);
  const need = m.size - have + MARGIN;
  const est = await navigator.storage.estimate().catch(() => null);
  if (!est?.quota) return;
  const free = est.quota - (est.usage ?? 0);
  if (free >= need) return;
  if (free + page_cache_bytes() >= need) {
    page_cache_clear();
    return;
  }
  throw new Stop(`There isn't room: the books need ${mb(need)} more, and this browser allows Sojourner ${mb(Math.max(0, free))}.`);
}

/** One piece, from where its file ends, checked; handed to the VFS. */
async function downloadPiece(dir: FileSystemDirectoryHandle, i: number, signal: AbortSignal) {
  const chunk = manifest!.chunks[i];
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
      partial = pos;
      if (pos < chunk.size) {
        const r = await fetch(base + chunk.file, {
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
          partial = pos;
          sinceFlush += value.length;
          if (sinceFlush >= FLUSH_EVERY) {
            h.flush();
            sinceFlush = 0;
          }
          report(false);
        }
      }
      h.flush();
      // The connection ended early: resumed next time from here.
      if (pos !== chunk.size) throw new Error(`${chunk.file} ended early`);
      if (hasher.finish() === chunk.sha256) {
        offline_add(i, h);
        handedOver = true;
        return;
      }
      h.truncate(0);
      h.flush();
      partial = 0;
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
