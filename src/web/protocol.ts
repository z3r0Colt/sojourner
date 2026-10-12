/** Messages between the page (`backend.ts`) and the backend's worker. */

export type StartConfig = {
  /** content.db, as an absolute URL. */
  contentUrl: string;
  /** Its interior b-tree pages in one file, and their page numbers. */
  skeleton?: { url: string; pages: number[] };
  /** package.json's version, for Settings → About. */
  appVersion: string;
};

export type ToWorker =
  | { kind: "start"; config: StartConfig }
  /** `args`: the JSON of the arguments object. */
  | { kind: "call"; id: number; cmd: string; args: string };

export type StartInfo = {
  /** False when the browser gave no private file storage: user.db is then
   * in memory, and gone when the page is closed. */
  persistent: boolean;
  storageError: string | null;
  sqlite: string;
  ms: number;
};

export type FromWorker =
  | { kind: "started"; info: StartInfo }
  | { kind: "failed"; error: unknown }
  /** `json`: the answer's JSON (`ok`), or the error's (not `ok`). */
  | { kind: "reply"; id: number; ok: boolean; json: string }
  /** The module stopped (a panic): every call in flight fails, and the
   * next one starts a new worker. */
  | { kind: "crashed"; id: number | null; error: string }
  /** Dev builds: what one command cost, for the request-counting harness. */
  | { kind: "trace"; cmd: string; ms: number; requests: number; bytes: number };
