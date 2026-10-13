/**
 * The page's side of the web backend: `invoke()` in web mode
 * (src/lib/platform.ts) lands here, and goes to the worker in worker.ts.
 * Loaded only in the web build.
 */
import pinnedContent from "./content.json";
import { claimTab } from "./tabLock";
import { shelfConfig } from "./shelves";
import type { DataOp, FromWorker, OfflineOp, OfflineStatus, StartConfig, StartInfo, ToWorker } from "./protocol";

/** Where content.db's pieces and manifest are: in dev, content/web/ as the
 * dev server serves it (vite.config.ts); in a build, the content version
 * this app was made with (content.json, written by
 * `npm run upload:content:web`) on R2. $VITE_CONTENT_BASE overrides both,
 * e.g. to try R2 from `npm run dev:web`. */
const CONTENT_BASE =
  import.meta.env.VITE_CONTENT_BASE ?? (import.meta.env.DEV ? "/dev-content/" : `${pinnedContent.base}${pinnedContent.version}/`);

type Pending = { resolve: (v: unknown) => void; reject: (e: unknown) => void };

let worker: Worker | null = null;
let started: Promise<StartInfo> | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();
const pendingShelf = new Map<number, Pending>();
const pendingData = new Map<number, { resolve: (v: { bytes?: Uint8Array; json?: string }) => void; reject: (e: unknown) => void }>();

/** The content version last started with: in dev the content's version
 * isn't in the URL, so this says which offline copy to look for. */
const LAST_VERSION_KEY = "sojourner-content-version";

/** The manifest an offline copy (offlineCopy.ts) keeps beside its pieces. */
async function storedManifest(version: string | null): Promise<StartConfig["manifest"] | null> {
  if (!version) return null;
  try {
    const top = await navigator.storage.getDirectory();
    const dir = await (await top.getDirectoryHandle("sojourner-offline")).getDirectoryHandle(version);
    const m = JSON.parse(await (await (await dir.getFileHandle("manifest.json")).getFile()).text());
    return m?.version === version ? m : null;
  } catch {
    return null;
  }
}

async function config(): Promise<StartConfig> {
  const base = new URL(CONTENT_BASE, window.location.href).href;
  const pinned = import.meta.env.DEV || import.meta.env.VITE_CONTENT_BASE ? null : pinnedContent.version;
  let last: string | null = null;
  try {
    last = localStorage.getItem(LAST_VERSION_KEY);
  } catch {
    /* no storage: no offline start in dev */
  }
  const stored = await storedManifest(pinned ?? last);
  let manifest: StartConfig["manifest"];
  if (stored && pinned) {
    // A content version never changes, so the copy's manifest is the one on R2.
    manifest = stored;
  } else {
    try {
      const r = await fetch(new URL("manifest.json", base), stored ? { signal: AbortSignal.timeout(5000) } : {});
      if (!r.ok) throw `HTTP ${r.status}`;
      manifest = await r.json();
    } catch (e) {
      if (stored) manifest = stored;
      else throw `Couldn't load the books from ${new URL(base).host} (${e instanceof Error ? e.message : String(e)}). Are you online?`;
    }
  }
  try {
    localStorage.setItem(LAST_VERSION_KEY, manifest.version);
  } catch {
    /* as above */
  }
  // Dev: `?noprefetch` reads search results row by row, to compare.
  const prefetch = import.meta.env.DEV && new URLSearchParams(location.search).has("noprefetch") ? false : undefined;
  return { contentBase: base, manifest, appVersion: import.meta.env.VITE_APP_VERSION, prefetch, shelves: shelfConfig() };
}

const offlineStatus = new Map<string, OfflineStatus>();
const offlineListeners = new Set<{ target: string; listener: (s: OfflineStatus) => void }>();

/** Calls `listener` with where an offline copy stands -- `target` "content"
 * for the books, "shelf:<id>" for a library shelf -- now (if known) and
 * whenever it changes; returns the unsubscribe. */
export function onOfflineStatus(target: string, listener: (s: OfflineStatus) => void): () => void {
  const entry = { target, listener };
  offlineListeners.add(entry);
  const now = offlineStatus.get(target);
  if (now) listener(now);
  return () => offlineListeners.delete(entry);
}

/** Starts or resumes a copy's download, pauses it, or deletes the copy;
 * the answer comes through `onOfflineStatus`. */
export async function offlineOp(op: OfflineOp, target = "content"): Promise<void> {
  await backendInfo();
  worker?.postMessage({ kind: "offline", op, target } satisfies ToWorker);
}

function failAll(error: unknown) {
  for (const p of pending.values()) p.reject(error);
  pending.clear();
  for (const p of pendingData.values()) p.reject(error);
  pendingData.clear();
  for (const p of pendingShelf.values()) p.reject(error);
  pendingShelf.clear();
}

/** Stops the worker, which lets go of the reader's files (another tab has
 * taken over: tabLock.ts). The next call would start a new one. */
export function stopBackend() {
  failAll("Sojourner is open in another tab.");
  worker?.terminate();
  worker = null;
  started = null;
}

/** The reader's files are held by one worker at a time. One that was just
 * stopped (another tab took over, or this one was reloaded) lets go a moment
 * later, so a start that finds them held tries again before settling for
 * keeping the data in memory. */
const HELD_RETRIES = 10;

