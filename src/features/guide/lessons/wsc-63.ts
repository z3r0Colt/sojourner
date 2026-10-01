import type { LessonData } from "../course";
import { answer, before, classic, keep, p, pray, quiz, read, standards, teaching, write } from "./steps";

export const WSC_63: LessonData = {
  id: "wsc-63",
  title: "The fifth commandment",
  questions: [63, 64, 65, 66],
  intro:
    "The second table of the law begins at home: honour thy father and thy mother. The Catechism reads it widely, as the commandment for every relation, superiors, inferiors and equals, in the family, the church, the state and the workplace. It is also, Paul notes, the first commandment with a promise.",
  workspace: { passage: p("Eph", 6, 1), study: ["crossrefs"], question: 64 },
  steps: [
    before("Who are the people God has put over you, beside you, and under you? Write their names or roles.", "Over me… beside me… under me…"),
    read(
      "Children and fathers",
      "Read Ephesians 6:1–9. Highlight the duty given to each: children, fathers, servants, masters.",
      p("Eph", 6, 1, 9),
      p("Eph", 6, 1, 4),
    ),
    read(
      "The powers that be",
      "Read Romans 13:1–7. Highlight what we owe to rulers, and why.",
      p("Rom", 13, 1, 7),
      p("Rom", 13, 7),
      { id: "rulers", tip: null },
    ),
    answer(
      64,
      "Read Questions 63 to 66. The commandment requires “the preserving the honor, and performing the duties, belonging to everyone in their several places and relations, as superiors, inferiors, or equals.” Its promise is long life and prosperity, “as far as it shall serve for God’s glory and their own good.”",
    ),
    standards("The Larger Catechism asks who are meant by father and mother. Read Question 124: not only natural parents, but all superiors in age and gifts, and those over us in family, church or commonwealth.", "wlc", 124),
    teaching(64, "fisher", "Read Fisher’s Catechism on Question 64."),
    classic("Read Watson’s sermon on the fifth commandment.", "The Ten Commandments", "Honour thy father and thy mother: that thy days", 63, "whyte"),
    quiz(
      [
        {
          q: "Whom does the fifth commandment concern, according to Question 64?",
          choices: ["Only children and parents", "Everyone in their several places and relations, as superiors, inferiors, or equals", "Only rulers and subjects"],
          answer: 1,
          why: "Question 64. The Larger Catechism (Questions 126–132) goes through the duties and sins of each.",
        },
      ],
      [
        [63, "Will our devotions be acceptable without this?"],
        [64, "Is it the duty of children to obey their parents?"],
        [65, "Is it a sin for superiors to be harsh and unkind to their inferiors?"],
        [66, "Do all good children prosper in this world?"],
      ],
    ),
    write("Write a note on Ephesians 6:2: one person over you whom you could honour better this week, and how.", p("Eph", 6, 2), "wsc-63"),
    keep("Learn Questions 63 to 66, and Ephesians 6:1–2.", [63, 64, 65, 66], p("Eph", 6, 1, 2)),
    pray("Pray in the prayer journal for each person you wrote down at the start, by name: those over you, beside you, and under you.", "wsc-63"),
  ],
};
