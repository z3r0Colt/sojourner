import type { PsalterParams, PsalterTab } from "../../state/workspaceStore";

/**
 * The Psalter page's arithmetic: which psalm a request means, the step to the
 * one before or after, and what a bare "/psalter" opens on. Free of React and
 * of the stores, so the route parser, the pane's defaults and the page's own
 * header all agree on it -- and it can be tested -- in one place.
 */

/** The Psalms in the bundled Bibles (the metrical study pane checks the same id). */
export const PSALMS_BOOK_ID = 19;

export const PSALM_COUNT = 150;

/** True for a whole number the Psalter has a psalm for: 1 to 150. */
export function isPsalmNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= PSALM_COUNT;
}

export function isPsalterTab(v: unknown): v is PsalterTab {
  return v === "psalm" || v === "tunes";
}

/** The nearest real psalm: 0 becomes Psalm 1, 151 Psalm 150, 22.6 Psalm 23.
 * Something that is not a number at all starts at the beginning. */
export function clampPsalm(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(PSALM_COUNT, Math.max(1, Math.round(n)));
}

/** The psalm a Psalter pane is showing. Params are completed to a real
 * psalm on the way in, but a saved workspace can come back damaged (a psalm
 * of 0, or none at all); the page, its title and its URL all bring that to
 * the nearest psalm this same way, so they never disagree about which one
 * is open, and none of them says "Psalm undefined". */
export function psalmShown(params: { psalm?: unknown }): number {
  return isPsalmNumber(params.psalm) ? params.psalm : clampPsalm(Number(params.psalm));
}

/** The psalm one step before or after, or null past either end. The Psalter
 * stops at Psalm 150 as the book does, rather than wrapping round to Psalm 1
 * -- Next going quiet is how the reader knows the book is finished. */
export function stepPsalm(psalm: number, direction: 1 | -1): number | null {
  const next = psalm + direction;
  return isPsalmNumber(next) ? next : null;
}

/**
 * Fills in a Psalter request (from a route, a command, a saved workspace)
 * so the pane has complete params.
 *
 * The psalm is the one asked for; else the one this pane was already on
 * (the sidebar's plain "/psalter" must not move a Psalter that is open); else
 * the last psalm the reader opened anywhere; else Psalm 1. A psalm asked for
 * by number is one to sing, so it opens on its words even from the Tunes
 * tab; a request that names no psalm leaves the pane on the tab it was on.
 */
export function completePsalterParams(
  partial: Partial<PsalterParams>,
  current: PsalterParams | null,
  remembered: number | null,
): PsalterParams {
  const asked = isPsalmNumber(partial.psalm) ? partial.psalm : null;
  const psalm = asked ?? (current && isPsalmNumber(current.psalm) ? current.psalm : null) ?? (isPsalmNumber(remembered) ? remembered : 1);
  const view: PsalterTab = isPsalterTab(partial.view)
    ? partial.view
    : asked != null
      ? "psalm"
      : current && isPsalterTab(current.view)
        ? current.view
        : "psalm";
  return { psalm, view };
}
