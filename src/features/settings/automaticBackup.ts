import { useEffect } from "react";
import { useBackups, useCreateBackup, useStats } from "../../api/queries";
import { toast } from "../../components/ui/toast";
import { useSetting } from "../../hooks/useSetting";
import {
  AUTO_BACKUP_DAYS_DEFAULT,
  AUTO_BACKUP_DAYS_SETTING,
  AUTO_BACKUP_DEFAULT,
  AUTO_BACKUP_SETTING,
  daysSince,
  hasStudyData,
} from "./backupReminder";
import type { Stats } from "../../api/types";

/**
 * Backing up without being asked.
 *
 * The reminder that came before this one only ever offered: a toast every
 * thirty days that a reader could dismiss forever, which is thin cover for
 * sermons that exist nowhere else. This takes the backup itself, once a
 * launch at most, when the newest one is older than the chosen interval --
 * the same snapshot "Back up now" takes, pruned to ten and copied to the
 * sync folder like any other.
 *
 * It waits a few seconds after launch so the snapshot never competes with
 * the first thing the reader asked for, and it says so quietly when it is
 * done -- a backup nobody knows happened is hard to trust.
 */

/** How long to let the app settle before taking a snapshot of a database
 * that may be hundreds of megabytes. */
const SETTLE_MS = 4_000;

/** Whether a backup is due: nothing backed up yet, or the newest is older
 * than `days`. Returns false when there is nothing worth keeping. */
export function backupIsDue(newestBackupAt: string | null, stats: Stats, days: number, now = new Date()): boolean {
  if (!hasStudyData(stats)) return false;
  if (newestBackupAt == null) return true;
  const age = daysSince(newestBackupAt, now);
  return age == null || age >= days;
}

let ranThisLaunch = false;

/** Resets the once-a-launch guard. Tests and the dev reload only. */
export function resetAutomaticBackupForTests(): void {
  ranThisLaunch = false;
}

export function useAutomaticBackup() {
  const { data: backups } = useBackups();
  const { data: stats } = useStats();
  const [enabled, , enabledMeta] = useSetting<boolean>(AUTO_BACKUP_SETTING, AUTO_BACKUP_DEFAULT);
  const [days, , daysMeta] = useSetting<number>(AUTO_BACKUP_DAYS_SETTING, AUTO_BACKUP_DAYS_DEFAULT);
  const createBackup = useCreateBackup();

  const { mutate } = createBackup;
  useEffect(() => {
    if (ranThisLaunch || !backups || !stats) return;
    // Never act on a default before the stored setting has loaded, or a
    // reader who turned this off would still get a backup on every launch.
    if (!enabledMeta.isLoaded || !daysMeta.isLoaded) return;
    if (!enabled) return;
    if (!backupIsDue(backups[0]?.created_at ?? null, stats, days)) return;

    ranThisLaunch = true;
    const timer = window.setTimeout(() => {
      mutate(undefined, {
        // The failure is worth a word -- a backup that did not happen is
        // exactly the thing this feature exists to prevent.
        onSuccess: () => toast.info("Backed up"),
        onError: (error) => toast.error(`Automatic backup failed: ${String(error)}`),
      });
    }, SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [backups, stats, enabled, days, enabledMeta.isLoaded, daysMeta.isLoaded, mutate]);
}
