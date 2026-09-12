import { countWords, manuscriptText, outlineOf, passageBlocks, sourceBlocks } from "./editor/documentModel";
import { SERMON_STAGES } from "./sermonFormat";
import type { Sermon, SermonStage } from "../../api/types";

/**
 * The prep track (SB2.1): six stages that advance themselves from evidence
 * rather than from a checkbox nobody remembers to tick.
 *
 *   Text        a text passage is set
 *   Study       two or more sources or supporting passages
 *   Outline     two or more points
 *   Manuscript  60% of the target's words (or 2,000 with no target)
 *   Rehearsed   a rehearsal logged
 *   Preached    a preaching logged
 *
 * This is a pure function of counts, not of the document, so the Sermons
 * page and the Today block can read a sermon's stage without parsing its
 * body -- the stored `stage` column is what they see.
 */

export interface PrepEvidence {
  hasText: boolean;
  supportingCount: number;
  sourceCount: number;
  pointCount: number;
  words: number;
  targetMinutes: number | null;
  /** The rate minutes are measured at, for the manuscript threshold. */
  wpm: number;
  rehearsals: number;
  preachings: number;
}

/** Words a manuscript needs before it counts as written. */
export function manuscriptTarget(targetMinutes: number | null, wpm: number): number {
  return targetMinutes ? Math.round(targetMinutes * wpm * 0.6) : 2_000;
}

/** The furthest stage the evidence supports. */
export function stageFromEvidence(e: PrepEvidence): SermonStage {
  if (e.preachings > 0) return "preached";
  if (e.rehearsals > 0) return "rehearsed";
  if (e.words >= manuscriptTarget(e.targetMinutes, e.wpm)) return "manuscript";
  if (e.pointCount >= 2) return "outline";
  if (e.supportingCount + e.sourceCount >= 2) return "study";
  return "text";
}

/** Where a stage sits in the track; -1 for anything unrecognized. */
export function stageIndex(stage: SermonStage | string): number {
  return SERMON_STAGES.indexOf(stage as SermonStage);
}

/** The evidence a sermon's stored row and its body add up to. */
export function evidenceFor(sermon: Sermon, body: string, wpm: number): PrepEvidence {
  const blocks = passageBlocks(body);
  return {
    hasText: sermon.passages.some((p) => p.role === "text"),
    supportingCount: blocks.length,
    sourceCount: sourceBlocks(body).length,
    pointCount: outlineOf(body).filter((h) => h.level === 2).length,
    words: countWords(manuscriptText(body)),
    targetMinutes: sermon.target_minutes,
    wpm,
    rehearsals: sermon.events.filter((e) => e.kind === "rehearsal").length,
    preachings: sermon.events.filter((e) => e.kind === "preaching").length,
  };
}

/** What the next stage asks for, shown under the track and on Today. */
export function nextStepHint(stage: SermonStage, e: PrepEvidence): string | null {
  switch (stage) {
    case "text":
      return e.hasText ? "Send a couple of sources or insert a passage to reach Study." : "Set the sermon's text to begin.";
    case "study":
      return "Write two points to reach Outline.";
    case "outline": {
      const needed = manuscriptTarget(e.targetMinutes, e.wpm) - e.words;
      return needed > 0 ? `About ${needed.toLocaleString()} more words to reach Manuscript.` : "Keep writing.";
    }
    case "manuscript":
      return "Rehearse it, with the timer or aloud, to reach Rehearsed.";
    case "rehearsed":
      return "Mark it preached once you have preached it.";
    case "preached":
      return null;
  }
}