function boot(attempt = 0): Promise<StartInfo> {
  const w = new Worker(new URL("./worker.ts", import.meta.url), { type: "module", name: "sojourner-backend" });
  worker = w;
  return new Promise<StartInfo>((resolve, reject) => {
    const crashed = (error: string) => {
      console.error("Sojourner's backend stopped:", error);
      failAll(error);
      w.terminate();
      // The next call starts a new one.
      if (worker === w) {
        worker = null;
        started = null;
      }
      reject(error);
    };
    w.onmessage = (e: MessageEvent<FromWorker>) => {
      const m = e.data;
      switch (m.kind) {
        case "started":
          if (!m.info.persistent && attempt < HELD_RETRIES && /SyncAccessHandle/.test(m.info.storageError ?? "")) {
            w.terminate();
            if (worker === w) worker = null;
            setTimeout(() => boot(attempt + 1).then(resolve, reject), 500);
            break;
          }
          // Dev builds: for the harness, as the trace below.
          if (import.meta.env.DEV) (window as { __sojournerStart?: StartInfo }).__sojournerStart = m.info;
          resolve(m.info);
          break;
        case "failed":
          // Not retried: a reload tries again.
          console.error("Sojourner's backend did not start:", m.error);
          reject(m.error);
          break;
        case "reply": {
          const p = pending.get(m.id);
          pending.delete(m.id);
          if (!p) break;
          if (m.ok) p.resolve(JSON.parse(m.json));
          else p.reject(JSON.parse(m.json));
          break;
        }
        case "data": {
          const p = pendingData.get(m.id);
          pendingData.delete(m.id);
          if (!p) break;
          if (m.ok) p.resolve({ bytes: m.bytes, json: m.json });
          else p.reject(m.error);
          break;
        }
        case "shelf": {
          const p = pendingShelf.get(m.id);
          pendingShelf.delete(m.id);
          if (m.ok) p?.resolve(undefined);
          else p?.reject(m.error ?? "The shelf could not be changed.");
          break;
        }
        case "crashed":
          crashed(m.error);
          break;
        case "trace":
          traceCall(m);
          break;
        case "offline":
          offlineStatus.set(m.target, m.status);
          if (import.meta.env.DEV && m.target === "content") (window as { __sojournerOffline?: OfflineStatus }).__sojournerOffline = m.status;
          for (const l of offlineListeners) if (l.target === m.target) l.listener(m.status);
          break;
      }
    };
    w.onerror = (e) => crashed(e.message || "the backend's worker failed");
    config().then((c) => w.postMessage({ kind: "start", config: c } satisfies ToWorker), reject);
  });
}

type Trace = Extract<FromWorker, { kind: "trace" }>;

/** Over HTTP a query costs its round trips; anything above this many is
 * worth a look (docs/pwa-plan.md, phase 0's notes). */
const MANY_REQUESTS = 5;

/** Dev builds: every command's cost, newest last, on `window.__sojournerTrace`
 * for the harness, and a warning for an expensive one. */
function traceCall(t: Trace) {
  const w = window as { __sojournerTrace?: Trace[] };
  (w.__sojournerTrace ??= []).push(t);
  if (t.requests > MANY_REQUESTS) {
    console.warn(`[backend] ${t.cmd}: ${t.requests} requests, ${(t.bytes / 1024).toFixed(0)} KB, ${t.ms.toFixed(0)} ms`);
  }
}

/** How the backend started: whether the reader's data is stored, and so on. */
export function backendInfo(): Promise<StartInfo> {
  // Only the tab that holds the lock may open the reader's files (tabLock.ts):
  // anything that calls the backend before the lock is settled waits for it,
  // and one in a tab that doesn't hold it fails, without starting a worker.
  started ??= claimTab().then((mine) => {
    if (mine) return boot();
    started = null;
    return Promise.reject("Sojourner is open in another tab.");
  });
  return started;
}

export async function webInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  await backendInfo();
  const w = worker;
  if (!w) throw "Sojourner's backend is not running";
  return new Promise<T>((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    w.postMessage({ kind: "call", id, cmd, args: JSON.stringify(args ?? {}) } satisfies ToWorker);
  });
}

/** The reader's own data as a file: `export` gives the bytes of a copy of
 * user.db; `check` says whether a file the reader chose is one (resolving
 * with its schema, or rejecting with why not); `import` replaces user.db
 * with it, after which the page must reload (the worker answers nothing). */
export async function dataOp(op: "export"): Promise<Uint8Array>;
export async function dataOp(op: "check" | "import", bytes: Uint8Array): Promise<void>;
export async function dataOp(op: DataOp, bytes?: Uint8Array): Promise<Uint8Array | void> {
  await backendInfo();
  const w = worker;
  if (!w) throw "Sojourner's backend is not running";
  const done = await new Promise<{ bytes?: Uint8Array }>((resolve, reject) => {
    const id = nextId++;
    pendingData.set(id, { resolve, reject });
    w.postMessage({ kind: "data", id, op, bytes } satisfies ToWorker);
  });
  if (op === "export") return done.bytes ?? new Uint8Array();
}

/** Adds a library shelf (attaches it and gives its books their rows) or
 * removes it. Rejects with a sentence the reader can act on. */
export async function shelfOp(op: "add" | "remove", shelf: string): Promise<void> {
  await backendInfo();
  const w = worker;
  if (!w) throw "Sojourner's backend is not running";
  await new Promise<unknown>((resolve, reject) => {
    const id = nextId++;
    pendingShelf.set(id, { resolve, reject });
    w.postMessage({ kind: "shelf", id, op, shelf } satisfies ToWorker);
  });
}
