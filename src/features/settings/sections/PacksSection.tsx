import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { BookMarked, FilePlus, Trash2 } from "lucide-react";
import { api } from "../../../api/client";
import { usePackStatus, useInvalidateAfterPackChange } from "../../../api/queries";
import type { PackProgress } from "../../../api/types";
import { Button } from "../../../components/ui/Button";
import { confirmDialog } from "../../../components/ui/confirm";
import { toast } from "../../../components/ui/toast";
import { EmptyState } from "../../../components/ui/EmptyState";
import { cardClass } from "../../../components/ui/classes";

/** Bytes as the reader would say them: "482 MB", "1.2 GB". */
function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  if (bytes >= 1_000_000) return `${Math.round(bytes / 1_000_000)} MB`;
  if (bytes >= 1_000) return `${Math.round(bytes / 1_000)} KB`;
  return `${bytes} bytes`;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString();
}

/** What each stage is called while the reader waits for it. */
const STAGE_LABEL: Record<PackProgress["stage"], string> = {
  checking: "Checking the file…",
  extracting: "Unpacking the books…",
  installing: "Putting them in place…",
  cataloguing: "Adding them to your library…",
  done: "Done",
};

export function PacksSection() {
  const { data: status, isLoading } = usePackStatus();
  const invalidate = useInvalidateAfterPackChange();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<PackProgress | null>(null);
  // The event fires many times a second during a long extraction. Keeping the
  // listener for the life of the section -- rather than setting one up per
  // install -- means no window in which an early event is missed.
  const busyRef = useRef(false);
  busyRef.current = busy;

  useEffect(() => {
    const unlisten = listen<PackProgress>("pack-install-progress", (event) => {
      if (busyRef.current) setProgress(event.payload);
    });
    return () => {
      void unlisten.then((off) => off());
    };
  }, []);

  async function handleInstall() {
    const picked = await api.pickOpenPath("pack");
    if (!picked) return;
    if (status?.installed) {
      const proceed = await confirmDialog({
        title: "Replace the installed library?",
        message:
          `"${status.name}" ${status.version} is installed. Installing this file replaces it. ` +
          "Your notes, tags and bookmarks on these books are kept either way.",
        confirmLabel: "Replace",
      });
      if (!proceed) return;
    }
    setBusy(true);
    setProgress(null);
    try {
      const outcome = await api.installPack(picked.token);
      invalidate();
      toast.success(
        `${outcome.name} ${outcome.version} installed — ${outcome.book_count} books, searchable in full.`,
      );
    } catch (e) {
      toast.error(`Install failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function handleRemove() {
    const proceed = await confirmDialog({
      title: "Remove the book library?",
      message:
        `This deletes ${status?.book_count ?? 0} books and frees ${formatBytes(status?.bytes_on_disk ?? 0)}. ` +
        "Any notes, tags, highlights and bookmarks you made on them stay, and come back if you install the library again.",
      confirmLabel: "Remove",
      danger: true,
    });
    if (!proceed) return;
    setBusy(true);
    try {
      await api.removePack();
      invalidate();
      toast.success("The book library was removed.");
    } catch (e) {
      toast.error(`Could not remove it: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  const percent =
    progress && progress.bytes_total > 0
      ? Math.min(100, Math.round((progress.bytes_done / progress.bytes_total) * 100))
      : null;

  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold text-ink">Book library</h2>
      <p className="mb-4 text-sm text-ink-3">
        The Puritan and Reformed book library is a separate download, so the app itself stays small and installs quickly. Everything
        else — every Bible translation, every commentary, the lexicons, the encyclopedia, the atlas and the confessions — is already
        here and needs nothing added.
      </p>
      <p className="mb-5 text-sm text-ink-3">
        Download the library pack from the Sojourner releases page, then install it from the file below. Nothing is fetched over the
        network from here: this app makes no requests of its own, and a pack can just as well arrive on a USB stick.
      </p>

      {busy && (
        <div className={`${cardClass} mb-5`} role="status" aria-live="polite">
          <p className="text-sm font-medium text-ink">{progress ? STAGE_LABEL[progress.stage] : "Working…"}</p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-hover">
            <div
              className="h-full rounded-full bg-accent transition-all duration-200"
              style={{ width: percent === null ? "100%" : `${percent}%` }}
            />
          </div>
          {progress && progress.bytes_total > 0 && (
            <p className="mt-2 text-xs text-ink-3">
              {formatBytes(progress.bytes_done)} of {formatBytes(progress.bytes_total)}
              {progress.files_total > 0 && ` · ${progress.files_done} of ${progress.files_total} files`}
            </p>
          )}
          <p className="mt-2 text-xs text-ink-4">
            This takes a minute or two. You can keep reading while it runs.
          </p>
        </div>
      )}

      {!isLoading && !status?.installed && !busy && (
        <EmptyState
          icon={BookMarked}
          title="No book library installed"
          description="Install the pack to add several hundred Puritan and Reformed works, searchable down to the sentence and linkable from any passage."
          action={
            <Button variant="primary" icon={FilePlus} onClick={handleInstall}>
              Install from file…
            </Button>
          }
        />
      )}

      {status?.installed && (
        <div className={cardClass}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">
                {status.name} <span className="font-normal text-ink-3">{status.version}</span>
              </p>
              <p className="mt-0.5 text-sm text-ink-3">
                {status.book_count} books · {formatBytes(status.bytes_on_disk ?? 0)} on disk
                {status.built_at && ` · built ${formatDate(status.built_at)}`}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button icon={FilePlus} onClick={handleInstall} disabled={busy}>
                Update…
              </Button>
              <Button variant="danger-ghost" icon={Trash2} onClick={handleRemove} disabled={busy}>
                Remove
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
