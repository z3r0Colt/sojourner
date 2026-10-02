import type { LessonData } from "../course";
import { answer, before, classic, keep, p, pray, quiz, read, sing, standards, teaching, write } from "./steps";

export const WSC_106: LessonData = {
  id: "wsc-106",
  title: "Deliver us, and Amen",
  questions: [106, 107],
  intro:
    "The prayer ends with our weakness and God’s glory: lead us not into temptation, but deliver us from evil; for thine is the kingdom, the power and the glory. The last answer of the Catechism is about how to end a prayer, and fittingly, it ends with praise and Amen.",
  workspace: { passage: p("1Cor", 10, 12), study: ["crossrefs"], question: 106 },
  steps: [
    before("What temptation do you face most often? Write it, as plainly as you can.", "I am most tempted…"),
    read(
      "A way to escape",
      "Read 1 Corinthians 10:12–13. Highlight God’s promise about every temptation.",
      p("1Cor", 10, 12, 13),
      p("1Cor", 10, 13),
    ),
    read(
      "Tempted like as we are",
      "Read Hebrews 4:14–16 and highlight why we may come boldly to the throne of grace.",
      p("Heb", 4, 14, 16),
      p("Heb", 4, 15, 16),
      { id: "high-priest", tip: null },
    ),
    answer(
      106,
      "Read Questions 106 and 107. We pray “that God would either keep us from being tempted to sin, or support and deliver us when we are tempted.” And the conclusion teaches us “to take our encouragement in prayer from God only, and in our prayers to praise him, ascribing kingdom, power, and glory to him; and, in testimony of our desire, and assurance to be heard, we say, Amen.”",
    ),
    standards("Read the Larger Catechism Question 196, the last question of the Larger Catechism, on the conclusion of the Lord’s Prayer.", "wlc", 196),
    teaching(107, "whyte", "Read Alexander Whyte on Question 107, the last of his commentary."),
    classic("Read Watson’s sermon on the sixth petition.", "The Lord's Prayer", "This petition consists of two parts. First, Deprecatory", 106, "whyte"),
    quiz(
      [
        {
          q: "Where does Question 107 say we take our encouragement in prayer?",
          choices: ["From our own faithfulness", "From God only", "From how long we have prayed"],
          answer: 1,
          why: "“To take our encouragement in prayer from God only.” Daniel 9:18: “we do not present our supplications before thee for our righteousnesses, but for thy great mercies.”",
        },
      ],
      [
        [106, "Must we pray that we may not be tempted?"],
        [106, "Must we pray that God would not leave us to ourselves?"],
        [107, "Can we in prayer plead any merit of our own?"],
        [107, "Must we therefore take our encouragement from God only?"],
      ],
    ),
    write("Write a note on 1 Corinthians 10:13 about the temptation you named: what “a way to escape” might be.", p("1Cor", 10, 13), "wsc-106"),
    keep("Learn Questions 106 and 107, and 1 Corinthians 10:13.", [106, 107], p("1Cor", 10, 13)),
    sing(145, "End the Catechism with praise. Sing Psalm 145: “I will extol thee, my God, O king; and I will bless thy name for ever and ever.”"),
    pray("Pray the whole Lord’s Prayer in the prayer journal, slowly, a petition at a time, in your own words, and end with Amen.", "wsc-106"),
  ],
};
