import type { LessonData } from "../course";
import { answer, before, classic, keep, p, prayQuietly, quiz, read, sing, standards, teaching, write } from "./steps";

// New tool: the Psalter.
export const WSC_13: LessonData = {
  id: "wsc-13",
  title: "The fall, and what sin is",
  questions: [13, 14, 15],
  intro:
    "Adam and Eve were made upright and left to the freedom of their own will. They fell, by eating what God had forbidden. Between the story of the fall (Questions 13 and 15) the Catechism sets one of its most searching answers: what sin is.",
  workspace: { passage: p("Gen", 3, 1), study: ["crossrefs"], question: 14 },
  steps: [
    before("What is sin? Write your own definition before you read.", "Sin is…"),
    read(
      "The temptation",
      "Read Genesis 3:1–13. Highlight each thing the serpent says, and notice how each twists what God had said in 2:16–17.",
      p("Gen", 3, 1, 13),
      p("Gen", 3, 1, 5),
    ),
    answer(
      14,
      "Read Questions 13 to 15. Question 14 is the definition: “Sin is any want of conformity unto, or transgression of, the law of God.” Two kinds: falling short of what the law requires (want of conformity), and crossing what it forbids (transgression). The Catechism draws it from 1 John 3:4: “sin is the transgression of the law.”",
    ),
    standards(
      "Read the Confession 6.1: our first parents, “being seduced by the subtlety and temptation of Satan, sinned in eating the forbidden fruit.” And God was pleased to permit it, “having purposed to order it to his own glory.”",
      "wcf",
      6,
      1,
      "The Confession",
    ),
    teaching(14, "whyte", "Read Alexander Whyte on Question 14: on “want of conformity” as well as transgression, and on the law as the measure of sin."),
    classic("Watson’s sermon on Adam’s sin asks how so small an act could be so great a sin: “Was it such a great matter to pluck an apple? It was against an infinite God.”", "A Body of Divinity", "WHAT WAS THE SIN WHEREBY OUR FIRST PARENTS FELL", 15, "flavel"),
    quiz(
      [
        {
          q: "Question 14 names two kinds of sin. What are they?",
          choices: ["Sins of the body and sins of the mind", "Want of conformity unto the law, and transgression of it", "Great sins and small sins"],
          answer: 1,
          why: "“Sin is any want of conformity unto, or transgression of, the law of God.” Not doing what God requires is sin, as well as doing what he forbids.",
        },
      ],
      [
        [13, "Did God draw Adam to sin?"],
        [14, "Is there such thing as sin in thought?"],
        [14, "Is sin the breach of a law?"],
        [15, "Did the serpent tempt her to it?"],
        [15, "Did the tempter teach them to question the command?"],
      ],
    ),
    write("Write a note on 1 John 3:4: one “want of conformity” in your own life, something God requires that you leave undone.", p("1John", 3, 4), "wsc-13"),
    keep("Learn Questions 13, 14 and 15, and 1 John 3:4.", [13, 14, 15], p("1John", 3, 4)),
    sing(
      51,
      "Psalm 51 is David’s prayer after his sin with Bathsheba, and the church has sung it in repentance ever since. Sing it, or read it aloud.",
      "The Psalter sets each psalm in metre to a tune you can play and sing along with.",
    ),
    prayQuietly("Pray Psalm 51:10: “Create in me a clean heart, O God; and renew a right spirit within me.”"),
  ],
};
