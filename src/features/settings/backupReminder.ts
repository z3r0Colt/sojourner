import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { useBackups, useStats } from "../../api/queries";
import type { Stats } from "../../api/types";
import { toast } from "../../components/ui/toast";
import { useSetting } from "../../hooks/useSetting";

/**
 * The launch-time backup reminder (F3.5). Once per launch, when the newest
 * backup is older than thirty days, or there is none and the reader has
 * something worth backing up, one toast offers "Back up now" and "Remind
 * me next week". Snoozing is the setting `backup_snooze_until` (an ISO
 * date), stored with the data so a reinstall does not nag again at once.
 */
export const BACKUP_SNOOZE_SETTING = "backup_snooze_until";
export const BACKUP_REMINDER_DAYS = 30;
const SNOOZE_DAYS = 7;

/** True when `stats` holds anything a reader would miss. */
export function hasStudyData(s: Stats): boolean {
  return (
    s.notes_total + s.highlights_total + s.bookmarks + s.prayer_entries + s.prayer_people + s.memory_verses_total + s.catechism_total > 0 ||
    s.reading_days_total > 1
  );
}

/** Whole days since an ISO timestamp, or null when it does not parse. */
export function daysSince(iso: string, now = new Date()): number | null {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((now.getTime() - t) / 86_400_000);
}

/** What the reminder should say, or null when no reminder is due. */
export function backupReminderMessage(newestBackupAt: string | null, stats: Stats, snoozeUntil: string | null, now = new Date()): string | null {
  if (snoozeUntil) {
    const until = new Date(snoozeUntil).getTime();
    if (!Number.isNaN(until) && until > now.getTime()) return null;
  }
  if (newestBackupAt == null) {
    return hasStudyData(stats) ? "You have notes and highlights but no backup yet." : null;
  }
  const days = daysSince(newestBackupAt, now);
  if (days == null || days < BACKUP_REMINDER_DAYS) return null;
  return `Your last backup was ${days} days ago.`;
}

let shownThisLaunch = false;

export function useBackupReminder() {
  const { data: backups } = useBackups();
  const { data: stats } = useStats();
  const [snoozeUntil, setSnoozeUntil, { isLoaded }] = useSetting<string | null>(BACKUP_SNOOZE_SETTING, null);
  const qc = useQueryClient();

  useEffect(() => {
    if (shownThisLaunch || !backups || !stats || !isLoaded) return;
    shownThisLaunch = true;
    const newest = backups[0]?.created_at ?? null;
    const message = backupReminderMessage(newest, stats, snoozeUntil);
    if (!message) return;
    toast.prompt(message, {
      durationMs: Infinity,
      action: {
        label: "Back up now",
        onClick: async () => {
          try {
            await api.createBackup();
            qc.invalidateQueries({ queryKey: ["backups"] });
            toast.success("Backup created");
          } catch (e) {
            toast.error(`Backup failed: ${String(e)}`);
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
  }, [backups, stats, isLoaded, snoozeUntil, setSnoozeUntil, qc]);
}
