/**
 * Sojourner as an installed app (the web build only; started from main.tsx):
 * registers the service worker (web-public/sw.js, which keeps the app's own
 * files for offline use), offers a new version when one has downloaded, and
 * remembers the browser's offer to install.
 */
import { toast } from "../components/ui/toast";

/** The browser's install offer (Chromium; Safari has none and is told how). */
interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let offer: InstallPrompt | null = null;
let installed = false;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((l) => l());

export type InstallState = "installed" | "offered" | "ios" | "mac-safari" | "firefox-desktop" | "unavailable";

export function installState(): InstallState {
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  if (installed || standalone) return "installed";
  if (offer) return "offered";
  const ua = navigator.userAgent;
  // iPhone and iPad (an iPad says it is a Mac, but has touch): every browser
  // there installs from the share sheet, and only there.
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "ios";
  // Safari on a Mac has no offer either, only a menu item (macOS 14 on).
  if (/Macintosh/.test(ua) && /Safari\//.test(ua) && !/Chrome|Chromium|Edg\/|OPR\/|Firefox/.test(ua)) return "mac-safari";
  // Firefox on a computer cannot install a web app at all.
  if (/Firefox\//.test(ua) && !/Android|Mobile/.test(ua)) return "firefox-desktop";
  return "unavailable";
}

/** How to install, in words, where the browser has no button for it. */
export function installHint(state: InstallState): string | null {
  switch (state) {
    case "ios":
      return "Tap the Share button, then Add to Home Screen.";
    case "mac-safari":
      return "In Safari's File menu, choose Add to Dock.";
    case "firefox-desktop":
      return "Firefox can't install web apps; Sojourner works as it is in this tab, or install it from Chrome or Edge.";
    case "unavailable":
      return "Your browser's menu may have Install app or Add to Home Screen.";
    default:
      return null;
  }
}

const VISITS_KEY = "sojourner-launches";
let launches = 0;

/** This device's count of launches, this one included (counted once, at
 * start). Kept in localStorage: installing is per device, so it doesn't
 * belong in the reader's data, which travels with an export. */
export function launchCount(): number {
  return launches;
}

/** Once per browsing session, not per page load: the service worker's first
 * activation reloads the page, and so does taking a new version. */
function countLaunch() {
  try {
    launches = Number(localStorage.getItem(VISITS_KEY)) || 0;
    if (!sessionStorage.getItem(VISITS_KEY)) {
      sessionStorage.setItem(VISITS_KEY, "1");
      localStorage.setItem(VISITS_KEY, String(++launches));
    }
  } catch {
    launches = 1;
  }
}

export function subscribeInstall(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function promptInstall(): Promise<void> {
  if (!offer) return;
  const o = offer;
  offer = null;
  changed();
  await o.prompt();
  if ((await o.userChoice).outcome === "accepted") installed = true;
  changed();
}

let reloading = false;

function offerUpdate(registration: ServiceWorkerRegistration) {
  toast.prompt("A new version of Sojourner is ready.", {
    durationMs: Infinity,
    action: {
      label: "Reload",
      onClick: () => {
        // The waiting worker takes over, and `controllerchange` reloads the
        // page onto the new files (never mid-way: the reader chose this).
        registration.waiting?.postMessage("skip-waiting");
      },
    },
  });
}

/** The phone's own bars (Android's status and navigation bars, an
 * installed app's title bar) take the page's theme-color. The manifest's is
 * fixed at install; this keeps it the colour of the app's top bar in the
 * theme the reader chose, light or dark, and follows every change. */
function followThemeColor() {
  const root = document.documentElement;
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  const apply = () => {
    const color = getComputedStyle(root).getPropertyValue("--color-surface").trim();
    if (color && meta.content !== color) meta.content = color;
  };
  apply();
  // The theme is `data-theme` on <html>; an accent or a custom theme sets
  // its colours through `style`.
  new MutationObserver(apply).observe(root, { attributes: true, attributeFilter: ["data-theme", "style"] });
}

export function start() {
  countLaunch();
  followThemeColor();
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    offer = e as InstallPrompt;
    changed();
  });
  window.addEventListener("appinstalled", () => {
    installed = true;
    offer = null;
    changed();
  });

  // Not in dev: a worker there would serve yesterday's files to the dev server.
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });

  navigator.serviceWorker.register("/sw.js").then(
    (registration) => {
      // A worker already waiting: a new version arrived while the app was shut.
      if (registration.waiting && navigator.serviceWorker.controller) offerUpdate(registration);
      registration.addEventListener("updatefound", () => {
        const next = registration.installing;
        next?.addEventListener("statechange", () => {
          // With no controller this is the first install, not an update.
          if (next.state === "installed" && navigator.serviceWorker.controller) offerUpdate(registration);
        });
      });
      // A long-open app (or an installed one that is never closed) still hears
      // of a new version.
      const check = () => registration.update().catch(() => {});
      document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && check());
      setInterval(check, 60 * 60 * 1000);
    },
    (e) => console.warn("Sojourner: the service worker did not register", e),
  );
}
