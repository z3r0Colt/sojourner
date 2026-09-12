import { useEffect } from "react";
import { useSetting } from "../../hooks/useSetting";
import { useWorkspaceStore } from "../../state/workspaceStore";
import { openContent } from "../../workspace/openContent";

/** Settings → Reading → "Open on": what the focused pane shows at launch.
 * The Bible stays the default (decided); Today is opt-in. Stored in
 * user.db so it survives a reinstall. */
export const LANDING_SETTING = "landing_page";
export type LandingPage = "bible" | "today";

export function useLandingPage() {
  return useSetting<LandingPage>(LANDING_SETTING, "bible");
}

let applied = false;

/** Once per launch, after the workspace has bootstrapped: with "Today"
 * chosen, the focused pane opens the Today page (the Bible it showed goes
 * on that pane's history, and "Continue reading" brings it back). */
export function useLandingPageOnLaunch() {
  const [landing, , { isLoaded }] = useLandingPage();
  const ready = useWorkspaceStore((s) => s.ready);
  useEffect(() => {
    if (applied || !isLoaded || !ready) return;
    applied = true;
    if (landing === "today") openContent("today", {}, { target: "focused" });
  }, [landing, isLoaded, ready]);
}
