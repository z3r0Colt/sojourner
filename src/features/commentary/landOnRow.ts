/**
 * Keeps a virtualized list's row at the top of the list until its neighbours
 * have been measured.
 *
 * The commentary list guesses every row at 150px until it has drawn it. A
 * jump to a verse far down the chapter is worked out from those guesses, and
 * the rows it lands among are then drawn at their real heights -- short
 * one-line notes, long ones -- so the row chosen drifts off the top before the
 * list has settled (Matthew 5:3 in Barnes opened on the tail of the note
 * before, its "Verse 3" label 268px above the edge). The virtualizer checks
 * its aim for a frame; the measuring can take longer than that.
 *
 * So after the jump this watches the row itself, on the page, frame by frame,
 * and brings its top back to the top of the list whenever it has moved. It
 * stops once the row has stood still for a few frames, after a second at
 * most, or at once when the reader takes the list over (a wheel, a touch, a
 * key, a press on the scroll bar) -- it never fights a reader's own scroll.
 * Returns a function that stops it early.
 */
export function landOnRow(
  list: HTMLElement | null,
  index: number,
  rescroll: () => void,
  {
    raf = (cb: FrameRequestCallback) => requestAnimationFrame(cb),
    cancelRaf = (id: number) => cancelAnimationFrame(id),
    now = () => performance.now(),
    maxMs = 1000,
    stableFrames = 4,
  }: {
    raf?: (cb: FrameRequestCallback) => number;
    cancelRaf?: (id: number) => void;
    now?: () => number;
    maxMs?: number;
    stableFrames?: number;
  } = {},
): () => void {
  if (!list) return () => {};
  const started = now();
  let still = 0;
  let frame: number | null = null;
  const stop = () => {
    if (frame != null) cancelRaf(frame);
    frame = null;
    for (const type of READER_TAKES_OVER) list.removeEventListener(type, stop);
  };
  for (const type of READER_TAKES_OVER) list.addEventListener(type, stop, { passive: true });

  const step = () => {
    frame = null;
    if (now() - started > maxMs) return stop();
    const row = list.querySelector<HTMLElement>(`[data-index="${index}"]`);
    if (!row) {
      // Not drawn: the guesses put it off the page. Aim again.
      still = 0;
      rescroll();
    } else {
      // Where the row's top should be: the list's own padding below its edge.
      const gap = parseFloat(getComputedStyle(list).paddingTop) || 0;
      const off = row.getBoundingClientRect().top - list.getBoundingClientRect().top - gap;
      const before = list.scrollTop;
      if (Math.abs(off) > 1) list.scrollTop = before + off;
      // Standing still: in place, or as near as the list can scroll (a row
      // near the end of the chapter cannot come all the way to the top).
      if (Math.abs(off) <= 1 || Math.abs(list.scrollTop - before) < 1) still += 1;
      else still = 0;
      if (still >= stableFrames) return stop();
    }
    frame = raf(step);
  };
  frame = raf(step);
  return stop;
}

/** What the reader does to scroll the list themselves. */
const READER_TAKES_OVER = ["wheel", "touchstart", "keydown", "pointerdown"] as const;
