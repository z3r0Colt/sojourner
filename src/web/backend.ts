/**
 * The page's side of the web backend: `invoke()` in web mode
 * (src/lib/platform.ts) lands here, and goes to the worker in worker.ts.
 * Loaded only in the web build.
 */
import type { FromWorker, StartConfig, StartInfo, ToWorker } from "./protocol";

/** Where content.db and its skeleton are served from. The dev server
 * serves content/web/ here (vite.config.ts). */
const CONTENT_BASE = import.meta.env.VITE_CONTENT_BASE ?? "/dev-content/";

type Pending = { resolve: (v: unknown) => void; reject: (e: unknown) => void };

let worker: Worker | null = null;
let started: Promise<StartInfo> | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();

async function config(): Promise<StartConfig> {
  const base = new URL(CONTENT_BASE, window.location.href);
  const contentUrl = new URL("content.db", base).href;
  const appVersion = import.meta.env.VITE_APP_VERSION;
  // The skeleton is an optimization: without it, everything still works.
  try {
    const r = await fetch(new URL("skeleton.json", base));
    if (r.ok) return { contentUrl, appVersion, skeleton: { url: new URL("skeleton.bin", base).href, pages: await r.json() } };
  } catch {
    // No skeleton.
  }
  return { contentUrl, appVersion };
}

function failAll(error: unknown) {
  for (const p of pending.values()) p.reject(error);
  pending.clear();
}

function boot(): Promise<StartInfo> {
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
        case "crashed":
          crashed(m.error);
          break;
        case "trace":
          traceCall(m);
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
  started ??= boot();
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
