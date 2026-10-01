import type { LessonData } from "../course";
import { answer, before, classic, keep, p, pray, quiz, read, standards, teaching, write } from "./steps";

export const WSC_70: LessonData = {
  id: "wsc-70",
  title: "The seventh commandment",
  questions: [70, 71, 72],
  intro:
    "God made marriage and called it good, and the seventh commandment guards it. Jesus carried it into the heart: a look of lust is adultery there. The Catechism asks for chastity in heart, speech and behaviour, our own and our neighbour’s, married or single.",
  workspace: { passage: p("Gen", 39, 7), study: ["crossrefs"], question: 71 },
  steps: [
    before("Why does God care what we do with our bodies?", "I think God cares because…"),
    read(
      "How can I do this great wickedness?",
      "Read Genesis 39:7–12. Highlight what Joseph says to Potiphar’s wife, and what he does.",
      p("Gen", 39, 7, 12),
      p("Gen", 39, 9, 12),
    ),
    read(
      "Glorify God in your body",
      "Read 1 Corinthians 6:15–20. Highlight why Paul says our bodies are not our own.",
      p("1Cor", 6, 15, 20),
      p("1Cor", 6, 19, 20),
      { id: "body", tip: null },
    ),
    answer(
      71,
      "Read Questions 70 to 72. The commandment requires “the preservation of our own and our neighbour’s chastity, in heart, speech, and behavior,” and forbids “all unchaste thoughts, words, and actions.”",
    ),
    standards("Read the Confession 24.1 and 24.2, on what marriage is and why God gave it.", "wcf", 24, 1, "The Confession"),
    teaching(71, "whyte", "Read Alexander Whyte on Question 71."),
    classic("Watson begins his sermon on the seventh commandment: “God is a pure, holy spirit, and has an infinite antipathy against all uncleanness.” Read on.", "The Ten Commandments", "God is a pure, holy spirit, and has an infinite antipathy", 70, "whyte"),
    quiz(
      [
        {
          q: "Where does Question 71 say chastity is to be kept?",
          choices: ["In behaviour only", "In heart, speech, and behaviour", "In marriage only"],
          answer: 1,
          why: "“In heart, speech, and behavior.” Matthew 5:28: whoever looks to lust “hath committed adultery with her already in his heart.”",
        },
      ],
      [
        [70, "Is it agreeable to the light of nature?"],
        [71, "Are we to glorify him with them?"],
        [71, "Ought we to preserve our chastity in heart?"],
        [72, "Are unclean thoughts sins?"],
      ],
    ),
    write("Write a note on 1 Corinthians 6:20: what “ye are bought with a price” means for how you use your body, your eyes and your time.", p("1Cor", 6, 20), "wsc-70"),
    keep("Learn Questions 70 to 72, and 1 Corinthians 6:19–20.", [70, 71, 72], p("1Cor", 6, 19, 20)),
    pray("Pray Psalm 119:37 in the prayer journal: “Turn away mine eyes from beholding vanity; and quicken thou me in thy way.” If you are married, pray for your marriage.", "wsc-70"),
  ],
};
