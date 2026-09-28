import { useTtsStore } from "../../state/ttsStore";

/**
 * The part of reading a book aloud that talks to the player: whether a
 * reading is this reader's, and loading the rest of the book as the voice
 * gets to it.
 *
 * A book starts reading from the page on screen at once, and the sections
 * (or pages) after it are handed to the player as the voice approaches the
 * end of what it has -- not all at once: most readings stop long before the
 * end of the book, and Edwards' second volume is a few hundred sections.
 */

type TtsState = ReturnType<typeof useTtsStore.getState>;

/** How many pieces ahead of the voice a book keeps loaded: ten minutes of
 * listening or so, far more than one section takes to load. */
export const LOOKAHEAD_PIECES = 30;

/** Whether pane `paneId` is reading `title` aloud and has not finished:
 * playing, paused, or waiting for more of the book. */
export function isReadingHere(s: TtsState, title: string, paneId: string | null): boolean {
  return (s.isPlaying || s.isPaused) && s.sourceKind === "resource" && s.title === title && s.paneId === paneId && s.segments.length > 0;
}

/**
 * Resolves true once the voice is within `LOOKAHEAD_PIECES` of the end of
 * what is loaded (or has run out and is waiting), and false as soon as the
 * reading is no longer `ours` -- stopped, replaced, or its reader closed.
 */
export function whenMoreWanted(ours: (s: TtsState) => boolean): Promise<boolean> {
  const check = (s: TtsState): boolean | null => {
    if (!ours(s)) return false;
    if (s.waitingForMore || s.segments.length - s.currentSegmentIndex <= LOOKAHEAD_PIECES) return true;
    return null;
  };
  return new Promise((resolve) => {
    const now = check(useTtsStore.getState());
    if (now !== null) {
      resolve(now);
      return;
    }
    const unsubscribe = useTtsStore.subscribe((s) => {
      const answer = check(s);
      if (answer === null) return;
      unsubscribe();
      resolve(answer);
    });
  });
}

/**
 * Tells a reading that was waiting on more of the book that nothing more is
 * coming, because the reader loading it has closed and no other has taken
 * it over. The voice finishes what it has rather than holding on "Preparing
 * the voice…" for ever.
 */
export function endLoading(title: string, paneId: string | null): void {
  const s = useTtsStore.getState();
  if (s.more && s.sourceKind === "resource" && s.title === title && s.paneId === paneId) s.appendSegments(title, paneId, [], { done: true });
}

const readingKey = (title: string, paneId: string | null) => `${paneId ?? ""}\u0000${title}`;

/** Readings whose reader has just closed, and the timer that will end their
 * loading unless a reader of the same book in the same pane takes it over. */
const lettingGo = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * The reader loading a reading is closing. The reading is told nothing more
 * is coming -- but not at once, because a reader is often closed only to be
 * opened again straight away: the book opened afresh in the same pane at a
 * citation, say. Ended there and then, the reading went on through what it
 * had and stopped mid-book without a word, and the new reader, knowing
 * nothing of it, never loaded another section. React runs the old reader's
 * cleanup and the new one's setup in the same pass, so a moment is long
 * enough for the new one to say it is taking over (`takeOverLoading`).
 */
export function letGoOfLoading(title: string, paneId: string | null): void {
  const key = readingKey(title, paneId);
  const pending = lettingGo.get(key);
  if (pending !== undefined) clearTimeout(pending);
  lettingGo.set(
    key,
    setTimeout(() => {
      lettingGo.delete(key);
      endLoading(title, paneId);
    }, 0),
  );
}

/**
 * A reader of `title` opening in pane `paneId`: whether that pane is in the
 * middle of reading the book with more of it still to load -- a reading the
 * reader before this one was loading until a moment ago -- in which case
 * it is this reader's to carry on loading, from the section (or page) after
 * the last one the reading holds, once the book is open. If it cannot, it
 * must call `endLoading` itself; if it closes first, `letGoOfLoading`.
 */
export function takeOverLoading(title: string, paneId: string | null): boolean {
  const key = readingKey(title, paneId);
  const pending = lettingGo.get(key);
  if (pending !== undefined) {
    clearTimeout(pending);
    lettingGo.delete(key);
  }
  const s = useTtsStore.getState();
  return s.more && s.sourceKind === "resource" && s.title === title && s.paneId === paneId && s.segments.length > 0;
}
