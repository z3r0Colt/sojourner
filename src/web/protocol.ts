/** Messages between the page (`backend.ts`) and the backend's worker. */

/** content/web/manifest.json, as `build_web_content` writes it (the worker
 * reads it: httpvfs.rs). */
export type ContentManifest = {
  format: number;
  version: string;
  schema: number;
  size: number;
  pageSize: number;
  chunkSize: number;
  chunks: { file: string; size: number; sha256: string }[];
  skeleton: { file: string; sha256: string; pages: number[] };
  hot: [number, number][];
};

export type StartConfig = {
  /** Where content.db's pieces are: an absolute URL ending in `/`. */
  contentBase: string;
  manifest: ContentManifest;
  /** package.json's version, for Settings → About. */
  appVersion: string;
  /** Overrides, for the harness: pages kept in memory, and in the browser's
   * files (0 turns that cache off). */
  cacheMb?: number;
  diskCacheMb?: number;
  /** False: commands read their rows one at a time (dev, `?noprefetch`). */
  prefetch?: boolean;
  /** The library shelves this app knows (shelves.json), and where they are:
   * the worker attaches those the reader has added. */
  shelves: { base: string; list: { id: string; version: string }[] };
};

export type ToWorker =
  | { kind: "start"; config: StartConfig }
  /** `args`: the JSON of the arguments object. */
  | { kind: "call"; id: number; cmd: string; args: string }
  /** The reader's own data as a file (user.db): `export` answers with its
   * bytes, `check` and `import` take the bytes of a file the reader chose. */
  | { kind: "data"; id: number; op: DataOp; bytes?: Uint8Array }
  /** An offline copy (offlineCopy.ts) -- `target` "content" for the books,
   * "shelf:<id>" for a library shelf: start or resume the download, pause
   * it, or delete the copy. The worker answers with an `offline` status for
   * that target, as it does whenever the status changes. */
  | { kind: "offline"; op: OfflineOp; target: string }
  /** Adds a library shelf (attaches it and gives its books rows) or removes
   * it; answered by a `shelf` message with the same `id`. */
  | { kind: "shelf"; id: number; op: "add" | "remove"; shelf: string };

export type DataOp = "export" | "check" | "import";

export type OfflineOp = "download" | "pause" | "remove" | "status";

/** Where "Make available offline" stands. `waiting`: the network failed
 * and the download will try again by itself; `failed`: it won't (the
 * reason is in `error`) until the reader asks again. */
export type OfflineStatus = {
  state: "none" | "downloading" | "paused" | "waiting" | "complete" | "failed";
  /** Bytes downloaded and checked, or in a piece under way (a shelf's
   * books included). */
  done: number;
  total: number;
  pieces: number;
  piecesDone: number;
  error: string | null;
};

export type StartInfo = {
  /** False when the browser gave no private file storage: user.db is then
   * in memory, and gone when the page is closed. */
  persistent: boolean;
  storageError: string | null;
  sqlite: string;
  ms: number;
  contentVersion: string;
  /** What the persistent page cache holds, or null without one
   * (`pageCacheError` says why: e.g. Sojourner open in another tab). */
  pageCache: { pages: number; bytes: number } | null;
  pageCacheError: string | null;
};

export type FromWorker =
  | { kind: "started"; info: StartInfo }
  | { kind: "offline"; target: string; status: OfflineStatus }
  | { kind: "failed"; error: unknown }
  /** `json`: the answer's JSON (`ok`), or the error's (not `ok`). */
  | { kind: "reply"; id: number; ok: boolean; json: string }
  | { kind: "data"; id: number; ok: boolean; bytes?: Uint8Array; json?: string; error?: string }
  | { kind: "shelf"; id: number; ok: boolean; error?: string }
  /** The module stopped (a panic): every call in flight fails, and the
   * next one starts a new worker. */
  | { kind: "crashed"; id: number | null; error: string }
  /** Dev builds: what one command cost, for the request-counting harness. */
  /** `log`: the page runs fetched, `[first, last, hot]`. */
  | { kind: "trace"; cmd: string; ms: number; requests: number; bytes: number; log?: [number, number, boolean][] };
