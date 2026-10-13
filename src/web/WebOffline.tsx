import { useEffect, useState } from "react";
import { CloudDownload, Pause, Play, Trash2 } from "lucide-react";
import { Button } from "../components/ui/Button";
import { confirmDialog } from "../components/ui/confirm";
import { toast } from "../components/ui/toast";
import { offlineOp, onOfflineStatus } from "./backend";
import type { OfflineStatus } from "./protocol";

const mb = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : `${Math.max(0, Math.round(n / 1e6))} MB`);

/** "Make available offline": the books (content.db) downloaded into this
 * browser, so Sojourner works without the internet. The download itself
 * runs in the backend's worker (offlineCopy.ts). */
export default function WebOffline() {
  const [status, setStatus] = useState<OfflineStatus | null>(null);

  useEffect(() => {
    const off = onOfflineStatus(setStatus);
    offlineOp("status").catch(() => {});
    return off;
  }, []);

  if (!status) return null;
  const { state, done, total } = status;
  const pct = total > 0 ? Math.min(100, (done / total) * 100) : 0;

  async function download() {
    // Asked here, from the page: a worker can't. Downloaded books the browser
    // may clear when short of space would be a poor offline copy. Not waited
    // for: Firefox asks the reader, and the answer may never come.
    void navigator.storage?.persist?.().catch(() => false);
    await offlineOp("download");
  }

  async function remove() {
    const ok = await confirmDialog({
      title: "Remove the offline copy?",
      message: `This frees ${mb(done)} on this device. Your notes and other data are not touched. Sojourner will read the books over the internet again.`,
      confirmLabel: "Remove",
      danger: true,
    });
    if (!ok) return;
    await offlineOp("remove");
    toast.success("The offline copy was removed.");
  }

  return (
    <div className="mb-6 rounded-lg border border-line bg-surface p-3 text-sm">
      <h3 className="mb-1 font-medium text-ink">Use without the internet</h3>
      {state === "none" && (
        <p className="mb-3 text-ink-3">
          Sojourner reads the Bibles, commentaries and reference books from the internet as you open them, and keeps what you have read.
          To have all of them on this device, download them once: {mb(total)}. Wi-Fi is best.
        </p>
      )}
      {state === "complete" && (
        <p className="mb-3 text-ink-2">
          All the books are on this device ({mb(total)}), so Sojourner works without the internet. The books in Library shelves and the
          Atlas's terrain and imagery still need it.
        </p>
      )}
      {state !== "none" && state !== "complete" && (
        <>
          <div
            className="mb-1 h-2 w-full overflow-hidden rounded-full bg-line"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(pct)}
            aria-label="Offline download"
          >
            <div className="h-full bg-accent transition-[width]" style={{ width: `${pct}%` }} />
          </div>
          <p className="mb-3 text-ink-2">
            {mb(done)} of {mb(total)}
            {state === "downloading" && " — downloading. You can keep reading; it carries on while Sojourner is open."}
            {state === "paused" && " — paused."}
            {state === "waiting" && <span className="text-ink-3"> — {status.error}</span>}
          </p>
          {state === "failed" && <p className="mb-3 text-danger">{status.error}</p>}
        </>
      )}
      <div className="flex flex-wrap gap-2">
        {state === "none" && (
          <Button variant="primary" icon={CloudDownload} onClick={download}>
            Make available offline
          </Button>
        )}
        {(state === "downloading" || state === "waiting") && (
          <Button icon={Pause} onClick={() => offlineOp("pause")}>
            Pause
          </Button>
        )}
        {(state === "paused" || state === "failed") && (
          <Button variant="primary" icon={Play} onClick={download}>
            {state === "failed" ? "Try again" : "Resume"}
          </Button>
        )}
        {state !== "none" && (
          <Button icon={Trash2} onClick={remove}>
            Remove offline copy
          </Button>
        )}
      </div>
    </div>
  );
}
