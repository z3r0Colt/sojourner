import type { LessonData } from "../course";
import { answer, before, classic, keep, look, p, pray, quiz, read, standards, teaching, write } from "./steps";

// New tool: the Atlas.
export const WSC_29: LessonData = {
  id: "wsc-29",
  title: "Effectual calling",
  questions: [29, 30, 31],
  intro:
    "Christ purchased redemption; how does it become ours? The Holy Spirit applies it, by working faith in us and so uniting us to Christ, in what the Catechism calls effectual calling. Saul of Tarsus on the road to Damascus is the most vivid picture of it in Scripture.",
  workspace: { passage: p("Acts", 9, 1), study: ["crossrefs"], question: 31 },
  steps: [
    before("How does a person become a Christian? Write what you think happens.", "A person becomes a Christian when…"),
    read(
      "On the road",
      "Read Acts 9:1–20. Highlight what Saul was doing when Christ called him, and what he was doing three days later.",
      p("Acts", 9, 1, 20),
      p("Acts", 9, 3, 6),
    ),
    look(
      "damascus",
      "Where it happened",
      "Find Damascus in the Atlas. How far was Saul from Jerusalem, and how long would the journey have taken?",
      { pane: "atlas", slug: "damascus" },
      { tip: "The Atlas shows the places of Scripture on a map, with the verses that name each one." },
    ),
    read(
      "No man can come",
      "Read John 6:37–45. Highlight what Jesus says no one can do, and what the Father does.",
      p("John", 6, 37, 45),
      p("John", 6, 44, 45),
      { id: "drawn", tip: null },
    ),
    answer(
      31,
      "Read Questions 29 to 31. Effectual calling is “the work of God’s Spirit, whereby, convincing us of our sin and misery, enlightening our minds in the knowledge of Christ, and renewing our wills, he doth persuade and enable us to embrace Jesus Christ, freely offered to us in the gospel.” Four things the Spirit does: convinces, enlightens, renews, and persuades and enables.",
    ),
    standards(
      "Read the Confession 10.1. God calls “by his Word and Spirit”, drawing us to Jesus Christ, “yet so as they come most freely, being made willing by his grace.”",
      "wcf",
      10,
      1,
      "The Confession",
    ),
    teaching(31, "whyte", "Read Alexander Whyte on Question 31."),
    classic("Watson preaches on effectual calling from Romans 8:30, “Them he also called.”", "A Body of Divinity", "WHAT IS EFFECTUAL CALLING", 31, "flavel"),
    quiz(
      [
        {
          q: "In effectual calling, does the Spirit force us to come to Christ against our will?",
          choices: ["Yes", "No: he renews our wills, so that we come freely"],
          answer: 1,
          why: "“Renewing our wills, he doth persuade and enable us to embrace Jesus Christ” (Question 31); “they come most freely, being made willing by his grace” (Confession 10.1).",
        },
      ],
      [
        [29, "Is redemption purchased by Christ?"],
        [30, "Does the Spirit work faith in us?"],
        [31, "Can ministers make that call effectual?"],
        [31, "Is it the Spirit’s work to convince?"],
      ],
    ),
    write("Write a note on John 6:37 about how God drew you, or how you hope he will.", p("John", 6, 37), "wsc-29"),
    keep("Learn Questions 29, 30 and 31, and John 6:37.", [29, 30, 31], p("John", 6, 37)),
    pray("Pray for someone you know who is not yet a Christian: that the Spirit would convince, enlighten and renew them.", "wsc-29"),
  ],
};
