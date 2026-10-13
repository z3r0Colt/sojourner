import { useEffect, useState } from "react";
import { Check, CloudDownload, Pause, Play, Trash2 } from "lucide-react";
import { usePackStatuses } from "../api/queries";
import { Button } from "../components/ui/Button";
import { confirmDialog } from "../components/ui/confirm";
import { toast } from "../components/ui/toast";
import { offlineOp, onOfflineStatus } from "./backend";
import { WEB_SHELVES } from "./shelves";
import type { OfflineStatus } from "./protocol";

const size = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : `${Math.max(1, Math.round(n / 1e6))} MB`);

/** Where a download stands, kept up to date by the worker. */
function useOfflineStatus(target: string): OfflineStatus | null {
  const [status, setStatus] = useState<OfflineStatus | null>(null);
  useEffect(() => {
    const off = onOfflineStatus(target, setStatus);
    offlineOp("status", target).catch(() => {});
    return off;
  }, [target]);
  return status;
}

/**
 * One thing that can be downloaded for use without the internet: the
 * books (`target` "content") or a library shelf ("shelf:<id>"). The
 * download runs in the backend's worker (offlineCopy.ts).
 */
export function OfflineRow({ target, name, what, compact }: { target: string; name: string; what: string; compact?: boolean }) {
  const status = useOfflineStatus(target);
  if (!status || status.total === 0) return null;
  const { state, done, total } = status;
  const pct = total > 0 ? Math.min(100, (done / total) * 100) : 0;

  async function download() {
    // Asked here, from the page: a worker can't. A download the browser may
    // clear when short of space would be a poor one. Not waited for: Firefox
    // asks the reader, and the answer may never come.
    void navigator.storage?.persist?.().catch(() => false);
    await offlineOp("download", target);
  }

  async function remove() {
    const ok = await confirmDialog({
      title: `Remove the download of ${name}?`,
      message: `This frees ${size(done)} on this device. Sojourner will read ${what} over the internet again. Your notes and other data are not touched.`,
      confirmLabel: "Remove download",
      danger: true,
    });
    if (!ok) return;
    await offlineOp("remove", target);
    toast.success(`${name} will be read over the internet again.`);
  }

  const line =
    state === "none"
      ? `Not downloaded · ${size(total)}`
      : state === "complete"
        ? `Downloaded · ${size(total)} on this device`
        : `${size(done)} of ${size(total)}${state === "downloading" ? " · downloading" : state === "paused" ? " · paused" : ""}`;

  return (
    <div className={compact ? "" : "border-t border-line py-3 first:border-t-0"}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          {!compact && <p className="text-sm font-medium text-ink">{name}</p>}
          <p className={state === "complete" ? "flex items-center gap-1.5 text-sm text-ink-2" : "text-sm text-ink-3"}>
            {state === "complete" && <Check className="h-3.5 w-3.5 text-accent" aria-hidden="true" />}
            {line}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {state === "none" && (
            <Button variant={compact ? "secondary" : "primary"} size="sm" icon={CloudDownload} onClick={download}>
              Download
            </Button>
          )}
          {(state === "downloading" || state === "waiting") && (
            <Button size="sm" icon={Pause} onClick={() => offlineOp("pause", target)}>
              Pause
            </Button>
          )}
          {(state === "paused" || state === "failed") && (
            <Button variant="primary" size="sm" icon={Play} onClick={download}>
              {state === "failed" ? "Try again" : "Resume"}
            </Button>
          )}
          {state !== "none" && (
            <Button size="sm" variant="ghost" icon={Trash2} onClick={remove}>
              {state === "complete" ? "Remove download" : "Cancel"}
            </Button>
          )}
        </div>
      </div>
      {state !== "none" && state !== "complete" && (
        <>
          <div
            className="mt-2 h-2 w-full overflow-hidden rounded-full bg-line"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(pct)}
            aria-label={`Downloading ${name}`}
          >
            <div className="h-full bg-accent transition-[width]" style={{ width: `${pct}%` }} />
          </div>
          {state === "downloading" && <p className="mt-1 text-xs text-ink-3">You can keep reading. It carries on while Sojourner is open.</p>}
          {state === "waiting" && <p className="mt-1 text-xs text-ink-3">{status.error}</p>}
          {state === "failed" && <p className="mt-1 text-xs text-danger">{status.error}</p>}
        </>
      )}
    </div>
  );
}

/** Settings → Data & backups: what can be downloaded so Sojourner works
 * without the internet, each with its own Download. */
export default function WebOffline() {
  const { data: packs } = usePackStatuses();
  const added = WEB_SHELVES.filter((s) => (packs ?? []).some((p) => p.id === s.id && p.installed && p.kind !== "map"));

  return (
    <div className="mb-6 rounded-lg border border-line bg-surface p-3 text-sm">
      <h3 className="mb-1 font-medium text-ink">Use without the internet</h3>
      <p className="mb-2 text-ink-3">
        Sojourner reads the books from the internet as you open them. Download what you want on this device, and it opens with no
        connection at all. Your own notes are always on this device, whatever you choose here. Wi-Fi is best for a large download.
      </p>
      <OfflineRow target="content" name="Bibles, commentaries and reference books" what="them" />
      {added.map((s) => (
        <OfflineRow key={s.id} target={`shelf:${s.id}`} name={`${s.name} shelf (${s.bookCount} books)`} what="its books" />
      ))}
      <p className="mt-2 text-xs text-ink-4">
        {added.length === 0 && "Library shelves you add under Library shelves can be downloaded here too. "}
        The Atlas's terrain and satellite views always need the internet.
      </p>
    </div>
  );
}
