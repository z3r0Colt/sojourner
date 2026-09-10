import { invoke } from "@tauri-apps/api/core";

/** Mirrors the backend's panic-hook crash log: an uncaught error or promise
 * rejection in the webview wouldn't otherwise leave any trace, so both are
 * forwarded to the same `logs/` folder in app data. Best-effort -- if the
 * logging call itself fails, there's nothing more useful to do than drop it. */
export function installCrashLogging() {
  window.addEventListener("error", (e) => {
    invoke("log_frontend_error", { message: e.message, stack: e.error?.stack ?? null }).catch(() => {});
  });
  window.addEventListener("unhandledrejection", (e) => {
    const reason = e.reason;
    const message = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack : undefined;
    invoke("log_frontend_error", { message: `Unhandled promise rejection: ${message}`, stack: stack ?? null }).catch(() => {});
  });
}
