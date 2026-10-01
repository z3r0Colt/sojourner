import type { LessonData } from "../course";
import { answer, before, classic, keep, look, p, prayQuietly, quiz, read, standards, teaching, write } from "./steps";

// New tool: word study.
export const WSC_7: LessonData = {
  id: "wsc-7",
  title: "The decrees of God",
  questions: [7, 8],
  intro:
    "Does anything happen by chance? Scripture says God “worketh all things after the counsel of his own will.” This lesson looks at that counsel: what the Catechism calls God’s decrees, and how he carries them out in creation and providence. The Confession says this doctrine is to be handled “with special prudence and care”, so go slowly.",
  workspace: { passage: p("Eph", 1, 3), study: ["crossrefs"], question: 7 },
  steps: [
    before("Does anything happen by chance? Write what you think, and why.", "I think…"),
    read(
      "The counsel of his will",
      "Read Ephesians 1:3–14. Paul is praising God, not arguing. Highlight every phrase about God’s purpose, will or counsel.",
      p("Eph", 1, 3, 14),
      p("Eph", 1, 9, 11),
    ),
    look(
      "word",
      "The word: boulē",
      "“Counsel” in Ephesians 1:11 is the Greek βουλή. Look at where else the New Testament uses it, especially Acts 2:23 and 4:28, where the apostles speak of the cross as done by “the determinate counsel and foreknowledge of God”.",
      { pane: "wordstudy", strongs: "G1012" },
      { tip: "Word study gathers every place a Greek or Hebrew word is used, with how the KJV translates it." },
    ),
    read(
      "Meant for good",
      "Read Genesis 50:15–21. Joseph’s brothers sold him into slavery. Highlight what Joseph says about their purpose and God’s.",
      p("Gen", 50, 15, 21),
      p("Gen", 50, 19, 20),
      { id: "joseph", tip: null },
    ),
    answer(
      7,
      "Read Questions 7 and 8. The decrees are God’s “eternal purpose, according to the counsel of his will, whereby, for his own glory, he hath foreordained whatsoever comes to pass.” Question 8 says how he carries them out: “in the works of creation and providence.” The next lessons take those two in turn.",
    ),
    standards(
      "Read the Confession 3.1. It says God ordains whatsoever comes to pass, and in the same sentence guards three things: God is not the author of sin, no violence is done to the will of the creature, and second causes are not taken away but established. Notice how Genesis 50:20 shows all three.",
      "wcf",
      3,
      1,
      "The Confession",
    ),
    teaching(7, "whyte", "Read Alexander Whyte on Question 7, on “counsel”, “for his own glory” and “whatsoever comes to pass”."),
    classic(
      "Watson preaches on the decrees at the start of his sermon on creation. Read until he turns to creation.",
      "A Body of Divinity",
      "WHAT ARE THE DECREES OF GOD",
      7,
      "whyte",
    ),
    quiz(
      [
        {
          q: "According to the Confession 3.1, does God’s decree make him the author of sin?",
          choices: ["Yes", "No"],
          answer: 1,
          why: "“Yet so as thereby neither is God the author of sin, nor is violence offered to the will of the creatures.”",
        },
      ],
      [
        [7, "Has he determined before what he will do?"],
        [7, "Does any thing come to pass by chance?"],
        [7, "Can any control his will?"],
        [8, "Shall all God’s decrees be executed?"],
      ],
    ),
    write(
      "Think of one hard thing in your life. Write a note on Genesis 50:20 about it: what others (or you) meant, and what God may mean by it.",
      p("Gen", 50, 20),
      "wsc-7",
    ),
    keep("Learn Questions 7 and 8, and Ephesians 1:11.", [7, 8], p("Eph", 1, 11)),
    prayQuietly("Pray Romans 11:33: “O the depth of the riches both of the wisdom and knowledge of God! how unsearchable are his judgments, and his ways past finding out!” Then give him the thing you wrote about."),
  ],
};
