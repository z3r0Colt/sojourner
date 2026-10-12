import { convertFileSrc as tauriConvertFileSrc, invoke as tauriInvoke } from "@tauri-apps/api/core";
import { openUrl as tauriOpenUrl } from "@tauri-apps/plugin-opener";

/**
 * Where the page is running: in Sojourner's own window, in a browser on
 * another device, served by the desktop app (Settings → Other devices; see
 * src-tauri/src/remote.rs), or as Sojourner on the web (`onWeb`).
 *
 * The page talks to the backend only through this module, so the same
 * screens work in both. In a browser a command is a POST to `/api/<name>`
 * on the computer that served the page; a library file or a map tile is a
 * plain URL there. What needs this computer's own hands -- a file dialog,
 * the printer -- is hidden in a browser (`inBrowser`), and the server
 * refuses those commands besides.
 */
/** Sojourner on the web (`vite --mode web`): the backend runs in the page
 * itself, in a worker (src/web/), and there is no desktop to borrow from.
 * Fixed at build time (vite.config.ts), so the desktop bundle carries none
 * of the web code. */
export const onWeb = import.meta.env.VITE_TARGET === "web";

// Tests run in jsdom, which has no Tauri either; they stand Tauri in.
export const inBrowser =
  !onWeb && import.meta.env.MODE !== "test" && typeof window !== "undefined" && !("__TAURI_INTERNALS__" in window);

/** On the desktop: the window's own printer and file dialogs. */
export const onDesktop = !inBrowser && !onWeb;

/** Sojourner's own window on Windows, where wording may name Windows
 * ("Match Windows", "Windows voices"). Elsewhere -- Linux, or a browser on
 * a phone -- the same things are "the system's". */
export const onWindows = onDesktop && typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent);

/** Sojourner's own window on Linux (WebKitGTK). */
export const onLinux = onDesktop && typeof navigator !== "undefined" && /Linux/i.test(navigator.userAgent) && !/Android/i.test(navigator.userAgent);

/** "Windows" in Sojourner's window on Windows, "system" anywhere else:
 * for wording like "the Windows voices" / "the system voices". */
export const systemName = onWindows ? "Windows" : "system";

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (onWeb) return (await import("../web/backend")).webInvoke<T>(cmd, args);
  if (!inBrowser) return tauriInvoke<T>(cmd, args);
  const response = await fetch(`/api/${encodeURIComponent(cmd)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args ?? {}),
    credentials: "same-origin",
  });
  // This device's link is no longer good (a new one was made on the
  // computer): back to the page that asks for the key, rather than an error
  // from every list on the screen.
  // Once: through the Vite dev server, "/" is this page again, not the key's.
  if (response.status === 401 && !recentlySentBack()) {
    window.location.replace("/");
    return new Promise<T>(() => {});
  }
  const type = response.headers.get("Content-Type") ?? "";
  if (!response.ok) {
    // As Tauri rejects: with the command's own error value.
    const text = await response.text();
    if (type.includes("application/json")) {
      try {
        throw JSON.parse(text);
      } catch (e) {
        if (!(e instanceof SyntaxError)) throw e;
      }
    }
    throw text || `${response.status} ${response.statusText}`;
  }
  if (type.includes("application/octet-stream")) return (await response.arrayBuffer()) as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : null) as T;
}

function recentlySentBack(): boolean {
  try {
    const last = Number(sessionStorage.getItem("sj-sent-back") ?? 0);
    if (Date.now() - last < 15_000) return true;
    sessionStorage.setItem("sj-sent-back", String(Date.now()));
  } catch {
    // No storage: send back regardless; the key page itself makes no calls.
  }
  return false;
}

/** A file on this computer (a library book, a recording) or a map tile, as
 * a URL the page can load. */
export function convertFileSrc(filePath: string, protocol = "asset"): string {
  // The web build has no files of its own to show yet.
  if (onWeb) return filePath;
  if (!inBrowser) return tauriConvertFileSrc(filePath, protocol);
  if (protocol === "sjtiles") return `${window.location.origin}/sjtiles/${encodeURIComponent(filePath)}`;
  return `${window.location.origin}/files/${encodeURIComponent(filePath)}`;
}

let mediaBase: Promise<string | null> | null = null;

/** A recording on this computer, as a URL its `<audio>` or `<video>` can
 * play. Linux's WebKitGTK plays nothing from the asset protocol, so there it
 * comes from the app's own loopback listener instead (src-tauri/src/media.rs);
 * everywhere else this is `convertFileSrc`. */
export async function mediaFileSrc(filePath: string): Promise<string> {
  if (!onLinux) return convertFileSrc(filePath);
  mediaBase ??= tauriInvoke<string | null>("media_base_url").catch(() => null);
  const base = await mediaBase;
  return base ? `${base}/${encodeURIComponent(filePath)}` : convertFileSrc(filePath);
}

/** A web link, in the system browser or a new tab. */
export async function openUrl(url: string): Promise<void> {
  if (onDesktop) return tauriOpenUrl(url);
  window.open(url, "_blank", "noopener,noreferrer");
}
