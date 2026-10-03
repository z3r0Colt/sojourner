import { invoke } from "./platform";

/** A window error that is no crash, and is not written down as one: the
 * browser's "ResizeObserver loop completed with undelivered notifications"
 * (or, in older engines, "loop limit exceeded"). It says only that a size
 * observer's callback changed the layout it was watching, and the rest of
 * the changes were put off to the next frame -- which draws them. Nothing
 * failed, and nothing is lost; but resizing a pane could raise it several
 * times a second, and each one left a frontend-error file in the reader's
 * logs folder beside the real crashes. */
export function isBenignWindowError(message: string | null | undefined): boolean {
  return /^ResizeObserver loop (completed with undelivered notifications|limit exceeded)/.test(message ?? "");
}

/** Mirrors the backend's panic-hook crash log: an uncaught error or promise
 * rejection in the webview wouldn't otherwise leave any trace, so both are
 * forwarded to the same `logs/` folder in app data. Best-effort -- if the
 * logging call itself fails, there's nothing more useful to do than drop it. */
export function installCrashLogging() {
  window.addEventListener("error", (e) => {
    if (isBenignWindowError(e.message)) return;
    invoke("log_frontend_error", { message: e.message, stack: e.error?.stack ?? null }).catch(() => {});
  });
  window.addEventListener("unhandledrejection", (e) => {
    const reason = e.reason;
    const message = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack : undefined;
    invoke("log_frontend_error", { message: `Unhandled promise rejection: ${message}`, stack: stack ?? null }).catch(() => {});
  });
}
