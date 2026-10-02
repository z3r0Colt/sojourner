import type { LessonData } from "../course";
import { answer, before, classic, keep, look, p, pray, quiz, read, standards, teaching, write } from "./steps";

export const WSC_94: LessonData = {
  id: "wsc-94",
  title: "Baptism",
  questions: [94, 95],
  intro:
    "Baptism signifies and seals our being joined to Christ and sharing in the covenant of grace, and our engagement to be the Lord’s. The Catechism also says who is to be baptized: those outside the church when they profess faith, and the infants of church members, as the children of Abraham received the covenant sign.",
  workspace: { passage: p("Matt", 28, 18), study: ["crossrefs"], question: 94 },
  steps: [
    before("What did your baptism mean, or what would it mean if you were baptized?", "Baptism means…"),
    read(
      "Into the name",
      "Read Matthew 28:18–20, and highlight the command Christ gave.",
      p("Matt", 28, 18, 20),
      p("Matt", 28, 19),
    ),
    read(
      "Buried with him",
      "Read Romans 6:1–11. Highlight what Paul says happened to us in baptism, and what follows for how we live.",
      p("Rom", 6, 1, 11),
      p("Rom", 6, 3, 4),
      { id: "buried", tip: null },
    ),
    look(
      "promise",
      "To you and to your children",
      "Read Acts 2:38–41 in the Bible, and follow the cross references from verse 39 back to Genesis 17:7, God’s covenant with Abraham “and thy seed after thee”.",
      { pane: "crossrefs", passage: p("Acts", 2, 39) },
    ),
    answer(
      94,
      "Read Questions 94 and 95. Baptism, “the washing with water in the name of the Father, and of the Son, and of the Holy Ghost, doth signify and seal our ingrafting into Christ, and partaking of the benefits of the covenant of grace, and our engagement to be the Lord’s.” It is for those who profess faith, and “the infants of such as are members of the visible church are to be baptized.”",
    ),
    standards("The Larger Catechism asks how we are to improve our baptism, all our lives long. Read Question 167.", "wlc", 167),
    teaching(95, "fisher", "Read Fisher’s Catechism on Question 95."),
    classic("Read Watson’s sermon on baptism.", "The Ten Commandments", "baptising them in the name of the Father", 94, "whyte"),
    quiz(
      [
        {
          q: "What three things does baptism signify and seal, according to Question 94?",
          choices: [
            "Our ingrafting into Christ, our partaking of the covenant of grace, and our engagement to be the Lord’s",
            "Our joining a church, our good works, and our hope of heaven",
            "Our new birth, our perfection, and our assurance",
          ],
          answer: 0,
          why: "Question 94.",
        },
      ],
      [
        [94, "But is the outward sign alone sufficient?"],
        [94, "Must baptism be in the name of Father, Son, and Holy Ghost?"],
        [95, "Are the children of believing parents to be baptized in their infancy?"],
      ],
    ),
    write("Write a note on Romans 6:4: one way to “walk in newness of life” because of your baptism.", p("Rom", 6, 4), "wsc-94"),
    keep("Learn Questions 94 and 95, and Romans 6:4.", [94, 95], p("Rom", 6, 4)),
    pray("Thank God in the prayer journal for your baptism, and pray for the children of your church.", "wsc-94"),
  ],
};
