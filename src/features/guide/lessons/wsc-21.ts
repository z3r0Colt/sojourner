import type { LessonData } from "../course";
import { answer, before, classic, keep, look, p, pray, quiz, read, sing, standards, teaching, write } from "./steps";

// New tool: the interlinear.
export const WSC_21: LessonData = {
  id: "wsc-21",
  title: "The Redeemer, God and man",
  questions: [21, 22],
  intro:
    "Who is the Redeemer the covenant promised? The Lord Jesus Christ: the eternal Son of God, who became man, and so “was, and continueth to be, God and man in two distinct natures, and one person, forever.” In this lesson you read John’s prologue in the Greek, word by word, and see how the Catechism guards each part of the mystery.",
  workspace: { passage: p("John", 1, 1), study: ["interlinear"], question: 21 },
  steps: [
    before("Was Jesus God, or a man, or both? What difference would it make if he were only one?", "I think…"),
    read("The Word made flesh", "Read John 1:1–18. Highlight what John says the Word was in the beginning, and what the Word became.", p("John", 1, 1, 18), p("John", 1, 14)),
    look(
      "greek",
      "The Greek",
      "Look at John 1:1 and 1:14 in the interlinear. In verse 1 the Word “was” (ἦν), always; in verse 14 the Word “was made” (ἐγένετο), at a point in time. Notice too what verse 14 does not say: the Word did not stop being what he was.",
      { pane: "interlinear", passage: p("John", 1, 14) },
      { tip: "The interlinear sets each Greek or Hebrew word under its English, with its dictionary form and parsing; click a word to study it." },
    ),
    answer(
      21,
      "Read Questions 21 and 22. He is “the only Redeemer of God’s elect”. He became man “by taking to himself a true body, and a reasonable soul, being conceived by the power of the Holy Ghost, in the womb of the virgin Mary, and born of her yet without sin.” A true body and a reasonable soul: the whole of human nature.",
    ),
    standards(
      "Read the Confession 8.2. The two natures were joined in one person “without conversion, composition, or confusion.” Which person is God and man? Not a new person, but the Son, who took our nature to himself.",
      "wcf",
      8,
      2,
      "The Confession",
    ),
    teaching(21, "whyte", "Read Alexander Whyte on Question 21."),
    classic("Watson preaches on Christ the Mediator of the covenant.", "A Body of Divinity", "Jesus Christ is the sum and quintessence of the gospel", 21, "flavel"),
    quiz(
      [
        {
          q: "What did the Son of God take to himself when he became man?",
          choices: ["A body only", "A true body, and a reasonable soul", "The appearance of a man"],
          answer: 1,
          why: "“By taking to himself a true body, and a reasonable soul” (Question 22). He was tempted, wept, and said, “My soul is exceeding sorrowful.”",
        },
      ],
      [
        [21, "Could an angel have been our Redeemer?"],
        [21, "Is he the only Redeemer?"],
        [22, "Did Christ take unto himself a true body?"],
        [22, "Did he take to himself a human soul?"],
        [22, "Was he conceived by the power of the Holy Ghost?"],
      ],
    ),
    write("Write a note on John 1:14: why our Redeemer had to be both God and man.", p("John", 1, 14), "wsc-21"),
    keep("Learn Questions 21 and 22, and John 1:14.", [21, 22], p("John", 1, 14)),
    sing(2, "Sing Psalm 2, where the LORD says to his anointed King, “Thou art my Son; this day have I begotten thee.”"),
    pray("Worship the Son in the prayer journal: thank him for becoming what he was not, without ceasing to be what he was.", "wsc-21"),
  ],
};
