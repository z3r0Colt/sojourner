/**
 * The web app's backend: Sojourner's Rust commands compiled to WebAssembly
 * (src-tauri/crates/sojourner-web), over one SQLite connection with user.db
 * in the browser's private files and content.db read over HTTP. A worker,
 * because both of those need synchronous I/O, which a page may not do.
 *
 * Each call runs to its end before the next starts. One that stops to have
 * its rows' pages fetched together (`fetch_plan` in wasm.rs) waits for them
 * and runs again; others may be answered meanwhile.
 */
import init, { call, check_user_db, export_user_db, fetch_plan, http_stats, import_user_db, prefetch_put, set_prefetch, start } from "@sojourner/wasm";
import { offlineOp, openOffline, resumeOffline } from "./offlineCopy";
import { attachSaved, shelfOp } from "./shelfWorker";
import type { FromWorker, StartConfig, ToWorker } from "./protocol";

const scope = self as unknown as {
  postMessage(message: FromWorker, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent<ToWorker>) => void) | null;
};
const post = (m: FromWorker) => scope.postMessage(m);

let crashed = false;
/** What the page said at start about the shelves (see shelfWorker.ts). */
let shelves: StartConfig["shelves"] = { base: "", list: [] };

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
      // First, so the VFS reads what has been downloaded from the start.
      await openOffline(m.config.manifest, m.config.contentBase, post);
      const info = JSON.parse(await start(JSON.stringify(m.config)));
      if (tracing) http_stats(true);
      if (m.config.prefetch === false) set_prefetch(false);
      shelves = m.config.shelves;
      await attachSaved(shelves);
      post({ kind: "started", info });
      resumeOffline();
    } catch (err) {
      post({ kind: "failed", error: parseError(err) });
    }
    return;
  }
  if (m.kind === "offline") {
    await offlineOp(m.op);
    return;
  }
  if (m.kind === "shelf") {
    try {
      await shelfOp(shelves, m.op, m.shelf);
      post({ kind: "shelf", id: m.id, ok: true });
    } catch (err) {
      post({ kind: "shelf", id: m.id, ok: false, error: typeof err === "string" ? err : err instanceof Error ? err.message : String(err) });
    }
    return;
  }
  if (m.kind === "data") {
    try {
      switch (m.op) {
        case "export": {
          const bytes = export_user_db();
          scope.postMessage({ kind: "data", id: m.id, ok: true, bytes }, [bytes.buffer]);
          break;
        }
        case "check":
          post({ kind: "data", id: m.id, ok: true, json: check_user_db(m.bytes ?? new Uint8Array()) });
          break;
        case "import":
          import_user_db(m.bytes ?? new Uint8Array());
          post({ kind: "data", id: m.id, ok: true });
          break;
      }
    } catch (err) {
      post({ kind: "data", id: m.id, ok: false, error: JSON.parse(typeof err === "string" ? err : JSON.stringify(String(err))) });
    }
    return;
  }
  const t0 = performance.now();
  try {
    post({ kind: "reply", id: m.id, ok: true, json: await callFetchingAhead(m.cmd, m.args) });
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
    post({ kind: "trace", cmd: m.cmd, ms: performance.now() - t0, requests: http.requests, bytes: http.bytes, log: http.log });
  }
};

/** What `call` throws when the command wants pages fetched first (wasm.rs). */
const FETCH_FIRST = "\u0001fetch-first";
/** Rounds of fetching before a command is left to read row by row. */
const FETCH_ROUNDS = 4;

/** `call`, but a search's page of results is fetched in parallel rather
 * than one request per row in turn: the command says which pages it is
 * about to read, they are fetched together, and it runs again. */
async function callFetchingAhead(cmd: string, args: string): Promise<string> {
  for (let round = 0; round < FETCH_ROUNDS; round++) {
    try {
      return call(cmd, args);
    } catch (err) {
      if (err !== FETCH_FIRST) throw err;
    }
    const plan = JSON.parse(fetch_plan()) as [string, number, number, number][];
    await Promise.all(
      plan.map(async ([url, first, last, block]) => {
        try {
          const r = await fetch(url, { headers: { Range: `bytes=${first}-${last}` } });
          const bytes = new Uint8Array(await r.arrayBuffer());
          if (r.status === 206 && bytes.length === last - first + 1) prefetch_put(block, bytes);
        } catch {
          // Read again one at a time below, which reports a failure properly.
        }
      }),
    );
  }
  set_prefetch(false);
  try {
    return call(cmd, args);
  } finally {
    set_prefetch(true);
  }
}

/** `start` rejects with the JSON of a string. */
function parseError(err: unknown): unknown {
  if (typeof err !== "string") return String(err instanceof Error ? err.message : err);
  try {
    return JSON.parse(err);
  } catch {
    return err;
  }
}
