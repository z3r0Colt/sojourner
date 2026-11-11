/**
 * The tour's logic, apart from its drawing: what the reader has done so far,
 * and so what to ask of them next. The overlay looks at the app five times
 * a second and hands what it sees to `advance`.
 *
 * Three doings, the heart of the app in order: pick a verse, see what is
 * said about it, write what you see.
 *
 *   verse       waiting for the verse's menu to be opened
 *   commentary  the menu is open: waiting for a commentary to turn to a verse
 *   followed    a commentary that was already open has turned to the verse:
 *               said so, and waiting to be told to go on
 *   note        waiting for a note to be begun (the menu again, "Add a note")
 *   writing     the note's editor is open; the tour stands aside
 *   done        the closing card
 *
 * Whatever route the reader takes counts. A commentary opened from the
 * strip, or one that follows a clicked verse, is a commentary seen.
 */
export type TourStage = "verse" | "commentary" | "followed" | "note" | "writing" | "done";

export interface TourSight {
  /** The verse menu is open. */
  menuOpen: boolean;
  /** Every commentary pane and the passage it shows; changes when one is
   * opened or turns to another verse. */
  commentaries: string;
  /** The note editor is open. */
  noteOpen: boolean;
}

export interface TourProgress {
  stage: TourStage;
  /** `commentaries` as it was when the tour began. */
  commentariesAtStart: string;
}

export function beginTour(sight: TourSight): TourProgress {
  return { stage: "verse", commentariesAtStart: sight.commentaries };
}

export function advance(progress: TourProgress, sight: TourSight): TourProgress {
  const at = (stage: TourStage): TourProgress => (stage === progress.stage ? progress : { ...progress, stage });
  switch (progress.stage) {
    case "verse":
    case "commentary":
      // A note begun early is a note begun: the reader is ahead of the tour.
      if (sight.noteOpen) return at("writing");
      if (sight.commentaries !== progress.commentariesAtStart && sight.commentaries !== "") {
        // Opened by the reader's own hand: done, and on. Already open (a new
        // install that came to study starts with one) and now turned to the
        // verse they picked: that is the thing to notice, so it is pointed
        // out before the tour goes on.
        return at(progress.commentariesAtStart === "" ? "note" : "followed");
      }
      return at(sight.menuOpen ? "commentary" : "verse");
    case "followed":
      return at(sight.noteOpen ? "writing" : "followed");
    case "note":
      return at(sight.noteOpen ? "writing" : "note");
    case "writing":
      return at(sight.noteOpen ? "writing" : "done");
    case "done":
      return progress;
  }
}

/** Leaving a step undone: on to the next thing asked. */
export function skipStage(progress: TourProgress): TourProgress {
  const next: Record<TourStage, TourStage> = { verse: "note", commentary: "note", followed: "note", note: "done", writing: "done", done: "done" };
  return { ...progress, stage: next[progress.stage] };
}

/** "2 of 3" for a stage. */
export function stageNumber(stage: TourStage): number {
  return stage === "verse" ? 1 : stage === "commentary" || stage === "followed" ? 2 : 3;
}
