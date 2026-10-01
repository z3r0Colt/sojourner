import type { LessonData } from "../course";
import { answer, before, classic, keep, p, pray, quiz, read, standards, teaching, write } from "./steps";

// Unit 3 begins: the duty God requires of man.
export const WSC_39: LessonData = {
  id: "wsc-39",
  title: "The moral law",
  questions: [39, 40, 41],
  intro:
    "The second part of the Catechism begins: having learned what to believe concerning God, we learn what duty God requires of us. It is obedience to his revealed will; the rule of it is the moral law, written first on Adam’s heart and later on tables of stone; and it is summed up in the ten commandments.",
  workspace: { passage: p("Rom", 2, 12), study: ["crossrefs"], question: 40 },
  steps: [
    before("If we are saved by grace, why should a Christian keep God’s law at all?", "A Christian keeps the law because…"),
    read(
      "Written in their hearts",
      "Read Romans 2:12–16. Paul says even those who never had the law of Moses have a law. Highlight where he says it is written.",
      p("Rom", 2, 12, 16),
      p("Rom", 2, 14, 15),
    ),
    read(
      "Not to destroy",
      "Read Matthew 5:17–20, and highlight what Christ says he came to do with the law.",
      p("Matt", 5, 17, 20),
      p("Matt", 5, 17, 18),
      { id: "fulfil", tip: null },
    ),
    answer(
      40,
      "Read Questions 39 to 41. The duty is “obedience to his revealed will”; the rule God at first revealed was “the moral law”; and “The moral law is summarily comprehended in the ten commandments.” The commandments are the summary; the whole Bible opens them out.",
    ),
    standards(
      "Why keep the law if we cannot be saved by it? The Larger Catechism answers with three uses of the law: for all men (Question 95), for the unregenerate (96), and for the regenerate (97). Read Question 97: the law shows believers how much they are bound to Christ for fulfilling it in their stead, and is the rule of their thankful obedience.",
      "wlc",
      97,
    ),
    teaching(40, "fisher", "Read Fisher’s Catechism on Question 40: on the law of nature, written on man’s heart, and the positive laws God added to it, such as the command about the forbidden fruit."),
    classic(
      "Watson begins his sermons on the commandments with obedience, from Deuteronomy 27:9–10.",
      "The Ten Commandments",
      "this day thou art become the people of the Lord thy God",
      39,
      "whyte",
    ),
    quiz(
      [
        {
          q: "According to the Larger Catechism (Question 97), why should a believer keep the law?",
          choices: ["To earn salvation", "Out of thankfulness to Christ, who fulfilled it in our stead", "Only to avoid punishment"],
          answer: 1,
          why: "The law shows believers “how much they are bound to Christ for his fulfilling it”, and so moves them to thankfulness and obedience.",
        },
      ],
      [
        [39, "Has God made known his will concerning our duty?"],
        [40, "Is it written in the heart of man?"],
        [41, "But are they binding to us now?"],
      ],
    ),
    write("Write a note on Matthew 5:17: what it means for you that Christ came not to destroy the law, but to fulfil it.", p("Matt", 5, 17), "wsc-39"),
    keep("Learn Questions 39 to 41, and Matthew 5:17.", [39, 40, 41], p("Matt", 5, 17)),
    pray("Pray Psalm 119:33 in the prayer journal: “Teach me, O LORD, the way of thy statutes; and I shall keep it unto the end.”", "wsc-39"),
  ],
};
