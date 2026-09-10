import { useState } from "react";
import { open, save, confirm, message } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import { api } from "../../../api/client";
import { useBackups, useCreateBackup, useBackupSyncFolder, useSetBackupSyncFolder } from "../../../api/queries";

export function BackupsSection() {
  const { data: backups } = useBackups();
  const { data: syncFolder } = useBackupSyncFolder();
  const createBackup = useCreateBackup();
  const setBackupSyncFolder = useSetBackupSyncFolder();
  const [checkResult, setCheckResult] = useState<string[] | null>(null);
  const [checking, setChecking] = useState(false);

  async function handleExport() {
    const destPath = await save({
      defaultPath: `sojourner-export-${new Date().toISOString().slice(0, 10)}.db`,
      filters: [{ name: "Database", extensions: ["db"] }],
    });
    if (!destPath) return;
    await api.exportDatabase(destPath);
    await message("Exported. This file has all your notes, highlights, plans, and other study data.", { title: "Export complete" });
  }

  async function handleImport() {
    const sourcePath = await open({ multiple: false, filters: [{ name: "Database", extensions: ["db"] }] });
    if (!sourcePath || Array.isArray(sourcePath)) return;
    const proceed = await confirm(
      "Importing replaces everything currently in the app (notes, highlights, plans, etc.) with what's in this file. Your current data is backed up first, but this can't be undone from inside the app. Continue?",
      { title: "Import data", kind: "warning" },
    );
    if (!proceed) return;
    await api.stageImport(sourcePath);
    await message("Import staged. Restart the app for it to take effect.", { title: "Restart required" });
  }

  async function handleRestore(fileName: string) {
    const proceed = await confirm(
      `Restore "${fileName}"? Your current data is backed up first, but this replaces everything since that backup was made.`,
      { title: "Restore backup", kind: "warning" },
    );
    if (!proceed) return;
    await api.stageRestore(fileName);
    await message("Restore staged. Restart the app for it to take effect.", { title: "Restart required" });
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
    setBackupSyncFolder.mutate(folder);
  }

  async function handleOpenLogsFolder() {
    await openPath(await api.getLogsDir());
  }

  return (
    <div>
      <h1 className="mb-2 text-xl font-semibold">Data &amp; Backups</h1>
      <p className="mb-4 text-xs text-gray-400">
        Your notes, highlights, plans, and every other piece of study data live in one file on this device
        (<code>user.db</code>) and never leave it -- this app makes no network requests of its own and sends no
        usage data or telemetry anywhere.
      </p>
      <div className="mb-3 flex flex-wrap gap-2">
        <button
          onClick={() => createBackup.mutate()}
          disabled={createBackup.isPending}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Back Up Now
        </button>
        <button
          onClick={handleExport}
          className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          Export…
        </button>
        <button
          onClick={handleImport}
          className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          Import…
        </button>
        <button
          onClick={handleCheck}
          disabled={checking}
          className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          {checking ? "Checking…" : "Check Database Integrity"}
        </button>
        <button
          onClick={handleOpenLogsFolder}
          className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          Open Logs Folder
        </button>
      </div>

      {checkResult && (
        <p className={`mb-3 text-sm ${checkResult.length === 0 ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
          {checkResult.length === 0 ? "No problems found." : checkResult.join("; ")}
        </p>
      )}

      <div className="mb-3 flex items-center gap-2 text-sm">
        <span className="w-32 shrink-0 text-gray-500">Also copy backups to</span>
        {syncFolder ? (
          <span className="truncate text-xs text-gray-600 dark:text-gray-300" title={syncFolder}>
            {syncFolder}
          </span>
        ) : (
          <span className="text-xs text-gray-400">not set</span>
        )}
        <button onClick={handlePickSyncFolder} className="text-xs text-blue-600 hover:underline dark:text-blue-400">
          Choose…
        </button>
        {syncFolder && (
          <button onClick={() => setBackupSyncFolder.mutate(null)} className="text-xs text-gray-400 hover:underline">
            Clear
          </button>
        )}
      </div>
      <p className="mb-3 text-xs text-gray-400">
        Point this at a folder synced by Dropbox, OneDrive, iCloud Drive, or similar, and every backup made here is
        also copied there -- a simple way to carry your data to another install of this app without setting up
        anything else.
      </p>

      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Recent Backups</h3>
      {(!backups || backups.length === 0) && <p className="text-sm text-gray-400">No backups yet.</p>}
      <ul className="space-y-1">
        {backups?.map((b) => (
          <li key={b.file_name} className="flex items-center justify-between rounded border border-gray-200 px-3 py-1.5 text-xs dark:border-gray-800">
            <span className="truncate text-gray-600 dark:text-gray-300" title={b.file_name}>
              {new Date(b.created_at).toLocaleString()} · {(b.size_bytes / 1024).toFixed(0)} KB
            </span>
            <button onClick={() => handleRestore(b.file_name)} className="shrink-0 text-blue-600 hover:underline dark:text-blue-400">
              Restore
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
