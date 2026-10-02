import type { LessonData } from "../course";
import { answer, before, classic, keep, look, p, pray, quiz, read, sing, standards, teaching, write } from "./steps";

export const WSC_96: LessonData = {
  id: "wsc-96",
  title: "The Lord’s Supper",
  questions: [96, 97],
  intro:
    "On the night he was betrayed, Christ took bread and the cup and gave them to his disciples. The Catechism says how believers feed on him at his table: not with the mouth, as Rome teaches, but by faith, to their spiritual nourishment. And it says how to come: examining ourselves, not to stay away, but to come rightly.",
  workspace: { passage: p("1Cor", 11, 23), study: ["crossrefs"], question: 96 },
  steps: [
    before("What happens at the Lord’s Supper? What do you receive there?", "At the Lord’s Supper…"),
    read(
      "This do in remembrance",
      "Read 1 Corinthians 11:23–32. Highlight what Christ said and did, and what Paul tells us to do before we eat.",
      p("1Cor", 11, 23, 32),
      p("1Cor", 11, 23, 26),
    ),
    look(
      "harmony",
      "The upper room",
      "Open the Harmony and find the Last Supper. Read how Matthew, Mark and Luke each tell it.",
      { pane: "harmony" },
    ),
    answer(
      96,
      "Read Questions 96 and 97. The worthy receivers are, “not after a corporal and carnal manner, but by faith, made partakers of his body and blood, with all his benefits, to their spiritual nourishment, and growth in grace.” And those who come are to “examine themselves of their knowledge to discern the Lord’s body, of their faith to feed upon him, of their repentance, love, and new obedience.”",
    ),
    standards("Read the Larger Catechism Question 172: may one who doubts whether he is in Christ come to the Lord’s Supper? Its answer is full of comfort for the weak.", "wlc", 172),
    teaching(96, "whyte", "Read Alexander Whyte on Question 96."),
    classic("Read Watson’s sermon on the Lord’s Supper.", "The Ten Commandments", "Having spoken to the sacrament of baptism", 96, "whyte"),
    quiz(
      [
        {
          q: "How do worthy receivers partake of Christ’s body and blood, according to Question 96?",
          choices: ["By eating his actual flesh", "By faith, to their spiritual nourishment", "Only by remembering him"],
          answer: 1,
          why: "“Not after a corporal and carnal manner, but by faith, made partakers of his body and blood, with all his benefits.” More than a memory: a real, spiritual feeding on Christ.",
        },
      ],
      [
        [96, "Did he intend it should continue?"],
        [97, "Must those who come to the Lord’s Supper prepare for it?"],
      ],
    ),
    write("Before the next Lord’s Supper, write a note on 1 Corinthians 11:28: examine yourself on each point of Question 97.", p("1Cor", 11, 28), "wsc-96"),
    keep("Learn Questions 96 and 97, and 1 Corinthians 11:26.", [96, 97], p("1Cor", 11, 26)),
    sing(116, "Sing Psalm 116: “I will take the cup of salvation, and call upon the name of the LORD.”"),
    pray("Pray in the prayer journal as you prepare for the Lord’s table: with thanks for his death, and love for the brothers and sisters you will share it with.", "wsc-96"),
  ],
};
