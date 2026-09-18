import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FilePlus, RefreshCw, Trash2 } from "lucide-react";
import { api } from "../../../api/client";
import { useTranslations, useCommentarySources } from "../../../api/queries";
import type { ImportReportItem } from "../../../api/types";
import { Button } from "../../../components/ui/Button";
import { confirmDelete } from "../../../components/ui/confirm";
import { toast } from "../../../components/ui/toast";
import { cx } from "../../../components/ui/classes";

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
    const picked = await api.pickOpenPath("library_xml");
    if (!picked) return;
    setBusy(true);
    try {
      const result = await api.addFile(picked.token);
      setReport([result]);
      refreshLibrary();
    } catch (e) {
      toast.error(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
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
    } catch (e) {
      toast.error(`Rescan failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  const rowClass = "flex items-center justify-between gap-3 rounded-lg border border-line bg-surface px-3 py-2 text-sm";

  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold text-ink">Library</h2>
      <p className="mb-4 text-sm text-ink-3">
        Add Bible translations or commentaries from XML files. Formats are detected automatically (Zefania XML for Bibles, ThML for commentaries).
      </p>
      <div className="mb-5 flex gap-2">
        <Button variant="primary" icon={FilePlus} disabled={busy} onClick={handleAddFile}>
          Add file
        </Button>
        <Button icon={RefreshCw} disabled={busy} onClick={handleRescan} title="Re-read the import folders for new files">
          Rescan import folders
        </Button>
      </div>

      {report && (
        <ul className="mb-5 space-y-1 rounded-lg border border-line bg-surface-2 p-3 text-xs">
          {report.map((r, i) => (
            <li key={i} className={r.status === "Failed" ? "text-danger" : "text-ink-2"}>
              <span className="font-mono">{r.status}</span> · {r.file.split(/[\\/]/).pop()}
              {r.detail ? ` · ${r.detail}` : ""}
            </li>
          ))}
        </ul>
      )}

      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">Translations</h3>
      <ul className="mb-6 space-y-1.5">
        {translations?.map((t) => (
          <li key={t.id} className={rowClass}>
            <span className="min-w-0 truncate text-ink">
              {t.name} <span className="text-ink-3">· {t.verse_count.toLocaleString()} verses</span>
              {t.license_status === "licensed" && (
                <span
                  title="A modern copyrighted translation. The app ships none of these — this one was imported on this computer, and whether it may be shared is your own arrangement with its publisher."
                  className={cx("ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950/50 dark:text-amber-300")}
                >
                  Licensed
                </span>
              )}
            </span>
            <Button
              size="sm"
              variant="danger-ghost"
              icon={Trash2}
              onClick={async () => {
                if (await confirmDelete(t.name, "Highlights made in this translation keep their verse references but lose their exact character spans.")) {
                  api.removeTranslation(t.id).then(() => {
                    refreshLibrary();
                    toast.info(`Removed ${t.name}`);
                  });
                }
              }}
            >
              Remove
            </Button>
          </li>
        ))}
      </ul>

      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">Commentaries</h3>
      <ul className="space-y-1.5">
        {sources?.map((s) => (
          <li key={s.id} className={rowClass}>
            <span className="min-w-0 truncate text-ink">
              {s.title} <span className="text-ink-3">· {s.covered_book_ids.length} books</span>
            </span>
            <Button
              size="sm"
              variant="danger-ghost"
              icon={Trash2}
              onClick={async () => {
                if (await confirmDelete(s.title)) {
                  api.removeCommentarySource(s.id).then(() => {
                    refreshLibrary();
                    toast.info(`Removed ${s.title}`);
                  });
                }
              }}
            >
              Remove
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
