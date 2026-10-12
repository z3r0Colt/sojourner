/**
 * One tab at a time. The reader's data file is in the browser's private
 * files, and only one worker can hold it open: a second tab would otherwise
 * fail in some unclear way. The first tab holds a Web Lock; a second asks
 * the reader whether to take over, which stops the first (it is told by
 * the lock being stolen, and says so).
 */
const LOCK = "sojourner-open";
const CHANNEL = "sojourner-open";

let lostListener: (() => void) | null = null;

/** Called when another tab takes over. */
export function onTabLost(listener: () => void) {
  lostListener = listener;
}

function request(steal: boolean): Promise<boolean> {
  return new Promise((resolve) => {
    navigator.locks
      .request(LOCK, steal ? { steal: true } : { ifAvailable: true }, (lock) => {
        if (!lock) {
          resolve(false);
          return;
        }
        resolve(true);
        // Held until the tab closes.
        return new Promise<void>(() => {});
      })
      .catch((e: unknown) => {
        // Stolen from us.
        if (e instanceof DOMException && e.name === "AbortError") lostListener?.();
        resolve(false);
      });
  });
}

/** True when this tab may use the data. A browser without Web Locks (old)
 * gets no protection, and no error. */
export function claimTab(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.locks) return Promise.resolve(true);
  // Once per page (React runs an effect twice in development): a second
  // request would find this very tab holding it.
  claim ??= request(false);
  return claim;
}

let claim: Promise<boolean> | null = null;

/** Takes over from the tab that has it, and waits for that tab to let go of
 * the files (or a moment, if it was already frozen). */
export async function takeTab(): Promise<void> {
  if (!navigator.locks) return;
  const channel = new BroadcastChannel(CHANNEL);
  const released = new Promise<void>((resolve) => {
    channel.onmessage = (e) => e.data === "released" && resolve();
    setTimeout(resolve, 3000);
  });
  claim = request(true);
  await claim;
  await released;
  channel.close();
}

/** Tells the tab that took over that this one has let go of the files. */
export function announceReleased() {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(CHANNEL);
  channel.postMessage("released");
  channel.close();
}
