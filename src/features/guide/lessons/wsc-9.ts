import type { LessonData } from "../course";
import { answer, before, classic, keep, look, p, prayQuietly, quiz, read, standards, teaching, write } from "./steps";

// New tool: Webster's 1828 dictionary.
export const WSC_9: LessonData = {
  id: "wsc-9",
  title: "Creation, and man in God’s image",
  questions: [9, 10],
  intro:
    "God carries out his decrees first in creation. The Catechism says he made all things “of nothing, by the word of his power”, and all very good; and then it stops at man, made in God’s own image. This lesson asks what that image is, and what was given with it.",
  workspace: { passage: p("Gen", 1, 1), study: ["crossrefs"], question: 10 },
  steps: [
    before("What makes a human being different from an animal?", "A human being is different because…"),
    read(
      "In the beginning",
      "Read Genesis 1. Notice how each day begins (“And God said”) and how each ends. Then read verses 26–31 again and highlight what is said only of man.",
      p("Gen", 1, 1, 31),
      p("Gen", 1, 26, 28),
      { openLabel: "Open Genesis 1" },
    ),
    read(
      "The image renewed",
      "The New Testament describes God’s image as it is restored in Christ. Read Colossians 3:9–10 and Ephesians 4:22–24 and highlight what the new man is renewed in.",
      p("Col", 3, 9, 10),
      p("Col", 3, 10),
      { id: "renewed", tip: null },
    ),
    look(
      "old-word",
      "An old word: dominion",
      "The Catechism says man was made “with dominion over the creatures.” See how Webster defined dominion in 1828, then read Genesis 1:28 again. Is dominion the same as ownership?",
      { pane: "webster", word: "dominion" },
      { tip: "Webster’s 1828 dictionary defines English as readers of the King James Bible knew it." },
    ),
    answer(
      9,
      "Read Questions 9 and 10. Creation is “God’s making all things of nothing, by the word of his power, in the space of six days, and all very good.” Man was made “after his own image, in knowledge, righteousness, and holiness, with dominion over the creatures.” Compare those three words with Colossians 3:10 and Ephesians 4:24.",
    ),
    standards(
      "Read the Confession 4.2. It adds that our first parents had the law of God written in their hearts, and power to fulfil it, “and yet under a possibility of transgressing”. Hold on to that: the next lessons depend on it.",
      "wcf",
      4,
      2,
      "The Confession",
    ),
    teaching(10, "whyte", "Read Alexander Whyte on Question 10, on what the image of God is, and what was lost and what remains."),
    classic(
      "Watson’s sermon on creation follows his short sermon on the decrees, in the same chapter. Read what he says of man’s creation.",
      "A Body of Divinity",
      "The next question is, WHAT",
      9,
      "whyte",
    ),
    quiz(
      [
        {
          q: "In what three things does Question 10 say God’s image in man consisted?",
          choices: ["Knowledge, righteousness, and holiness", "Reason, speech, and freedom", "Body, soul, and spirit"],
          answer: 0,
          why: "“After his own image, in knowledge, righteousness, and holiness” (Colossians 3:10; Ephesians 4:24).",
        },
      ],
      [
        [9, "Did he make all out of nothing?"],
        [9, "Did God make all well?"],
        [10, "Do all the children of men descend from Adam and Eve?"],
        [10, "Is God the Father of our spirits?"],
      ],
    ),
    write("Write a note on Genesis 1:27: what does it mean for how you treat other people that every one of them was made in God’s image?", p("Gen", 1, 27), "wsc-9"),
    keep("Learn Questions 9 and 10, and Genesis 1:27.", [9, 10], p("Gen", 1, 27)),
    prayQuietly("Pray Psalm 8: “What is man, that thou art mindful of him?” Thank God for making you, and for the world he made good."),
  ],
};
