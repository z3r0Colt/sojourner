import { useMemo } from "react";
import { usePassagesIn, useSpeakingRate } from "../../api/queries";
import { useSetting } from "../../hooks/useSetting";
import { countWords, manuscriptText, passageBlocks } from "./editor/documentModel";
import type { PassageRef } from "../../api/types";

/**
 * Words and minutes (SB1.7).
 *
 * At 130 words a minute a 35-minute sermon is about 4,500 words -- but the
 * rate is what actually decides that, which is why it is measured from real
 * rehearsals and preachings (SB2.4) rather than assumed. The setting is
 * only the fallback until two timed runs exist.
 */

/** The fallback rate, in words a minute, until the app has measured one. */
export const SPEAKING_WPM_SETTING = "speaking_wpm";
export const DEFAULT_SPEAKING_WPM = 130;

export interface SpeakingRateInfo {
  wpm: number;
  /** True when the rate came from the preacher's own timed runs. */
  measured: boolean;
  rehearsals: number;
  preachings: number;
}

/** The rate every "about N minutes" in the app uses: measured when there is
 * one, else the setting. */
export function useSpeakingRateInfo(): SpeakingRateInfo {
  const { data: measured } = useSpeakingRate();
  const [fallback] = useSetting<number>(SPEAKING_WPM_SETTING, DEFAULT_SPEAKING_WPM);
  if (measured) {
    return { wpm: measured.wpm, measured: true, rehearsals: measured.rehearsals, preachings: measured.preachings };
  }
  return { wpm: fallback > 0 ? fallback : DEFAULT_SPEAKING_WPM, measured: false, rehearsals: 0, preachings: 0 };
}

/** Minutes for a word count, rounded to the nearest whole minute (never 0
 * for a manuscript that has words in it). */
export function minutesFor(words: number, wpm: number): number {
  if (words <= 0) return 0;
  return Math.max(1, Math.round(words / Math.max(1, wpm)));
}

/** "at your measured 122 wpm" / "at 130 wpm" -- the footer says which. */
export function rateLabel(rate: SpeakingRateInfo): string {
  return rate.measured ? `at your measured ${rate.wpm} wpm` : `at ${rate.wpm} wpm`;
}

export interface SermonWordCount {
  /** The writer's own words, passage blocks excluded. */
  written: number;
  /** The rendered length of the passage blocks, which are spoken too. */
  passages: number;
  total: number;
  minutes: number;
}

/**
 * The manuscript's length. Passage text counts at its rendered length --
 * the preacher reads it aloud -- while captions and source lines do not,
 * since nobody says "English Standard Version" from the pulpit.
 */
export function useSermonWordCount(body: string, translationId: number | null, rate: SpeakingRateInfo): SermonWordCount {
  const refs: PassageRef[] = useMemo(() => passageBlocks(body), [body]);
  const { byKey } = usePassagesIn(translationId, refs);

  return useMemo(() => {
    const written = countWords(manuscriptText(body));
    let passages = 0;
    for (const ref of refs) {
      const passage = byKey.get(`${ref.book_id}:${ref.chapter}:${ref.verse_start}:${ref.verse_end}`);
      if (passage) passages += countWords(passage.text);
    }
    const total = written + passages;
    return { written, passages, total, minutes: minutesFor(total, rate.wpm) };
  }, [body, refs, byKey, rate.wpm]);
}
