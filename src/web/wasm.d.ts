// The backend's WebAssembly module (`npm run build:wasm` writes it to
// src/web/pkg/, which is not committed). Declared here, under the alias
// vite.config.ts gives it, so the desktop build type-checks without it.
declare module "@sojourner/wasm" {
  export default function init(input?: unknown): Promise<unknown>;
  /** Opens user.db and attaches content.db; resolves with JSON about it. */
  export function start(config: string): Promise<string>;
  /** One command: the JSON of its answer, or throws the JSON of its error. */
  export function call(cmd: string, args: string): string;
  /** HTTP traffic since the last reset, as JSON. */
  export function http_stats(reset: boolean): string;
  /** A copy of user.db (throws the JSON of an error string). */
  export function export_user_db(): Uint8Array;
  /** Checks a file as a user.db; resolves with JSON `{schema}`. */
  export function check_user_db(bytes: Uint8Array): string;
  /** Replaces user.db with the file and closes the connection. */
  export function import_user_db(bytes: Uint8Array): void;
  /** Reads `file`'s piece `index` (content.db, or a shelf's `shelf-<id>.db`)
   * from this downloaded, checked file from now on; the module owns (and
   * closes) the handle. */
  export function offline_add(file: string, index: number, handle: unknown): void;
  /** Closes `file`'s offline copy: it is read over the network. */
  export function offline_clear(file: string): void;
  /** The pages the last command stopped for (it threw "\u0001fetch-first"),
   * as JSON `[[url, firstByte, lastByte, firstBlock], ...]`. */
  export function fetch_plan(): string;
  /** Pages fetched for `fetch_plan`, from block `first`. */
  export function prefetch_put(first: number, bytes: Uint8Array): void;
  /** Off: commands read their rows one at a time. */
  export function set_prefetch(on: boolean): void;
  /** Empties `file`'s persistent page cache (keeping the skeleton). */
  export function page_cache_clear(file: string): void;
  /** What `file`'s persistent page cache holds, in bytes. */
  export function page_cache_bytes(file: string): number;
  /** Attaches a library shelf (its manifest.json text, at `base`); resolves
   * with JSON. Call `shelves_sync` once every shelf is attached. */
  export function shelf_attach(id: string, base: string, manifestJson: string, cacheMb: number): Promise<string>;
  /** Makes the book rows agree with the attached shelves; resolves with JSON
   * `{added, adopted, repointed, retired, dropped}`. */
  export function shelves_sync(): string;
  /** Detaches a shelf and retires its books' rows; JSON `{retired}`. */
  export function shelf_remove(id: string): string;
  /** Incremental SHA-256; `finish` gives lowercase hex and frees it. */
  export class Hasher {
    constructor();
    update(bytes: Uint8Array): void;
    finish(): string;
    free(): void;
  }
}
