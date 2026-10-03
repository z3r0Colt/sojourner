import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { inBrowser, onDesktop } from "./platform";

/** Often enough that a phone's "prayed for" is on the television by the
 * time anyone looks; one small query, so cheap enough to keep up. */
const POLL_MS = 3000;

/**
 * Keeps what this page shows in step with what other devices write, while
 * more than one may be writing: always in a browser on another device, and
 * on the desktop while Settings → Other devices is on.
 *
 * Pages keep what they have read (settings for good), so without this the
 * desktop would show the family worship from before the phone moved it on --
 * and its next change to that setting, built on its old copy, would undo the
 * phone's. So every few seconds the page asks the database how many writes
 * it has seen (`data_version`), and when the number has moved, reloads what
 * it shows.
 *
 * Its own writes move the number too. Those it skips, since each one already
 * refreshes what it changed, and reloading everything after every autosave
 * of a manuscript being typed would be needless churn. A write from another
 * device in the same few seconds is then caught the next time this page
 * comes to the front, when everything is reloaded regardless.
 */
export function useLiveSync(): void {
  const qc = useQueryClient();
  const { data: remote } = useQuery({ queryKey: ["remoteStatus"], queryFn: api.remoteStatus, enabled: onDesktop });
  const active = inBrowser || !!remote?.running;

  useEffect(() => {
    if (!active) return;
    let seen: number | null = null;
    let ownWrite = false;
    let busy = false;
    const unsubscribe = qc.getMutationCache().subscribe((event) => {
      if (event.type === "updated" && event.action.type === "success") ownWrite = true;
    });
    const tick = async () => {
      if (busy || document.hidden) return;
      busy = true;
      try {
        // A write of this page's own is under way: wait for it to land.
        if (qc.isMutating() > 0) return;
        const version = await api.dataVersion();
        const mine = ownWrite;
        ownWrite = false;
        if (seen != null && version !== seen && !mine) void qc.invalidateQueries();
        seen = version;
      } catch {
        // The desktop closed, or the network blinked: try again next time.
      } finally {
        busy = false;
      }
    };
    const onVisible = () => {
      if (document.hidden) return;
      void qc.invalidateQueries();
      void tick();
    };
    void tick();
    const timer = window.setInterval(() => void tick(), POLL_MS);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      unsubscribe();
    };
  }, [active, qc]);
}
