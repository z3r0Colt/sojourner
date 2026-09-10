import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { open, save, confirm, message } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import { api } from "../../api/client";
import {
  useTranslations,
  useCommentarySources,
  useBackups,
  useCreateBackup,
  useBackupSyncFolder,
  useSetBackupSyncFolder,
} from "../../api/queries";
import { useUiStore } from "../../state/uiStore";
import type { ImportReportItem } from "../../api/types";

export function LibrarySettingsView() {
  const { data: translations } = useTranslations();
  const { data: sources } = useCommentarySources();
  const { data: backups } = useBackups();
  const { data: syncFolder } = useBackupSyncFolder();
  const createBackup = useCreateBackup();
  const setBackupSyncFolder = useSetBackupSyncFolder();
  const qc = useQueryClient();
  const [report, setReport] = useState<ImportReportItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [checkResult, setCheckResult] = useState<string[] | null>(null);
  const [checking, setChecking] = useState(false);
  const {
    theme,
    setTheme,
    fontSize,
    setFontSize,
    showVerseNumbers,
    toggleVerseNumbers,
    showHighlights,
    toggleShowHighlights,
    showNoteSymbols,
    toggleShowNoteSymbols,
    showMorphology,
    toggleShowMorphology,
    redLetterMode,
    toggleRedLetterMode,
    paragraphMode,
    toggleParagraphMode,
  } = useUiStore();

  function refreshLibrary() {
    qc.invalidateQueries({ queryKey: ["translations"] });
    qc.invalidateQueries({ queryKey: ["commentarySources"] });
  }

  async function handleAddFile() {
    const selected = await open({
      multiple: false,
      filters: [{ name: "XML", extensions: ["xml"] }],
    });
    if (!selected || Array.isArray(selected)) return;
    setBusy(true);
    try {
      const result = await api.addFile(selected);
      setReport([result]);
      refreshLibrary();
    } finally {
      setBusy(false);
    }
  }

  async function handleRescan() {
    setBusy(true);
    try {
      const result = await api.scanLibrary();
      setReport(result);
      refreshLibrary();
    } finally {
      setBusy(false);
    }
  }

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
    <div className="mx-auto max-w-2xl space-y-8 px-6 py-6">
      <div>
        <h1 className="mb-1 text-xl font-semibold">Library</h1>
        <p className="mb-4 text-sm text-gray-500">
          Add more Bible translations or commentaries by dropping XML files in, or picking a file directly.
          Supported formats are auto-detected (currently Zefania XML for Bibles and ThML for commentaries).
        </p>
        <div className="mb-4 flex gap-2">
          <button
            disabled={busy}
            onClick={handleAddFile}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Add File…
          </button>
          <button
            disabled={busy}
            onClick={handleRescan}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            Rescan Import Folders
          </button>
        </div>

        {report && (
          <ul className="mb-4 space-y-1 rounded border border-gray-200 p-2 text-xs dark:border-gray-800">
            {report.map((r, i) => (
              <li key={i} className={r.status === "Failed" ? "text-red-500" : "text-gray-600 dark:text-gray-300"}>
                <span className="font-mono">{r.status}</span> — {r.file.split(/[\\/]/).pop()}
                {r.detail ? ` — ${r.detail}` : ""}
              </li>
            ))}
          </ul>
        )}

        <h2 className="mb-2 text-sm font-semibold text-gray-500">Translations</h2>
        <ul className="mb-4 space-y-1">
          {translations?.map((t) => (
            <li key={t.id} className="flex items-center justify-between rounded border border-gray-200 px-3 py-2 text-sm dark:border-gray-800">
              <span>
                {t.name} <span className="text-gray-400">({t.verse_count} verses)</span>
              </span>
              <button
                onClick={async () => {
                  if (await confirm(`Remove ${t.name}?`)) api.removeTranslation(t.id).then(refreshLibrary);
                }}
                className="text-red-500 hover:underline"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>

        <h2 className="mb-2 text-sm font-semibold text-gray-500">Commentaries</h2>
        <ul className="space-y-1">
          {sources?.map((s) => (
            <li key={s.id} className="flex items-center justify-between rounded border border-gray-200 px-3 py-2 text-sm dark:border-gray-800">
              <span>
                {s.title} <span className="text-gray-400">({s.covered_book_ids.length} books)</span>
              </span>
              <button
                onClick={async () => {
                  if (await confirm(`Remove ${s.title}?`)) api.removeCommentarySource(s.id).then(refreshLibrary);
                }}
                className="text-red-500 hover:underline"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-gray-500">Reading Preferences</h2>
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="w-28">Theme</span>
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value as typeof theme)}
              className="rounded border border-gray-300 bg-white px-2 py-1 dark:border-gray-700 dark:bg-gray-900"
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="oled">True Black (OLED)</option>
              <option value="sepia">Sepia</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-28">Font size</span>
            <input
              type="range"
              min={14}
              max={28}
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
            />
            <span className="text-gray-400">{fontSize}px</span>
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={showVerseNumbers} onChange={toggleVerseNumbers} />
            Show verse numbers
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={showHighlights} onChange={toggleShowHighlights} />
            Show highlights
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={showNoteSymbols} onChange={toggleShowNoteSymbols} />
            Show note symbols
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={showMorphology} onChange={toggleShowMorphology} />
            Show morphological codes (interlinear)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={redLetterMode} onChange={toggleRedLetterMode} />
            Red-letter (words of Jesus)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={paragraphMode} onChange={toggleParagraphMode} />
            Paragraph mode (flowing text instead of one verse per line)
          </label>
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-gray-500">Data &amp; Backups</h2>
        <p className="mb-2 text-xs text-gray-400">
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
            <button
              onClick={() => setBackupSyncFolder.mutate(null)}
              className="text-xs text-gray-400 hover:underline"
            >
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
    </div>
  );
}
