import type { LessonData } from "../course";
import { answer, before, classic, keep, p, pray, quiz, read, sing, standards, teaching, write } from "./steps";

export const WSC_82: LessonData = {
  id: "wsc-82",
  title: "No one keeps the law",
  questions: [82, 83, 84],
  intro:
    "After the ten commandments the Catechism draws the conclusion: no mere man since the fall keeps them perfectly; we break them daily in thought, word and deed; and every sin deserves God’s wrath and curse. It is meant to bring us to the question of the next unit: how can we escape?",
  workspace: { passage: p("Rom", 3, 9), study: ["crossrefs"], question: 82 },
  steps: [
    before("Having gone through the ten commandments, which do you find you keep perfectly?", "I find…"),
    read(
      "None righteous",
      "Read Romans 3:9–20. Highlight what Paul says the law does, in verses 19 and 20.",
      p("Rom", 3, 9, 20),
      p("Rom", 3, 19, 20),
    ),
    read(
      "Guilty of all",
      "Read James 2:10–11 and Galatians 3:10–13. Highlight what Christ was made for us, in Galatians 3:13.",
      p("Gal", 3, 10, 13),
      p("Gal", 3, 13),
      { id: "curse", tip: null },
    ),
    answer(
      82,
      "Read Questions 82 to 84. “No mere man, since the fall, is able in this life perfectly to keep the commandments of God, but doth daily break them in thought, word, and deed.” Some sins are more heinous than others (Question 83), but “Every sin deserveth God’s wrath and curse, both in this life, and that which is to come.”",
    ),
    standards("The Larger Catechism lists what makes some sins worse than others: who commits them, against whom, what they are, and when and where. Read Question 151.", "wlc", 151),
    teaching(82, "fisher", "Read Fisher’s Catechism on Question 82."),
    classic("Read Watson on man’s inability to keep the moral law.", "The Ten Commandments", "Is any man able perfectly to keep the commandments of God", 82, "whyte"),
    quiz(
      [
        {
          q: "Who is meant by “no mere man” in Question 82?",
          choices: ["Everyone except Christ, who is God and man", "Everyone without exception", "Everyone except the apostles"],
          answer: 0,
          why: "Christ is not a mere man; he “knew no sin” (2 Corinthians 5:21) and kept the law perfectly for us.",
        },
      ],
      [
        [82, "But is any mere man since the fall in this life perfect?"],
        [83, "But is every sin alike heinous?"],
        [84, "Does sin deserve God’s curse?"],
      ],
    ),
    write("Write a note on Galatians 3:13: what it means that Christ was made a curse for us.", p("Gal", 3, 13), "wsc-82"),
    keep("Learn Questions 82 to 84, and Galatians 3:13.", [82, 83, 84], p("Gal", 3, 13)),
    sing(32, "Sing Psalm 32: “Blessed is he whose transgression is forgiven, whose sin is covered.”"),
    pray("Confess in the prayer journal the commandments you have broken this week, and thank Christ, who kept them all and bore the curse.", "wsc-82"),
  ],
};
