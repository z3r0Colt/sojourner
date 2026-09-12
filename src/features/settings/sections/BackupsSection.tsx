import { useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import { Download, FolderOpen, HardDrive, RotateCcw, ShieldCheck, Upload } from "lucide-react";
import { api } from "../../../api/client";
import { useBackups, useCreateBackup, useBackupSyncFolder, useSetBackupSyncFolder } from "../../../api/queries";
import { Button } from "../../../components/ui/Button";
import { confirmDialog } from "../../../components/ui/confirm";
import { toast } from "../../../components/ui/toast";
import { cx, inputSmClass } from "../../../components/ui/classes";
import { EmptyState } from "../../../components/ui/EmptyState";
import { useSetting } from "../../../hooks/useSetting";
import {
  AUTO_BACKUP_DAYS_DEFAULT,
  AUTO_BACKUP_DAYS_SETTING,
  AUTO_BACKUP_DEFAULT,
  AUTO_BACKUP_SETTING,
} from "../backupReminder";
import { TrashSection } from "./TrashSection";
import { StatsSection } from "./StatsSection";

export function BackupsSection() {
  const { data: backups } = useBackups();
  const { data: syncFolder } = useBackupSyncFolder();
  const createBackup = useCreateBackup();
  const setBackupSyncFolder = useSetBackupSyncFolder();
  const [checkResult, setCheckResult] = useState<string[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [autoBackup, setAutoBackup] = useSetting<boolean>(AUTO_BACKUP_SETTING, AUTO_BACKUP_DEFAULT);
  const [autoBackupDays, setAutoBackupDays] = useSetting<number>(AUTO_BACKUP_DAYS_SETTING, AUTO_BACKUP_DAYS_DEFAULT);

  async function handleExport() {
    const destPath = await save({
      defaultPath: `sojourner-export-${new Date().toISOString().slice(0, 10)}.db`,
      filters: [{ name: "Database", extensions: ["db"] }],
    });
    if (!destPath) return;
    await api.exportDatabase(destPath);
    toast.success("Exported. The file holds all your notes, highlights, plans, and other study data.");
  }

  async function handleImport() {
    const sourcePath = await open({ multiple: false, filters: [{ name: "Database", extensions: ["db"] }] });
    if (!sourcePath || Array.isArray(sourcePath)) return;
    const proceed = await confirmDialog({
      title: "Replace everything with this file?",
      message:
        "Importing replaces all current notes, highlights, plans, and other data with what's in the file. Your current data is backed up first, but this can't be undone from inside the app.",
      confirmLabel: "Import and replace",
      danger: true,
    });
    if (!proceed) return;
    await api.stageImport(sourcePath);
    await confirmDialog({ title: "Restart required", message: "The import is staged and takes effect the next time the app starts.", confirmLabel: "OK", cancelLabel: "Close" });
  }

  async function handleRestore(fileName: string) {
    const proceed = await confirmDialog({
      title: "Restore this backup?",
      message: `Restores "${fileName}". Your current data is backed up first, but everything changed since that backup is replaced.`,
      confirmLabel: "Restore",
      danger: true,
    });
    if (!proceed) return;
    await api.stageRestore(fileName);
    await confirmDialog({ title: "Restart required", message: "The restore is staged and takes effect the next time the app starts.", confirmLabel: "OK", cancelLabel: "Close" });
  }

  async function handleCheck() {
    setChecking(true);
    try {
      setCheckResult(await api.quickCheck());
    } finally {
      setChecking(false);
    }
  }

  async function handlePickSyncFolder() {
    const folder = await open({ directory: true });
    if (!folder || Array.isArray(folder)) return;
    setBackupSyncFolder.mutate(folder, { onSuccess: () => toast.success("Backups will also be copied there") });
  }

  async function handleOpenLogsFolder() {
    await openPath(await api.getLogsDir());
  }

  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold text-ink">Data &amp; backups</h2>
      <p className="mb-4 text-sm text-ink-3">
        Everything you write lives in one file on this device and never leaves it. This app makes no network requests of its own and sends nothing anywhere.
      </p>
      <div className="mb-4 flex flex-wrap gap-2">
        <Button variant="primary" icon={HardDrive} onClick={() => createBackup.mutate(undefined, { onSuccess: () => toast.success("Backup created") })} disabled={createBackup.isPending}>
          Back up now
        </Button>
        <Button icon={Download} onClick={handleExport}>
          Export
        </Button>
        <Button icon={Upload} onClick={handleImport}>
          Import
        </Button>
        <Button icon={ShieldCheck} onClick={handleCheck} disabled={checking}>
          {checking ? "Checking…" : "Check integrity"}
        </Button>
        <Button variant="ghost" icon={FolderOpen} onClick={handleOpenLogsFolder}>
          Open logs folder
        </Button>
      </div>

      {checkResult && (
        <p className={`mb-4 text-sm ${checkResult.length === 0 ? "text-green-700 dark:text-green-400" : "text-danger"}`}>
          {checkResult.length === 0 ? "Database integrity check passed." : checkResult.join("; ")}
        </p>
      )}

      <div className="mb-3 rounded-lg border border-line bg-surface p-3">
        <label className="flex flex-wrap items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={autoBackup}
            onChange={(e) => setAutoBackup(e.target.checked)}
            className="accent-accent"
          />
          <span className="font-medium text-ink">Back up automatically</span>
          <span className="text-ink-3">every</span>
          <input
            type="number"
            min={1}
            max={90}
            value={autoBackupDays}
            onChange={(e) => setAutoBackupDays(Math.min(90, Math.max(1, Number(e.target.value) || 1)))}
            disabled={!autoBackup}
            aria-label="Days between automatic backups"
            className={cx(inputSmClass, "w-16")}
          />
          <span className="text-ink-3">{autoBackupDays === 1 ? "day" : "days"}</span>
        </label>
        <p className="mt-2 text-xs text-ink-3">
          {autoBackup
            ? "A few seconds after the app opens, if the newest backup is older than that, one is taken quietly. Turn this off and you will be reminded every thirty days instead."
            : "Nothing is backed up unless you press the button. A reminder appears once a month."}
        </p>
      </div>

      <div className="mb-6 rounded-lg border border-line bg-surface p-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium text-ink">Also copy backups to</span>
          {syncFolder ? (
            <span className="min-w-0 truncate text-ink-2" title={syncFolder}>
              {syncFolder}
            </span>
          ) : (
            <span className="text-ink-3">not set</span>
          )}
          <div className="flex-1" />
          <Button size="sm" onClick={handlePickSyncFolder}>
            Choose folder
          </Button>
          {syncFolder && (
            <Button size="sm" variant="ghost" onClick={() => setBackupSyncFolder.mutate(null)}>
              Clear
            </Button>
          )}
        </div>
        <p className="mt-2 text-xs text-ink-3">
          Point this at a folder synced by OneDrive, Dropbox, or similar and every backup is copied there too. A simple way to carry your data to another computer.
        </p>
      </div>

      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">Recent backups</h3>
      {(!backups || backups.length === 0) && (
        <EmptyState
          compact
          title="No backups yet"
          description={
            autoBackup
              ? "One is taken shortly after the app opens, and always before an import or restore."
              : "Backups are made automatically before an import or restore, and otherwise only when you ask."
          }
        />
      )}
      <ul className="space-y-1.5">
        {backups?.map((b) => (
          <li key={b.file_name} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface px-3 py-2 text-sm">
            <span className="min-w-0 truncate text-ink-2" title={b.file_name}>
              {new Date(b.created_at).toLocaleString()} <span className="text-ink-3">· {(b.size_bytes / 1024).toFixed(0)} KB</span>
            </span>
            <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => handleRestore(b.file_name)}>
              Restore
            </Button>
          </li>
        ))}
      </ul>

      <StatsSection />
      <TrashSection />
    </div>
  );
}
