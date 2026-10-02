import type { LessonData } from "../course";
import { answer, before, classic, keep, look, p, pray, quiz, read, sing, standards, teaching, write } from "./steps";

export const WSC_57: LessonData = {
  id: "wsc-57",
  title: "The fourth commandment",
  questions: [57, 58, 59, 60, 61, 62],
  intro:
    "God made the world in six days and rested the seventh; he blessed that day and made it holy. Christ rose on the first day of the week, and from then on his people met on that day, which John calls the Lord’s day. The Catechism calls it the Christian sabbath, a whole day given to God, and a delight, not a burden.",
  workspace: { passage: p("Exod", 20, 8), study: ["crossrefs"], question: 60 },
  steps: [
    before("What is Sunday for? Write how you usually spend it, and what you think it is meant to be.", "Sunday is for…"),
    read(
      "Remember the sabbath day",
      "Read Exodus 20:8–11 and Genesis 2:1–3. Highlight the reason the commandment gives.",
      p("Exod", 20, 8, 11),
      p("Exod", 20, 11),
    ),
    read(
      "Call the sabbath a delight",
      "Read Isaiah 58:13–14. Highlight what God promises those who keep the day.",
      p("Isa", 58, 13, 14),
      p("Isa", 58, 13, 14),
      { id: "delight", tip: null },
    ),
    look(
      "first-day",
      "The first day of the week",
      "Search the New Testament for “first day of the week”. What happened on that day, and what did the disciples do on it afterwards? Look at Acts 20:7 and 1 Corinthians 16:2.",
      { pane: "search", query: "\"first day of the week\"" },
    ),
    answer(
      60,
      "Read Questions 57 to 62. From the creation to Christ’s resurrection the seventh day was the sabbath, “and the first day of the week ever since, to continue to the end of the world, which is the Christian sabbath.” It is kept “by a holy resting all that day” and “spending the whole time in the public and private exercises of God’s worship, except so much as is to be taken up in the works of necessity and mercy.”",
    ),
    standards("Read the Confession 21.7 and 21.8 on the Lord’s day, and notice what 21.8 says about preparing our hearts beforehand.", "wcf", 21, 7, "The Confession"),
    teaching(60, "whyte", "Read Alexander Whyte on Question 60."),
    classic("Read Watson’s sermon on the fourth commandment.", "The Ten Commandments", "Remember the Sabbath-day to keep it holy", 57, "flavel"),
    quiz(
      [
        {
          q: "What works may be done on the Lord’s day, according to Question 60?",
          choices: ["None at all", "Works of necessity and mercy", "Any work that is lawful on other days"],
          answer: 1,
          why: "“Except so much as is to be taken up in the works of necessity and mercy.” Christ healed on the sabbath (Mark 3:1–5).",
        },
      ],
      [
        [57, "Must our worship be confined to that time?"],
        [58, "Did he appoint it for us?"],
        [60, "Must we spend time on that day in the public exercises of God’s worship?"],
        [62, "Has our Lord Jesus a property in it?"],
      ],
    ),
    write("Write a note on Isaiah 58:13: one change that would make the Lord’s day more of a delight to you, and more given to God.", p("Isa", 58, 13), "wsc-57"),
    keep("Learn Questions 57 to 62, and Exodus 20:8. Question 57 is the commandment itself, word for word.", [57, 58, 59, 60, 61, 62], p("Exod", 20, 8)),
    sing(92, "Psalm 92’s title calls it a song for the sabbath day. Sing it."),
    pray("Pray in the prayer journal for next Lord’s day: for your minister, for your heart, and for those who will hear the gospel.", "wsc-57"),
  ],
};
