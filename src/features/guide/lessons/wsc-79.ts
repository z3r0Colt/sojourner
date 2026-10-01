import type { LessonData } from "../course";
import { answer, before, classic, keep, look, p, pray, quiz, read, standards, teaching, write } from "./steps";

export const WSC_79: LessonData = {
  id: "wsc-79",
  title: "The tenth commandment",
  questions: [79, 80, 81],
  intro:
    "The last commandment goes where no court can follow: into the heart’s desires. Paul says it was this one that showed him his sin. Its opposite is not merely not wanting things; it is “full contentment with our own condition”, and gladness at our neighbour’s good.",
  workspace: { passage: p("Rom", 7, 7), study: ["crossrefs"], question: 80 },
  steps: [
    before("Are you content? Write honestly what you most wish were different in your life.", "I wish…"),
    read(
      "I had not known lust",
      "Read Romans 7:7–12. Highlight which commandment Paul says showed him his sin.",
      p("Rom", 7, 7, 12),
      p("Rom", 7, 7),
    ),
    look(
      "naboth",
      "A king who coveted",
      "Look up Naboth in the Factbook, then read 1 Kings 21:1–16. Where did Ahab’s crime begin?",
      { pane: "factbook", id: "Naboth@1Ki.21.1-2Ki" },
      { openLabel: "Naboth in the Factbook" },
    ),
    read(
      "I have learned",
      "Read Philippians 4:10–13 and highlight what Paul says he has learned, and how.",
      p("Phil", 4, 10, 13),
      p("Phil", 4, 11, 13),
      { id: "content", tip: null },
    ),
    answer(
      80,
      "Read Questions 79 to 81. The commandment requires “full contentment with our own condition, with a right and charitable frame of spirit toward our neighbour, and all that is his,” and forbids “all discontentment with our own estate, envying or grieving at the good of our neighbour, and all inordinate motions and affections to anything that is his.”",
    ),
    standards("Read the Larger Catechism Question 148, the sins forbidden in the tenth commandment.", "wlc", 148),
    teaching(80, "flavel", "Read John Flavel on Question 80."),
    classic("Read Watson’s sermon on the tenth commandment.", "The Ten Commandments", "Thou shalt not covet thy neighbour", 79, "whyte"),
    quiz(
      [
        {
          q: "What does the tenth commandment require, according to Question 80?",
          choices: ["That we never want anything", "Full contentment with our own condition, and a charitable spirit toward our neighbour", "That we give away all we have"],
          answer: 1,
          why: "Question 80. Hebrews 13:5: “be content with such things as ye have: for he hath said, I will never leave thee, nor forsake thee.”",
        },
      ],
      [
        [79, "Does the light of nature discover this?"],
        [80, "Ought we to be content in every condition?"],
        [81, "Is it a sin against this commandment to envy our neighbour’s welfare?"],
      ],
    ),
    write("Write a note on Hebrews 13:5 about the thing you wrote at the start: what God’s promise in that verse says to it.", p("Heb", 13, 5), "wsc-79"),
    keep("Learn Questions 79 to 81, and Hebrews 13:5.", [79, 80, 81], p("Heb", 13, 5)),
    pray("Thank God in the prayer journal for five things you have. Then pray for the good of someone you have envied.", "wsc-79"),
  ],
};
