import type { LessonData } from "../course";
import { answer, before, classic, keep, look, p, pray, quiz, read, standards, teaching, write } from "./steps";

// New tool: search.
export const WSC_23: LessonData = {
  id: "wsc-23",
  title: "Prophet, priest and king",
  questions: [23, 24, 25, 26],
  intro:
    "In Israel three kinds of men were anointed: prophets, priests and kings. Christ, the Anointed One, is all three. We are ignorant and need a prophet; guilty and need a priest; rebellious and helpless and need a king. These four answers show what he does in each office.",
  workspace: { passage: p("Heb", 7, 23), study: ["crossrefs"], question: 23 },
  steps: [
    before("What does Jesus do for his people now, today? Write what you think.", "Jesus now…"),
    read(
      "The priest who lives for ever",
      "Read Hebrews 7:23–28. Highlight what makes Christ a better priest than the priests of Israel.",
      p("Heb", 7, 23, 28),
      p("Heb", 7, 24, 27),
    ),
    look(
      "search",
      "Trace a word",
      "Search the Bible for “intercession”. It is a rare word. Who makes intercession, and for whom?",
      { pane: "search", query: "intercession" },
      { tip: "Search finds words and phrases across the Bible and the rest of the library; put a phrase in quotation marks to find it exactly." },
    ),
    answer(
      23,
      "Read Questions 23 to 26. As a prophet Christ reveals “by his Word and Spirit the will of God for our salvation.” As a priest he offered himself “a sacrifice to satisfy divine justice, and reconcile us to God,” and makes “continual intercession for us.” As a king he subdues us to himself, rules and defends us, and restrains and conquers “all his and our enemies.”",
    ),
    standards("The Larger Catechism opens each office further. Read Question 44, on his priesthood, and Question 55, on his intercession.", "wlc", 44),
    teaching(25, "flavel", "Read John Flavel on Question 25. He wrote a whole book on Christ’s offices, The Fountain of Life."),
    classic("Watson preaches on each office in turn. Read his sermon on Christ’s priestly office.", "A Body of Divinity", "HOW DOES CHRIST EXECUTE THE OFFICE OF A PRIEST", 25, "whyte"),
    quiz(
      [
        {
          q: "What two things does Question 25 say Christ does as our priest?",
          choices: ["Teaches us and rules us", "Offered himself a sacrifice once, and makes continual intercession for us", "Forgives some sins and leaves others"],
          answer: 1,
          why: "“In his once offering up of himself a sacrifice to satisfy divine justice, and reconcile us to God; and in making continual intercession for us.”",
        },
      ],
      [
        [24, "Does God speak to us by him?"],
        [25, "Did he do this by the sacrifice of himself?"],
        [25, "Would not the legal sacrifices serve?"],
        [26, "Is his kingdom a spiritual kingdom?"],
        [26, "Does Christ, as a King, subdue his people to himself?"],
      ],
    ),
    write("Write a note on Hebrews 7:25: which of Christ’s three offices you most need today, and why.", p("Heb", 7, 25), "wsc-23"),
    keep("Learn Questions 23 to 26, and Hebrews 7:25.", [23, 24, 25, 26], p("Heb", 7, 25)),
    pray("Pray to Christ in each office in the prayer journal: ask him to teach you, thank him for his sacrifice and intercession, and submit to him as your king.", "wsc-23"),
  ],
};
