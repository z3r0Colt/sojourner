import type { LessonData } from "../course";
import { answer, before, classic, keep, look, p, pray, quiz, read, standards, teaching, write } from "./steps";

export const WSC_91: LessonData = {
  id: "wsc-91",
  title: "The sacraments",
  questions: [91, 92, 93],
  intro:
    "God has always given his people signs with his promises: the rainbow to Noah, circumcision to Abraham, the passover to Israel. Christ gave his church two: baptism and the Lord’s Supper. This lesson asks what a sacrament is, and where its power comes from.",
  workspace: { passage: p("Rom", 4, 9), study: ["crossrefs", "confession-for-passage"], question: 92 },
  steps: [
    before("What is a sacrament? What does it do?", "A sacrament is…"),
    read(
      "A sign and a seal",
      "Read Romans 4:9–12. Highlight what Paul calls circumcision in verse 11.",
      p("Rom", 4, 9, 12),
      p("Rom", 4, 11),
    ),
    look(
      "confessions",
      "The confessions agree",
      "See which confessions cite Romans 4:11, and read what the Heidelberg Catechism and the Belgic Confession say a sacrament is.",
      { pane: "confession-for-passage", passage: p("Rom", 4, 11) },
    ),
    answer(
      92,
      "Read Questions 91 to 93. A sacrament is “an holy ordinance instituted by Christ; wherein, by sensible signs, Christ, and the benefits of the new covenant, are represented, sealed, and applied to believers.” They are effectual “not from any virtue in them, or in him that doth administer them; but only by the blessing of Christ, and the working of his Spirit in them that by faith receive them.”",
    ),
    standards("Read the Confession 27.2: in every sacrament there is a spiritual relation between the sign and the thing signified, so that the names and effects of the one are sometimes given to the other.", "wcf", 27, 2, "The Confession"),
    teaching(92, "flavel", "Read John Flavel on Question 92."),
    classic("Watson’s sermon on baptism begins with the sacraments in general: “They are visible signs of invisible grace.”", "The Ten Commandments", "What are the sacraments in general", 92, "whyte"),
    quiz(
      [
        {
          q: "Where does the power of a sacrament come from, according to Question 91?",
          choices: ["From the water, bread and wine themselves", "From the minister who administers it", "From the blessing of Christ, and the working of his Spirit in those who receive them by faith"],
          answer: 2,
          why: "“Not from any virtue in them, or in him that doth administer them; but only by the blessing of Christ, and the working of his Spirit.”",
        },
      ],
      [
        [91, "Do the sacraments certainly save all that partake of them?"],
        [92, "May men institute sacraments?"],
        [93, "Was the passover a sacrament?"],
      ],
    ),
    write("Write a note on Romans 4:11: what a sign and seal of God’s promise means for a believer’s assurance.", p("Rom", 4, 11), "wsc-91"),
    keep("Learn Questions 91 to 93, and Romans 4:11.", [91, 92, 93], p("Rom", 4, 11)),
    pray("Thank God in the prayer journal that he gives us signs we can see and touch, to confirm his promises to us.", "wsc-91"),
  ],
};
