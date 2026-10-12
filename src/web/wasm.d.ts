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
}
