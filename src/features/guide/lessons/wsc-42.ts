import type { LessonData } from "../course";
import { answer, before, classic, keep, look, p, pray, quiz, read, standards, teaching, write } from "./steps";

export const WSC_42: LessonData = {
  id: "wsc-42",
  title: "The sum of the law, and its preface",
  questions: [42, 43, 44],
  intro:
    "When a lawyer asked Jesus which was the great commandment, he summed up all ten in two: love God, and love your neighbour. And before God gave the ten at Sinai, he told Israel who he was and what he had done for them. Grace comes before law; love is the heart of it.",
  workspace: { passage: p("Exod", 20, 1), study: ["crossrefs"], question: 44 },
  steps: [
    before("Why did God remind Israel that he had brought them out of Egypt before he gave them the commandments?", "I think God said this first because…"),
    read("I am the LORD thy God", "Read Exodus 20:1–17. Highlight the preface, verse 2, and notice that it comes before any commandment.", p("Exod", 20, 1, 17), p("Exod", 20, 2)),
    read(
      "The great commandment",
      "Read Matthew 22:34–40. Highlight the two commandments Jesus names, and what he says hangs on them.",
      p("Matt", 22, 34, 40),
      p("Matt", 22, 37, 40),
      { id: "sum", tip: null },
    ),
    look(
      "shema",
      "Where Jesus found it",
      "Jesus was quoting the Law. Follow the cross references from Matthew 22:37 to Deuteronomy 6:5, and from 22:39 to Leviticus 19:18.",
      { pane: "crossrefs", passage: p("Matt", 22, 37) },
    ),
    answer(
      44,
      "Read Questions 42 to 44. The sum: “To love the Lord our God with all our heart, with all our soul, with all our strength, and with all our mind; and our neighbour as ourselves.” The preface teaches “That because God is the Lord, and our God, and Redeemer, therefore we are bound to keep all his commandments.” Three reasons in one sentence: who he is, whose he is, and what he has done.",
    ),
    standards("The Larger Catechism gives eight rules for reading the commandments rightly. Read Question 99, and notice rule 4: where a duty is commanded, the contrary sin is forbidden, and the other way round.", "wlc", 99),
    teaching(44, "whyte", "Read Alexander Whyte on Question 44."),
    classic("Watson preaches on the preface from Exodus 20:1–2.", "The Ten Commandments", "And God spake all these words", 43, "flavel"),
    quiz(
      [
        {
          q: "What three reasons does the preface give for keeping the commandments?",
          choices: ["God is the Lord, our God, and Redeemer", "God is powerful, angry, and watching", "The law is old, wise, and useful"],
          answer: 0,
          why: "“Because God is the Lord, and our God, and Redeemer, therefore we are bound to keep all his commandments.”",
        },
      ],
      [
        [42, "Is all the law summed up in a word?"],
        [43, "Did God himself speak the ten commandments?"],
        [44, "Is he our Redeemer?"],
      ],
    ),
    write("Write a note on Exodus 20:2: what God has brought you out of, and how that changes the way you hear the commandments.", p("Exod", 20, 2), "wsc-42"),
    keep("Learn Questions 42 to 44, and Matthew 22:37–39.", [42, 43, 44], p("Matt", 22, 37, 39)),
    pray("Ask God in the prayer journal for a love for him with all your heart, soul, strength and mind, and a love for your neighbour as yourself. Name the neighbour you find hardest to love.", "wsc-42"),
  ],
};
