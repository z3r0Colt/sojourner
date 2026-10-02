import type { LessonData } from "../course";
import { answer, before, classic, keep, p, pray, quiz, read, standards, teaching, write } from "./steps";

export const WSC_101: LessonData = {
  id: "wsc-101",
  title: "Thy name, thy kingdom, thy will",
  questions: [101, 102, 103],
  intro:
    "The Lord’s Prayer begins with God, not with us: his name, his kingdom, his will. Only then does it turn to our bread, our debts and our temptations. These three petitions teach us what to want most.",
  workspace: { passage: p("Matt", 6, 9), study: ["crossrefs"], question: 102 },
  steps: [
    before("If you could ask God for only one thing, what would it be?", "I would ask…"),
    read(
      "Not my will",
      "Read Matthew 26:36–46. Highlight how Christ himself prayed the third petition in Gethsemane.",
      p("Matt", 26, 36, 46),
      p("Matt", 26, 39, 42),
    ),
    read(
      "Seek ye first",
      "Read Matthew 6:25–34 and highlight what Jesus tells us to seek first.",
      p("Matt", 6, 25, 34),
      p("Matt", 6, 33),
      { id: "first", tip: null },
    ),
    answer(
      102,
      "Read Questions 101 to 103. In the second petition, “we pray, that Satan’s kingdom may be destroyed; and that the kingdom of grace may be advanced, ourselves and others brought into it, and kept in it; and that the kingdom of glory may be hastened.” Three kingdoms in one line: Satan’s, grace and glory.",
    ),
    standards("Read the Larger Catechism Question 191, on the second petition. It turns into a prayer for missions, for the church and its ministers, and for Christ’s return.", "wlc", 191),
    teaching(102, "henry", "Matthew Henry’s Scripture Catechism opens Question 102 with plain questions. Read them, and answer each to yourself."),
    classic("Watson preaches on each petition. Read his sermon on the second, “Thy kingdom come”.", "The Lord's Prayer", "A soul truly devoted to God, joins heartily in this petition", 102, "whyte"),
    quiz(
      [
        {
          q: "What three kingdoms does Question 102 name?",
          choices: ["Israel, the church, and heaven", "Satan’s kingdom, the kingdom of grace, and the kingdom of glory", "The world, the flesh, and the devil"],
          answer: 1,
          why: "Satan’s kingdom destroyed; the kingdom of grace advanced; the kingdom of glory hastened.",
        },
      ],
      [
        [101, "Ought we to desire the glory of God in the first place?"],
        [102, "Has Satan a kingdom in opposition to God’s kingdom?"],
        [103, "When we know God’s will, are we able of ourselves to do it?"],
      ],
    ),
    write("Write a note on Matthew 26:39: something in your life where you need to pray, “not as I will, but as thou wilt.”", p("Matt", 26, 39), "wsc-101"),
    keep("Learn Questions 101 to 103, and Matthew 6:33.", [101, 102, 103], p("Matt", 6, 33)),
    pray("Pray the first three petitions in the prayer journal, in your own words, for yourself, your church, and the world.", "wsc-101"),
  ],
};
