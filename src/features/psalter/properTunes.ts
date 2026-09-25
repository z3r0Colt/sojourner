import type { PsalmTune } from "../../api/types";

/** The tune a metre is sung to when nothing says otherwise: a psalter tune
 * of the Reformation psalters rather than whichever name sorts first (which
 * made Azmon, "O for a thousand tongues", every common-metre psalm's tune). */
const METRE_DEFAULTS: Record<string, string> = {
  "C.M.": "st-flavian", // Day's Psalter, 1563
  "L.M.": "old-100th", // the Genevan Psalter
  "S.M.": "southwell", // Daman's Psalter, 1579
};

/** "Old 100th" -> 100: a tune named for the psalm it was written to. */
function namedFor(tune: PsalmTune): number | null {
  const m = tune.name.match(/^Old (\d+)(?:st|nd|rd|th)$/i);
  return m ? Number(m[1]) : null;
}

/** The tune to offer first for a psalm, in order: the one this reader last
 * chose for this psalm; the tune named for it (Psalm 100's Old 100th); the
 * one they last chose for its metre; the metre's psalter tune; the first. */
export function defaultTuneId(
  psalm: number,
  metre: string,
  tunes: PsalmTune[],
  remembered: { psalm?: string; metre?: string },
): string | null {
  const has = (id: string | undefined): id is string => id != null && tunes.some((t) => t.id === id);
  if (has(remembered.psalm)) return remembered.psalm;
  const proper = tunes.find((t) => namedFor(t) === psalm);
  if (proper) return proper.id;
  if (has(remembered.metre)) return remembered.metre;
  const standard = METRE_DEFAULTS[metre];
  if (has(standard)) return standard;
  return tunes[0]?.id ?? null;
}
