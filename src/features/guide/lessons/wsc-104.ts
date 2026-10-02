import type { LessonData } from "../course";
import { answer, before, classic, keep, p, pray, quiz, read, sing, standards, teaching, write } from "./steps";

export const WSC_104: LessonData = {
  id: "wsc-104",
  title: "Daily bread and forgiveness",
  questions: [104, 105],
  intro:
    "Having asked for God’s glory, we may ask for our needs: bread for today, and forgiveness for our sins. The first teaches dependence and contentment; the second ties together God’s forgiving us and our forgiving others.",
  workspace: { passage: p("Matt", 18, 21), study: ["crossrefs"], question: 105 },
  steps: [
    before("Is there anyone you have not forgiven? Write their initials, or just yes or no.", "…"),
    read(
      "Seventy times seven",
      "Read Matthew 18:21–35. Highlight the two debts in the story, and how they compare.",
      p("Matt", 18, 21, 35),
      p("Matt", 18, 32, 35),
    ),
    read(
      "Neither poverty nor riches",
      "Read Proverbs 30:7–9 and highlight what Agur asks for, and why.",
      p("Prov", 30, 7, 9),
      p("Prov", 30, 8, 9),
      { id: "bread", tip: null },
    ),
    answer(
      105,
      "Read Questions 104 and 105. For bread we pray “that of God’s free gift we may receive a competent portion of the good things of this life, and enjoy his blessing with them.” For forgiveness, that God “for Christ’s sake, would freely pardon all our sins; which we are the rather encouraged to ask, because by his grace we are enabled from the heart to forgive others.” Our forgiving does not earn his; it is a sign of his grace in us.",
    ),
    standards("Read the Larger Catechism Question 194, on the fifth petition, and notice how it begins with our debt.", "wlc", 194),
    teaching(105, "whyte", "Read Alexander Whyte on Question 105."),
    classic("Read Watson’s sermon on the fifth petition.", "The Lord's Prayer", "Before I speak strictly to the", 105, "whyte"),
    quiz(
      [
        {
          q: "Why does Question 105 say we are encouraged to ask God’s forgiveness?",
          choices: ["Because we have earned it by forgiving others", "Because by his grace we are enabled from the heart to forgive others", "Because our sins are small"],
          answer: 1,
          why: "Our forgiving others is the fruit of his grace in us, and so encourages us to ask him; it does not purchase his pardon.",
        },
      ],
      [
        [104, "Do we deserve the good things of this life?"],
        [105, "Can we discharge these debts ourselves ?"],
        [105, "Is it possible to obtain the forgiveness of this debt?"],
      ],
    ),
    write("Write a note on Matthew 18:33 about the person you thought of at the start: what Christ has forgiven you, beside what they owe you.", p("Matt", 18, 33), "wsc-104"),
    keep("Learn Questions 104 and 105, and Ephesians 4:32.", [104, 105], p("Eph", 4, 32)),
    sing(23, "Sing Psalm 23: “The LORD is my shepherd; I shall not want.”"),
    pray("Ask God in the prayer journal for today’s needs, then confess your sins, and forgive the person you thought of, before him.", "wsc-104"),
  ],
};
