import { useSyncExternalStore } from "react";
import { Download } from "lucide-react";
import { Button } from "../components/ui/Button";
import { installHint, installState, promptInstall, subscribeInstall } from "./pwa";

/** About's "install" line in the web app: installs it where the browser offers
 * to, and says how where it does not (Safari, Firefox). Installing matters beyond
 * the icon: Safari clears a site's data after about a week unused, but not an
 * app on the home screen's. */
export default function WebInstall() {
  const state = useSyncExternalStore(subscribeInstall, installState);
  if (state === "installed") return <p className="text-sm text-ink-2">Installed on this device.</p>;
  if (state === "offered") {
    return (
      <Button icon={Download} onClick={() => void promptInstall()}>
        Install Sojourner
      </Button>
    );
  }
  const hint = installHint(state);
  return (
    <p className="text-sm text-ink-2">
      {state === "firefox-desktop" ? hint : `To install: ${hint?.replace(/^./, (c) => c.toLowerCase())}`}
      {state === "ios" && " Safari clears the data of a site left unused for about a week; an app on the home screen is kept."}
    </p>
  );
}
