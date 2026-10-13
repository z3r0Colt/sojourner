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

export type InstallState = "installed" | "offered" | "ios" | "unavailable";

export function installState(): InstallState {
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  if (installed || standalone) return "installed";
  if (offer) return "offered";
  // iPhone and iPad: Safari installs from the share sheet, and only there.
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios ? "ios" : "unavailable";
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

export function start() {
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
