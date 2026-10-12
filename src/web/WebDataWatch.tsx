import { useEffect } from "react";
import { useStats } from "../api/queries";
import { toast } from "../components/ui/toast";
import { useSetting } from "../hooks/useSetting";
import { backendInfo } from "./backend";
import { BACKUP_REMINDER_DAYS, BACKUP_SNOOZE_SETTING, daysSince, hasStudyData, whatIsHere } from "../features/settings/backupReminder";
import { exportUserData, LAST_EXPORT_SETTING, storageStatus } from "./userData";

const SNOOZE_DAYS = 7;
let shownThisLaunch = false;

/** Renders nothing. Once per launch in the web app: asks the browser to keep
 * the reader's data, says if it isn't being kept at all, and reminds the
 * reader to export (the desktop's backups folder has no web counterpart). */
export default function WebDataWatch() {
  const { data: stats } = useStats();
  const [lastExport, , lastMeta] = useSetting<string | null>(LAST_EXPORT_SETTING, null);
  const [snoozeUntil, setSnoozeUntil, snoozeMeta] = useSetting<string | null>(BACKUP_SNOOZE_SETTING, null);

  useEffect(() => {
    // Chrome grants this quietly to a site that is used; Firefox asks; Safari
    // grants it to one on the home screen.
    storageStatus(true);
    backendInfo().then((i) => {
      if (!i.persistent) {
        toast.prompt("This browser isn't keeping your changes. They will be gone when you close this page.", {
          durationMs: Infinity,
          action: { label: "OK", onClick: () => {} },
        });
      }
    }, () => {});
  }, []);

  useEffect(() => {
    if (shownThisLaunch || !stats || !lastMeta.isLoaded || !snoozeMeta.isLoaded) return;
    shownThisLaunch = true;
    if (!hasStudyData(stats)) return;
    if (snoozeUntil && new Date(snoozeUntil).getTime() > Date.now()) return;
    const days = lastExport ? daysSince(lastExport) : null;
    if (lastExport && days != null && days < BACKUP_REMINDER_DAYS) return;
    const message = lastExport
      ? `Your last export was ${days} days ago. Your ${whatIsHere(stats)} are kept only in this browser.`
      : `You have ${whatIsHere(stats)}, kept only in this browser, and no export yet.`;
    toast.prompt(message, {
      durationMs: Infinity,
      action: {
        label: "Export now",
        onClick: async () => {
          try {
            await exportUserData();
            toast.success("Exported.");
          } catch (e) {
            toast.error(`Export failed: ${String(e)}`);
          }
        },
      },
      secondary: {
        label: "Remind me next week",
        onClick: () => {
          const until = new Date();
          until.setDate(until.getDate() + SNOOZE_DAYS);
          setSnoozeUntil(until.toISOString());
        },
      },
    });
  }, [stats, lastExport, lastMeta.isLoaded, snoozeUntil, snoozeMeta.isLoaded, setSnoozeUntil]);

  return null;
}
