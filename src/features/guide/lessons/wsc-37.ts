import type { LessonData } from "../course";
import { answer, before, classic, keep, look, p, pray, quiz, read, sing, standards, teaching, write } from "./steps";

export const WSC_37: LessonData = {
  id: "wsc-37",
  title: "Death and the resurrection",
  questions: [37, 38],
  intro:
    "The last two answers of the first part of the Catechism follow the believer through death and the resurrection to the last day. They are some of the most comforting words in it, and many have learned them by heart for their own deathbeds.",
  workspace: { passage: p("1Cor", 15, 35), study: ["crossrefs"], question: 38 },
  steps: [
    before("What happens to a Christian when they die? Write what you believe.", "When a Christian dies…"),
    read(
      "To depart, and be with Christ",
      "Read Philippians 1:19–26. Highlight what Paul says death would be for him.",
      p("Phil", 1, 19, 26),
      p("Phil", 1, 21, 23),
    ),
    read(
      "Raised in glory",
      "Read 1 Corinthians 15:42–58. Highlight each contrast between the body sown and the body raised.",
      p("1Cor", 15, 42, 58),
      p("1Cor", 15, 42, 44),
      { id: "raised", tip: null },
    ),
    look(
      "resurrection",
      "The resurrection",
      "Read the encyclopedia’s article on the resurrection, the part on the resurrection of believers.",
      { pane: "encyclopedia", slug: "resurrection" },
    ),
    answer(
      37,
      "Read Questions 37 and 38. At death believers’ souls are “made perfect in holiness, and do immediately pass into glory; and their bodies, being still united to Christ, do rest in their graves till the resurrection.” At the resurrection they shall be “openly acknowledged and acquitted in the day of judgment, and made perfectly blessed in the full enjoying of God to all eternity.” Compare that last phrase with Question 1.",
    ),
    standards("Read the Confession 32.1, on the state of the soul after death, and 33.2, on the last judgment.", "wcf", 32, 1, "The Confession"),
    teaching(37, "whyte", "Read Alexander Whyte on Question 37, especially on “still united to Christ”."),
    classic("Watson preaches on the death of the righteous from Philippians 1:21, “to die is gain.”", "A Body of Divinity", "Paul was a great admirer of Christ", 37, "whyte"),
    quiz(
      [
        {
          q: "While a believer’s body rests in the grave, is it still united to Christ?",
          choices: ["Yes", "No, only the soul is"],
          answer: 0,
          why: "“Their bodies, being still united to Christ, do rest in their graves till the resurrection” (Question 37).",
        },
      ],
      [
        [37, "Is death loss to a good Christian?"],
        [37, "Does God take special care of the death of his people?"],
        [38, "Shall the dead bodies of believers be raised?"],
        [38, "Shall the believer’s body be raised up in glory?"],
      ],
    ),
    write("Write a note on Philippians 1:21: how Questions 37 and 38 change the way you think about your own death, or the death of someone you love.", p("Phil", 1, 21), "wsc-37"),
    keep("Learn Questions 37 and 38, and Philippians 1:21.", [37, 38], p("Phil", 1, 21)),
    sing(16, "Sing Psalm 16, which Peter preached at Pentecost as the psalm of Christ’s resurrection: “thou wilt not leave my soul in hell.”"),
    pray("Thank God in the prayer journal for the hope of the resurrection, and pray for anyone you know who is dying or grieving.", "wsc-37"),
  ],
};
