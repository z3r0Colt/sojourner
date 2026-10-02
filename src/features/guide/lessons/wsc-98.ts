import type { LessonData } from "../course";
import { answer, before, classic, keep, p, pray, quiz, read, standards, teaching, write } from "./steps";

export const WSC_98: LessonData = {
  id: "wsc-98",
  title: "Prayer, and Our Father",
  questions: [98, 99, 100],
  intro:
    "The disciples asked, “Lord, teach us to pray,” and Christ gave them a pattern. The Catechism defines prayer, names the Lord’s Prayer as its special rule, and then goes through it phrase by phrase, beginning with the first two words: Our Father.",
  workspace: { passage: p("Matt", 6, 5), study: ["crossrefs"], question: 98 },
  steps: [
    before("What is prayer? And what is the hardest thing about it for you?", "Prayer is… The hardest thing is…"),
    read(
      "After this manner",
      "Read Matthew 6:5–15. Highlight what Jesus warns against, then the prayer he gives.",
      p("Matt", 6, 5, 15),
      p("Matt", 6, 9, 13),
    ),
    read(
      "The Spirit helpeth",
      "Read Romans 8:26–27, and highlight what the Spirit does when we do not know how to pray.",
      p("Rom", 8, 26, 27),
      p("Rom", 8, 26),
      { id: "spirit", tip: null },
    ),
    answer(
      98,
      "Read Questions 98 to 100. Prayer is “an offering up of our desires unto God, for things agreeable to his will, in the name of Christ, with confession of our sins, and thankful acknowledgement of his mercies.” The preface, “Our Father which art in heaven”, teaches us “to draw near to God with all holy reverence and confidence, as children to a father, able and ready to help us; and that we should pray with and for others.”",
    ),
    standards("Read the Larger Catechism Question 180: what is it to pray in the name of Christ?", "wlc", 180),
    teaching(100, "whyte", "Read Alexander Whyte on Question 100."),
    classic("Watson begins his sermons on the Lord’s Prayer with its preface.", "The Lord's Prayer", "Having gone over the chief grounds and fundamentals of religion", 100, "whyte"),
    quiz(
      [
        {
          q: "What two things does the preface “Our Father which art in heaven” teach us, according to Question 100?",
          choices: [
            "To come with holy reverence and confidence, as children to a father; and to pray with and for others",
            "To pray only in church, and only with others",
            "That God is far away, and must be persuaded",
          ],
          answer: 0,
          why: "Question 100. “Our” Father: we pray with and for others. “In heaven”: reverence; “Father”: confidence.",
        },
      ],
      [
        [98, "Are we to pray in secret?"],
        [99, "Is the Lord’s Prayer to be used as a directory for prayer?"],
        [100, "And by adoption?"],
      ],
    ),
    write("Write a note on Matthew 6:9: what changes in your prayers if you really believe God is your Father, able and ready to help.", p("Matt", 6, 9), "wsc-98"),
    keep("Learn Questions 98 to 100, and Matthew 6:9–13.", [98, 99, 100], p("Matt", 6, 9, 13)),
    pray("Write a prayer in the prayer journal with each part of Question 98: your desires, for things agreeable to his will, in Christ’s name, with confession, and with thanks.", "wsc-98"),
  ],
};
