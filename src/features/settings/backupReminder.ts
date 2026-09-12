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

// Every backup preference's key lives here, so the automatic backup
// (automaticBackup.ts, which reads this module's own helpers) and the
// reminder agree about them without importing each other in a circle.
export const AUTO_BACKUP_SETTING = "auto_backup_enabled";
export const AUTO_BACKUP_DAYS_SETTING = "auto_backup_days";
/** On by default: the reader who most needs this is the one who would never
 * go and turn it on. */
export const AUTO_BACKUP_DEFAULT = true;
export const AUTO_BACKUP_DAYS_DEFAULT = 7;

/** True when `stats` holds anything a reader would miss -- a preacher's
 * sermons and illustrations included, since a pastor whose work is all
 * manuscripts was otherwise never told he had no backup. */
export function hasStudyData(s: Stats): boolean {
  return (
    s.notes_total +
      s.highlights_total +
      s.bookmarks +
      s.prayer_entries +
      s.prayer_people +
      s.memory_verses_total +
      s.catechism_total +
      s.sermons_total +
      s.illustrations_total >
      0 || s.reading_days_total > 1
  );
}

/** Whole days since an ISO timestamp, or null when it does not parse. */
export function daysSince(iso: string, now = new Date()): number | null {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((now.getTime() - t) / 86_400_000);
}

/** What is in the app, named the way the reader would name it, for a
 * reminder that says what is actually at stake. */
export function whatIsHere(s: Stats): string {
  const parts: string[] = [];
  if (s.sermons_total > 0) parts.push("sermons");
  if (s.notes_total > 0) parts.push("notes");
  if (s.highlights_total > 0) parts.push("highlights");
  if (s.illustrations_total > 0) parts.push("illustrations");
  if (s.prayer_entries + s.prayer_people > 0) parts.push("a prayer journal");
  if (s.memory_verses_total + s.catechism_total > 0) parts.push("memory work");
  if (parts.length === 0) return "work in the app";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** What the reminder should say, or null when no reminder is due. */
export function backupReminderMessage(newestBackupAt: string | null, stats: Stats, snoozeUntil: string | null, now = new Date()): string | null {
  if (snoozeUntil) {
    const until = new Date(snoozeUntil).getTime();
    if (!Number.isNaN(until) && until > now.getTime()) return null;
  }
  if (newestBackupAt == null) {
    return hasStudyData(stats) ? `You have ${whatIsHere(stats)} but no backup yet.` : null;
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
  // With automatic backups on, there is nothing to prompt for: one is either
  // recent or about to be taken. The nag is for when nothing else will.
  const [autoBackup, , autoMeta] = useSetting<boolean>(AUTO_BACKUP_SETTING, AUTO_BACKUP_DEFAULT);
  const qc = useQueryClient();

  useEffect(() => {
    if (shownThisLaunch || !backups || !stats || !isLoaded || !autoMeta.isLoaded) return;
    if (autoBackup) return;
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
