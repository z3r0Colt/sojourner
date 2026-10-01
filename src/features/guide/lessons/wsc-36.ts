import type { LessonData } from "../course";
import { answer, before, classic, keep, look, p, pray, quiz, read, standards, teaching, write } from "./steps";

// New tool: Cited in your library.
export const WSC_36: LessonData = {
  id: "wsc-36",
  title: "The benefits that flow from them",
  questions: [36],
  intro:
    "Justification, adoption and sanctification bring others with them in this life: assurance of God’s love, peace of conscience, joy in the Holy Ghost, increase of grace, and perseverance to the end. Romans 5 begins with the first of them.",
  workspace: { passage: p("Rom", 5, 1), study: ["crossrefs", "citations"], question: 36 },
  steps: [
    before("Can a Christian know for sure that God loves them and that they will be saved at the last?", "I think a Christian can… because…"),
    read("Peace with God", "Read Romans 5:1–5. Highlight each benefit Paul says flows from being justified by faith.", p("Rom", 5, 1, 5), p("Rom", 5, 1, 5)),
    look(
      "cited",
      "What the old writers said",
      "See where the books in your library quote Romans 5:1. Open one of the places and read the page around it.",
      { pane: "citations", passage: p("Rom", 5, 1) },
      { tip: "Cited in your library finds every place a book in your library quotes the verse you are reading." },
    ),
    answer(
      36,
      "Read Question 36. Five benefits: “assurance of God’s love, peace of conscience, joy in the Holy Ghost, increase of grace, and perseverance therein to the end.” They flow from justification, adoption and sanctification; they are not the ground of them.",
    ),
    standards(
      "Read the Confession 18.3. Assurance “doth not so belong to the essence of faith, but that a true believer may wait long, and conflict with many difficulties, before he be partaker of it”. A believer can be truly saved and not yet sure of it, and may seek assurance in the ordinary means.",
      "wcf",
      18,
      3,
      "The Confession",
    ),
    teaching(36, "flavel", "Read John Flavel on Question 36."),
    classic("Watson takes the five benefits one at a time, in five sermons. Read his sermon on assurance.", "A Body of Divinity", "WHAT ARE THE BENEFITS WHICH FLOW FROM SANCTIFICATION", 36, "whyte"),
    quiz(
      [
        {
          q: "Does every true believer always have full assurance of salvation?",
          choices: ["Yes, or they are not a true believer", "No: a true believer may wait long, and conflict with many difficulties, before having it"],
          answer: 1,
          why: "The Confession 18.3; and 18.4: assurance may be “shaken, diminished, and intermitted”, yet believers are never utterly destitute of the seed of God.",
        },
      ],
      [
        [36, "Are they that are justified happy in this life?"],
        [36, "Is the Spirit the author of that assurance?"],
        [36, "Do all believers attain this assurance?"],
        [36, "But should they labour after it?"],
      ],
    ),
    write("Write a note on Romans 5:1: which of the five benefits you know most, and which you most lack.", p("Rom", 5, 1), "wsc-36"),
    keep("Learn Question 36, and Romans 5:1.", [36], p("Rom", 5, 1)),
    pray("Ask God in the prayer journal for the benefit you most lack, and thank him for the ones you know.", "wsc-36"),
  ],
};
