import { useEffect, useSyncExternalStore } from "react";
import { toast } from "../components/ui/toast";
import { installHint, installState, launchCount, promptInstall, subscribeInstall, type InstallState } from "./pwa";

/** From the second launch on, wait this long before asking, so the reader is
 * reading first and the start-up toasts have had their turn. */
const DELAY_MS = 30_000;
const SNOOZE_DAYS = 21;
const SNOOZE_KEY = "sojourner-install-snooze";

/** Where asking helps: a real button, or a few steps the reader can follow.
 * Not Firefox on a computer (it can't install) or an unknown browser. */
const ASK: InstallState[] = ["offered", "ios", "mac-safari"];

let askedThisLaunch = false;

function snoozed(): boolean {
  try {
    return Number(localStorage.getItem(SNOOZE_KEY) || 0) > Date.now();
  } catch {
    return false;
  }
}

function snooze() {
  try {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 86_400_000));
  } catch {}
}

/** Renders nothing. Once per launch, from the second on, offers to install
 * the web app with what this device needs (Settings → About says the same,
 * any time). "Not now" waits three weeks. */
export default function InstallBanner() {
  const state = useSyncExternalStore(subscribeInstall, installState);

  useEffect(() => {
    if (askedThisLaunch || launchCount() < 2 || !ASK.includes(state) || snoozed()) return;
    const timer = window.setTimeout(() => {
      // The state may have changed meanwhile (installed, or the offer used).
      const now = installState();
      if (askedThisLaunch || !ASK.includes(now)) return;
      askedThisLaunch = true;
      const notNow = { label: "Not now", onClick: snooze };
      if (now === "offered") {
        toast.prompt("Install Sojourner on this device: it opens in its own window, from an icon, and works without the internet.", {
          durationMs: Infinity,
          action: { label: "Install", onClick: () => void promptInstall() },
          secondary: notNow,
        });
        return;
      }
      const why =
        now === "ios"
          ? " On the home screen it opens like an app, and Safari keeps your notes (it clears a website's data after a week unused)."
          : " It then opens in its own window, from the Dock.";
      toast.prompt(`Install Sojourner: ${installHint(now)}${why}`, {
        durationMs: Infinity,
        action: { label: "OK", onClick: snooze },
        secondary: notNow,
      });
    }, DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [state]);

  return null;
}
