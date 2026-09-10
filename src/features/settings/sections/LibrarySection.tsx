import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { open, confirm } from "@tauri-apps/plugin-dialog";
import { api } from "../../../api/client";
import { useTranslations, useCommentarySources } from "../../../api/queries";
import type { ImportReportItem } from "../../../api/types";

export function LibrarySection() {
  const { data: translations } = useTranslations();
  const { data: sources } = useCommentarySources();
  const qc = useQueryClient();
  const [report, setReport] = useState<ImportReportItem[] | null>(null);
  const [busy, setBusy] = useState(false);

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

  return (
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
  );
}
