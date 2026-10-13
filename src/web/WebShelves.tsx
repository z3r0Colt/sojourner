/**
 * Settings → Library shelves on the web: the desktop's "Library packs" with
 * nothing to download first. A shelf is added with a button and its books are
 * read from the shelf as they are opened (src/web/shelves.ts); the Atlas's
 * terrain and satellite layers need no adding at all.
 */
import { useState } from "react";
import { BookMarked, Check, Map as MapIcon, Plus, Trash2 } from "lucide-react";
import { useInvalidateAfterPackChange, usePackStatuses } from "../api/queries";
import { Button } from "../components/ui/Button";
import { confirmDialog } from "../components/ui/confirm";
import { toast } from "../components/ui/toast";
import { cardClass } from "../components/ui/classes";
import { webMapPacks } from "./mapPacks";
import { WEB_SHELVES } from "./shelves";
import { shelfOp } from "./backend";
import { OfflineRow } from "./WebOffline";

/** Bytes as the reader would say them: "482 MB", "1.2 GB". */
function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  if (bytes >= 1_000_000) return `${Math.round(bytes / 1_000_000)} MB`;
  return `${Math.round(bytes / 1_000)} KB`;
}

const BLURB: Record<string, string> = {
  library: "Owen, Bunyan, Spurgeon, Calvin, Edwards, the Westminster divines and their heirs.",
  fathers: "Augustine, Chrysostom, Athanasius, Eusebius and others, from the Ante-Nicene and Nicene Fathers.",
  ancient: "Josephus, Philo, 1 Enoch and the Roman historians, for the world around the Bible.",
  nineteenth: "Schaff's Church History and Edersheim's Life of Jesus the Messiah, among others.",
};

export default function WebShelves() {
  const { data: packs, isLoading } = usePackStatuses();
  const invalidate = useInvalidateAfterPackChange();
  const [busy, setBusy] = useState<string | null>(null);
  const added = new Set((packs ?? []).filter((p) => p.installed && p.kind !== "map").map((p) => p.id));

  async function add(id: string, name: string) {
    setBusy(id);
    try {
      await shelfOp("add", id);
      invalidate();
      toast.success(`${name} added. Its books are in Resources, and search and Cited in your library read them.`);
    } catch (e) {
      toast.error(`Couldn't add ${name}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string, name: string, books: number) {
    const proceed = await confirmDialog({
      title: `Remove ${name}?`,
      message:
        `${books} books leave your library, and any you kept on this device are forgotten. ` +
        "Notes, tags, highlights and bookmarks you made on them stay, and come back if you add the shelf again.",
      confirmLabel: "Remove",
      danger: true,
    });
    if (!proceed) return;
    setBusy(id);
    try {
      await shelfOp("remove", id);
      invalidate();
      toast.success(`${name} was removed.`);
    } catch (e) {
      toast.error(`Couldn't remove it: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold text-ink">Library shelves</h2>
      <p className="mb-4 text-sm text-ink-3">
        The book library comes as shelves you add. Adding one downloads nothing: its books are read from the internet as you open them.
        To read a whole shelf without the internet, press Download on it; for a single book, open it and press Keep on this device.
      </p>

      <ul className="space-y-2">
        {WEB_SHELVES.map((s) => {
          const has = added.has(s.id);
          return (
            <li key={s.id} className={cardClass}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{s.name}</p>
                  <p className="mt-0.5 text-sm text-ink-3">
                    {s.bookCount} books · {formatBytes(s.dbBytes + s.bookBytes)} on the shelf
                  </p>
                  {BLURB[s.id] && <p className="mt-1 text-xs text-ink-4">{BLURB[s.id]}</p>}
                </div>
                {has ? (
                  <Button variant="danger-ghost" icon={Trash2} disabled={busy !== null} onClick={() => remove(s.id, s.name, s.bookCount)}>
                    Remove
                  </Button>
                ) : (
                  <Button variant="primary" icon={Plus} disabled={busy !== null || isLoading} onClick={() => add(s.id, s.name)}>
                    {busy === s.id ? "Adding…" : "Add"}
                  </Button>
                )}
              </div>
              {has && (
                <div className="mt-2 border-t border-line pt-2">
                  <p className="mb-1 flex items-center gap-1.5 text-xs text-ink-3">
                    <Check className="h-3.5 w-3.5" aria-hidden="true" /> Added
                  </p>
                  <OfflineRow target={`shelf:${s.id}`} name={`${s.name} shelf`} what="its books" compact />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {added.size === 0 && !isLoading && (
        <p className="mt-3 flex items-center gap-2 text-sm text-ink-3">
          <BookMarked className="h-4 w-4" aria-hidden="true" /> No shelves added yet.
        </p>
      )}

      <h2 className="mb-1 mt-8 text-lg font-semibold text-ink">Map layers</h2>
      <p className="mb-3 text-sm text-ink-3">
        The Atlas's terrain and satellite views are read from the map as it shows them, so there is nothing to add. Choose one under Layers
        in the Atlas.
      </p>
      <ul className="space-y-2">
        {webMapPacks().map((p) => (
          <li key={p.id ?? p.name ?? ""} className={cardClass}>
            <p className="flex items-center gap-2 text-sm font-medium text-ink">
              <MapIcon className="h-4 w-4 text-ink-4" aria-hidden="true" /> {p.name}
            </p>
            {p.map?.attribution && <p className="mt-1 text-xs text-ink-4">{p.map.attribution}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
