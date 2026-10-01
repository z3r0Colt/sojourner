import type { LessonData } from "../course";
import { answer, before, classic, keep, look, p, pray, quiz, read, standards, teaching, write } from "./steps";

export const WSC_67: LessonData = {
  id: "wsc-67",
  title: "The sixth commandment",
  questions: [67, 68, 69],
  intro:
    "“Thou shalt not kill” seems the easiest commandment to keep, until Jesus says that anger without cause, and contempt, break it in the heart. The Catechism reads it both ways: it forbids taking life unjustly, and requires every lawful effort to preserve our own life and the lives of others.",
  workspace: { passage: p("Matt", 5, 21), study: ["crossrefs"], question: 68 },
  steps: [
    before("Have you ever broken the sixth commandment? Write what you think, before you read.", "I think I have / have not, because…"),
    read(
      "But I say unto you",
      "Read Matthew 5:21–26. Highlight what Jesus says breaks this commandment, and what he tells us to do first.",
      p("Matt", 5, 21, 26),
      p("Matt", 5, 22, 24),
    ),
    look(
      "cain",
      "The first murderer",
      "Look up Cain in the Factbook, then read Genesis 4:3–10 and 1 John 3:11–15. Where did his murder begin?",
      { pane: "factbook", id: "Cain@Gen.4.1-Jud" },
      { openLabel: "Cain in the Factbook" },
    ),
    answer(
      68,
      "Read Questions 67 to 69. The commandment requires “all lawful endeavors to preserve our own life, and the life of others,” and forbids “the taking away of our own life, or the life of our neighbour, unjustly, or whatsoever tendeth thereunto.” Whatever tends to it: anger, hatred, neglect.",
    ),
    standards("The Larger Catechism lists the duties of this commandment. Read Question 135, and notice how many are about the heart and the tongue.", "wlc", 135),
    teaching(68, "fisher", "Read Fisher’s Catechism on Question 68."),
    classic("Read Watson’s sermon on the sixth commandment.", "The Ten Commandments", "In this commandment is a sin forbidden, which is murder", 67, "whyte"),
    quiz(
      [
        {
          q: "Does the sixth commandment only forbid murder?",
          choices: ["Yes", "No: it also requires all lawful endeavours to preserve our own life and the life of others"],
          answer: 1,
          why: "Question 68. Every commandment that forbids a sin requires the opposite duty (Larger Catechism 99).",
        },
      ],
      [
        [67, "Has God a tender regard to the life of men?"],
        [68, "Are we to take care of our own lives?"],
        [69, "May we dispose of our own lives at our pleasure?"],
      ],
    ),
    write("Write a note on Matthew 5:24: someone you are angry with or have wronged, and what reconciliation would take.", p("Matt", 5, 24), "wsc-67"),
    keep("Learn Questions 67 to 69, and 1 John 3:15.", [67, 68, 69], p("1John", 3, 15)),
    pray("Pray in the prayer journal for the person you wrote about, and for a heart free of anger without cause.", "wsc-67"),
  ],
};
