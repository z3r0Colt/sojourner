import { useEffect, useState, type ReactNode } from "react";
import { Button } from "../components/ui/Button";
import { splashNote, splashReady } from "../lib/splash";
import { announceReleased, claimTab, onTabLost, takeTab } from "./tabLock";

type State = "checking" | "ok" | "busy" | "lost";

/** Lets the app run in one tab only (tabLock.ts): the reader's data file is
 * held open by one worker. A second tab says so, and can take over. */
export default function TabGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>("checking");

  useEffect(() => {
    onTabLost(async () => {
      // Let go of the files first, then tell the other tab it may start.
      (await import("./backend")).stopBackend();
      announceReleased();
      setState("lost");
    });
    claimTab().then((got) => setState(got ? "ok" : "busy"));
  }, []);

  // The splash stays up until the app is ready, which it never will be here.
  useEffect(() => {
    if (state === "busy" || state === "lost") splashReady();
    if (state === "ok") splashNote("Opening your library…");
  }, [state]);

  if (state === "ok") return <>{children}</>;
  if (state === "checking") return null;

  const lost = state === "lost";
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="max-w-md text-center">
        <h1 className="mb-2 text-xl font-semibold text-ink">
          {lost ? "Sojourner is now open in another tab" : "Sojourner is open in another tab"}
        </h1>
        <p className="mb-5 text-sm text-ink-3">
          Your notes and highlights are kept in this browser, and only one tab can use them at a time, so that they are never
          mixed up. Close the other tab, or use Sojourner here instead; the other one will stop.
        </p>
        <Button
          variant="primary"
          onClick={async () => {
            await takeTab();
            // A tab that was stopped has stale pages: start clean.
            if (lost) window.location.reload();
            else setState("ok");
          }}
        >
          Use Sojourner here
        </Button>
      </div>
    </div>
  );
}
