import { sortKey, type Lesson, type LessonData } from "../course";
import { reviewLesson } from "./review";
import { WSC_1 } from "./wsc-1";
import { WSC_2 } from "./wsc-2";
import { WSC_4 } from "./wsc-4";
import { WSC_33 } from "./wsc-33";

/** Every lesson as written, in any order: the course sorts them. */
const WRITTEN: LessonData[] = [WSC_1, WSC_2, WSC_4, WSC_33];

/** The units' question ranges, each closed by a review of its lessons. The
 * prayer journal is introduced in unit 2, so unit 1's review prays without it. */
const REVIEWS: { id: string; title: string; range: [number, number]; journal: boolean }[] = [
  { id: "review-1", title: "Review: Scripture", range: [1, 3], journal: false },
  { id: "review-2", title: "Review: What we believe concerning God", range: [4, 38], journal: true },
  { id: "review-3", title: "Review: The law", range: [39, 84], journal: true },
  { id: "review-4", title: "Review: The gospel and the means of grace", range: [85, 107], journal: true },
];

function inRange(l: LessonData, [lo, hi]: [number, number]) {
  return l.questions[0] >= lo && l.questions[0] <= hi;
}

const reviews = REVIEWS.flatMap((r) => {
  const lessons = WRITTEN.filter((l) => inRange(l, r.range)).sort((a, b) => sortKey(a) - sortKey(b));
  return lessons.length ? [reviewLesson(r.id, r.title, r.range, lessons, r.journal)] : [];
});

/** Every lesson in course order (the Shorter Catechism's). A lesson's number
 * is its place here, so it moves as lessons are written; progress is kept by
 * id, which does not. */
export const LESSONS: Lesson[] = [...WRITTEN, ...reviews].sort((a, b) => sortKey(a) - sortKey(b)).map((l, i) => ({ ...l, number: i + 1 }));
