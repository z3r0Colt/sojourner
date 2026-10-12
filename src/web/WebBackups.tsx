import { useEffect, useRef, useState } from "react";
import { Download, ShieldCheck, Upload } from "lucide-react";
import { api } from "../api/client";
import { backendInfo } from "./backend";
import { Button } from "../components/ui/Button";
import { confirmDialog } from "../components/ui/confirm";
import { toast } from "../components/ui/toast";
import { useSetting } from "../hooks/useSetting";
import { StatsSection } from "../features/settings/sections/StatsSection";
import { TrashSection } from "../features/settings/sections/TrashSection";
import { checkUserDataFile, exportUserData, importUserData, LAST_EXPORT_SETTING, storageStatus, type StorageStatus } from "./userData";

const mb = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(n / 1e6))} MB`);

/** Settings → Data & backups in the browser: your data lives in this browser,
 * so the way to keep it safe is a file of your own. */
export default function WebBackups() {
  const [lastExport] = useSetting<string | null>(LAST_EXPORT_SETTING, null);
  const [storage, setStorage] = useState<StorageStatus | null>(null);
  const [stored, setStored] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [checkResult, setCheckResult] = useState<string[] | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    storageStatus(true).then(setStorage);
    backendInfo().then(
      (i) => setStored(i.persistent),
      () => setStored(null),
    );
  }, []);

  async function run(job: () => Promise<void>) {
    setBusy(true);
    try {
      await job();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusy(false);
    }
  }

  const handleExport = () =>
    run(async () => {
      await exportUserData();
      toast.success("Exported. The file holds all your notes, highlights, plans, and other study data.");
    });

  const handleFile = (file: File) =>
    run(async () => {
      const bytes = await checkUserDataFile(file);
      const proceed = await confirmDialog({
        title: "Replace everything with this file?",
        message:
          "Importing replaces all current notes, highlights, plans, and other data with what's in the file. A copy of your current data is downloaded first, but this can't be undone from inside the app. " +
          "A data file also carries the formatting and links of whoever made it, so import one only from a source you trust.",
        confirmLabel: "Import and replace",
        danger: true,
      });
      if (!proceed) return;
      await importUserData(bytes);
    });

  async function handleCheck() {
    setBusy(true);
    try {
      setCheckResult(await api.quickCheck());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold text-ink">Data &amp; backups</h2>
      <p className="mb-4 text-sm text-ink-3">
        Everything you write is kept in this browser, on this device, and nowhere else. It is not encrypted, and it is not backed up:
        if the browser's data is cleared, it is gone. Export it to a file now and then, and keep that file somewhere safe.
      </p>

      {stored === false && (
        <p className="mb-4 rounded-lg border border-danger bg-danger-soft p-3 text-sm text-danger">
          This browser isn't keeping your changes: they will be gone when you close the page. Try a current Chrome, Edge, Firefox or
          Safari, and not a private window.
        </p>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        <Button variant="primary" icon={Download} onClick={handleExport} disabled={busy || stored === false}>
          Export
        </Button>
        <Button icon={Upload} onClick={() => fileInput.current?.click()} disabled={busy || stored === false}>
          Import
        </Button>
        <Button icon={ShieldCheck} onClick={handleCheck} disabled={busy}>
          Check integrity
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept=".db,.sqlite,.sqlite3,application/vnd.sqlite3,application/octet-stream"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) handleFile(f);
          }}
        />
      </div>

      {checkResult && (
        <p className={`mb-4 text-sm ${checkResult.length === 0 ? "text-green-700 dark:text-green-400" : "text-danger"}`}>
          {checkResult.length === 0 ? "Database integrity check passed." : checkResult.join("; ")}
        </p>
      )}

      <div className="mb-6 rounded-lg border border-line bg-surface p-3 text-sm">
        <p className="text-ink-2">
          <span className="font-medium text-ink">Last export:</span> {lastExport ? new Date(lastExport).toLocaleString() : "never"}
        </p>
        <p className="mt-1 text-ink-2">
          <span className="font-medium text-ink">Protected from clearing:</span>{" "}
          {storage?.persisted == null ? "unknown" : storage.persisted ? "yes" : "no"}
        </p>
        {storage?.usage != null && (
          <p className="mt-1 text-ink-2">
            <span className="font-medium text-ink">Kept by this browser:</span> {mb(storage.usage)}
            {storage.quota != null && <span className="text-ink-3"> of {mb(storage.quota)} allowed</span>} (your data, and the books
            read so far)
          </p>
        )}
        {storage?.persisted === false && (
          <p className="mt-2 text-xs text-ink-3">
            The browser may clear a site's data when it is short of space, or (Safari) after weeks without a visit. Adding Sojourner to
            your home screen or installing it, and using it often, makes that much less likely. An export is the only sure protection.
          </p>
        )}
      </div>

      <StatsSection />
      <TrashSection />
    </div>
  );
}
