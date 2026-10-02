import type { LessonData } from "../course";
import { answer, before, classic, keep, look, p, pray, quiz, read, standards, teaching, write } from "./steps";

// New tool: the Timeline.
export const WSC_20: LessonData = {
  id: "wsc-20",
  title: "The covenant of grace",
  questions: [20],
  intro:
    "“Did God leave all mankind to perish in the estate of sin and misery?” The answer is the turning point of the Catechism. Out of his mere good pleasure God made a covenant of grace, promised first in the garden, made with Abraham, and fulfilled in Christ.",
  workspace: { passage: p("Gen", 3, 15), study: ["crossrefs"], question: 20 },
  steps: [
    before("If God is just, how can he save anyone who has sinned? Write what you think.", "God can save sinners because…"),
    read("The first promise", "Read Genesis 3:14–15, God’s words to the serpent. Highlight the promise hidden in the curse.", p("Gen", 3, 14, 15), p("Gen", 3, 15)),
    look(
      "abraham",
      "The covenant with Abraham",
      "Find the covenant with Abraham on the Timeline, and see where it falls between the fall and Christ. Then read Genesis 15:1–6 and Galatians 3:6–9, where Paul says the scripture “preached before the gospel unto Abraham”.",
      { pane: "timeline", eventId: 71 },
      { tip: "The Timeline sets the events of Scripture, and of church history, in order; click an event for its passages.", openLabel: "Open the Timeline" },
    ),
    read(
      "Counted for righteousness",
      "Read Genesis 15:1–6 and highlight verse 6.",
      p("Gen", 15, 1, 6),
      p("Gen", 15, 6),
      { id: "believed", tip: null },
    ),
    answer(
      20,
      "Read Question 20. God, “out of his mere good pleasure, from all eternity, elected some to everlasting life”, and entered into a covenant of grace “to deliver them out of the estate of sin and misery, and to bring them into an estate of salvation by a Redeemer.” Notice where it begins: not in anything in us, but in his mere good pleasure.",
    ),
    standards(
      "Read the Confession 7.3. In the covenant of grace God “freely offered unto sinners life and salvation by Jesus Christ, requiring of them faith in him that they may be saved.” Then 7.5 and 7.6: one covenant, administered by promises and sacrifices before Christ, and by the word and sacraments since.",
      "wcf",
      7,
      3,
      "The Confession",
    ),
    teaching(20, "whyte", "Read Alexander Whyte on Question 20."),
    classic("Read Watson’s sermon on the covenant of grace.", "A Body of Divinity", "DID GOD LEAVE ALL MANKIND TO PERISH", 20, "flavel"),
    quiz(
      [
        {
          q: "According to Question 20, why did God elect some to everlasting life?",
          choices: ["Because he foresaw that they would believe", "Out of his mere good pleasure", "Because they were better than others"],
          answer: 1,
          why: "“Out of his mere good pleasure, from all eternity.” Ephesians 1:5: “according to the good pleasure of his will.”",
        },
      ],
      [
        [20, "But did he leave them to perish?"],
        [20, "Could man help himself out of his state of sin and misery?"],
        [20, "Could any creature help us?"],
      ],
    ),
    write("Write a note on Genesis 15:6: how Abraham was saved, and how that is the same way you are.", p("Gen", 15, 6), "wsc-20"),
    keep("Learn Question 20, and Genesis 3:15.", [20], p("Gen", 3, 15)),
    pray("Thank God in the prayer journal that he did not leave you to perish, and that his covenant rests on his good pleasure, not on you.", "wsc-20"),
  ],
};
