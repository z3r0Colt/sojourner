/**
 * Holding the window open until the last save has actually landed.
 *
 * `beforeunload` is not enough for this app. The manuscript autosave promises
 * never to lose a keystroke, but its unload handler called `update.mutate`,
 * which posts an async IPC message and returns -- the webview was then torn
 * down with that message still in flight, so the last debounce interval of
 * typing was a race, and one the reader could neither see nor win reliably.
 *
 * So closing is a handshake instead. Rust prevents the close, emits
 * `app-closing`, and waits; anything with unsaved work registers a flush
 * here; when every flush has settled the window is told it may go. Rust
 * destroys the window regardless after its own timeout, so a page that
 * cannot answer does not leave a window that will not close.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

/** Something to finish before the window closes. May be synchronous. */
type Flusher = () => void | Promise<void>;

const flushers = new Set<Flusher>();

/** Registers `fn` to run before the window closes. Returns its unregister --
 * call it on unmount, or a closed pane keeps being asked to save. */
export function registerCloseFlush(fn: Flusher): () => void {
  flushers.add(fn);
  return () => {
    flushers.delete(fn);
  };
}

/** One flush, with anything it throws or rejects treated as done. A save
 * that fails must not hold the window open for the full timeout. */
function settle(fn: Flusher): Promise<unknown> {
  try {
    return Promise.resolve(fn()).catch(() => {});
  } catch {
    return Promise.resolve();
  }
}

/**
 * Starts listening for the close request. Returns a teardown.
 *
 * This is the app's first `listen`, so two things it must get right: the
 * subscription is undone on teardown, and a teardown that happens before
 * `listen` resolves still undoes it -- otherwise the listener outlives the
 * component that asked for it.
 *
 * `core:default` grants `core:event:default`, which carries `allow-listen`
 * and `allow-unlisten`, so this needs nothing added to the capability.
 */
export function installCloseHandshake(): () => void {
  let unlisten: UnlistenFn | null = null;
  let torndown = false;

  listen("app-closing", () => {
    void Promise.all([...flushers].map(settle))
      .then(() => invoke("ready_to_close"))
      .catch(() => {});
  })
    .then((fn) => {
      // Unmounted while the subscription was still being set up.
      if (torndown) {
        void fn();
        return;
      }
      unlisten = fn;
    })
    .catch(() => {});

  return () => {
    torndown = true;
    if (unlisten) {
      void unlisten();
      unlisten = null;
    }
  };
}
