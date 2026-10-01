import type { Lesson, LessonData } from "../course";
import { WSC_1 } from "./wsc-1";
import { WSC_4 } from "./wsc-4";
import { WSC_33 } from "./wsc-33";

/** Every lesson, in course order (the Shorter Catechism's). A lesson's
 * number is its place here, so it moves as lessons are written; progress is
 * kept by id, which does not. */
const WRITTEN: LessonData[] = [WSC_1, WSC_4, WSC_33];

export const LESSONS: Lesson[] = [...WRITTEN]
  .sort((a, b) => a.questions[0] - b.questions[0])
  .map((l, i) => ({ ...l, number: i + 1 }));
