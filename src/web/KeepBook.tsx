/** "Keep on this device" in the reader's sidebar, for a book on a library
 * shelf: the book is downloaded into the browser's storage once, and read
 * from there (src/web/shelves.ts), so it opens without the internet. */
import { useEffect, useState } from "react";
import { DownloadCloud, HardDriveDownload } from "lucide-react";
import { Button } from "../components/ui/Button";
import { toast } from "../components/ui/toast";
import { isBookKept, keepBook, unkeepBook } from "./shelves";

export default function KeepBook({ path }: { path: string }) {
  const [kept, setKept] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    setKept(null);
    void isBookKept(path).then((k) => live && setKept(k));
    return () => {
      live = false;
    };
  }, [path]);

  async function toggle() {
    setBusy(true);
    try {
      if (kept) {
        await unkeepBook(path);
        setKept(false);
      } else {
        await keepBook(path);
        setKept(true);
        toast.success("Kept on this device: it opens without the internet.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-b border-line p-3">
      <Button size="sm" icon={kept ? HardDriveDownload : DownloadCloud} disabled={busy || kept === null} onClick={toggle} className="w-full">
        {busy ? "Working…" : kept ? "Kept on this device — remove" : "Keep on this device"}
      </Button>
      <p className="mt-1.5 text-xs text-ink-3">
        {kept ? "This book is stored in this browser and opens without the internet." : "Download this book once to read it without the internet."}
      </p>
    </div>
  );
}
