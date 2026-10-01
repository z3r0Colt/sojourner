import type { LessonData, QuizQuestion, HenryAsk } from "../course";
import { look, pray, prayQuietly } from "./steps";

/**
 * A unit's closing review, made from the unit's own lessons: the student's
 * "before you read" answers set beside what they would say now, the
 * catechism cards to practise, and a quiz of the first question of each
 * lesson's check together with the first of Henry's.
 */
export function reviewLesson(id: string, title: string, range: [number, number], lessons: LessonData[], journal: boolean): LessonData {
  const own: QuizQuestion[] = [];
  const henry: HenryAsk[] = [];
  for (const l of lessons) {
    const check = l.steps.find((s) => s.check?.type === "quiz")?.check;
    if (check?.type !== "quiz") continue;
    if (check.questions[0]) own.push(check.questions[0]);
    if (check.henry?.[0]) henry.push(check.henry[0]);
  }
  const questions = Array.from({ length: range[1] - range[0] + 1 }, (_, i) => range[0] + i);
  const prayer =
    "Thank God for what he has taught you in this unit, and ask him to fix it in your heart. Pray through the answers you have learned, one at a time.";
  return {
    id,
    review: true,
    title,
    questions,
    intro: `A pause at the end of the unit: look back at what you thought before each lesson, practise the answers you have learned, and check what has stayed with you.`,
    workspace: { ...lessons[0].workspace, study: [], question: undefined },
    steps: [
      {
        id: "then",
        title: "Then and now",
        text: "Here is what you wrote before each lesson in this unit. Read it again, then write what you would say now.",
        check: { type: "reflect" },
      },
      look("practise", "Practise your cards", "Go through the catechism and Scripture cards that are due. Say each answer aloud before you turn it over.", { pane: "memory" }, {
        openLabel: "Open Memory",
      }),
      {
        id: "check",
        title: "What has stayed with you",
        text: "Questions from each lesson of the unit.",
        check: { type: "quiz", questions: own, henry },
      },
      journal ? pray(prayer, id) : prayQuietly(prayer),
    ],
  };
}
