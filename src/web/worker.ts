/**
 * The web app's backend: Sojourner's Rust commands compiled to WebAssembly
 * (src-tauri/crates/sojourner-web), over one SQLite connection with user.db
 * in the browser's private files and content.db read over HTTP. A worker,
 * because both of those need synchronous I/O, which a page may not do.
 *
 * Calls are answered one at a time, in order, as they arrive.
 */
import init, { call, http_stats, start } from "@sojourner/wasm";
import type { FromWorker, ToWorker } from "./protocol";

const scope = self as unknown as {
  postMessage(message: FromWorker): void;
  onmessage: ((e: MessageEvent<ToWorker>) => void) | null;
};
const post = (m: FromWorker) => scope.postMessage(m);

let crashed = false;

/** Dev builds report each command's HTTP traffic (see `trace` in
 * protocol.ts): over HTTP a query costs its round trips. */
const tracing = import.meta.env.DEV;

/** After a panic the module is unusable; its message, if the panic hook
 * left one (see `panic_hook` in wasm.rs), says why. */
function crashMessage(e: unknown): string {
  const g = globalThis as { __sojournerPanic?: string };
  return g.__sojournerPanic ?? String(e instanceof Error ? e.message : e);
}

scope.onmessage = async (e) => {
  const m = e.data;
  if (crashed) return;
  if (m.kind === "start") {
    try {
      await init();
      const info = JSON.parse(await start(JSON.stringify(m.config)));
      if (tracing) http_stats(true);
      post({ kind: "started", info });
    } catch (err) {
      post({ kind: "failed", error: parseError(err) });
    }
    return;
  }
  const t0 = performance.now();
  try {
    post({ kind: "reply", id: m.id, ok: true, json: call(m.cmd, m.args) });
  } catch (err) {
    if (err instanceof WebAssembly.RuntimeError) {
      crashed = true;
      post({ kind: "crashed", id: m.id, error: crashMessage(err) });
    } else {
      post({ kind: "reply", id: m.id, ok: false, json: typeof err === "string" ? err : JSON.stringify(String(err)) });
    }
  }
  if (tracing && !crashed) {
    const http = JSON.parse(http_stats(true));
    post({ kind: "trace", cmd: m.cmd, ms: performance.now() - t0, requests: http.requests, bytes: http.bytes });
  }
};

/** `start` rejects with the JSON of a string. */
function parseError(err: unknown): unknown {
  if (typeof err !== "string") return String(err instanceof Error ? err.message : err);
  try {
    return JSON.parse(err);
  } catch {
    return err;
  }
}
