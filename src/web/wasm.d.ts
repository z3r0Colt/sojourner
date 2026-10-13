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
  /** Reads content.db's piece `index` from this downloaded, checked file
   * from now on; the module owns (and closes) the handle. */
  export function offline_add(index: number, handle: unknown): void;
  /** Closes the offline copy's files: content.db is read over the network. */
  export function offline_clear(): void;
  /** Empties the persistent page cache (keeping the skeleton). */
  export function page_cache_clear(): void;
  /** What the persistent page cache holds, in bytes. */
  export function page_cache_bytes(): number;
  /** Incremental SHA-256; `finish` gives lowercase hex and frees it. */
  export class Hasher {
    constructor();
    update(bytes: Uint8Array): void;
    finish(): string;
    free(): void;
  }
}
