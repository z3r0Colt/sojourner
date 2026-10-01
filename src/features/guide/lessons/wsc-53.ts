import type { LessonData } from "../course";
import { answer, before, classic, keep, look, p, pray, quiz, read, standards, teaching, write } from "./steps";

export const WSC_53: LessonData = {
  id: "wsc-53",
  title: "The third commandment",
  questions: [53, 54, 55, 56],
  intro:
    "God’s name is everything by which he makes himself known. To take it in vain is not only to swear by it; it is to use anything of God (his titles, his Word, his worship, his works) lightly, falsely or emptily. This commandment alone carries a warning that its breakers will not be held guiltless.",
  workspace: { passage: p("Matt", 5, 33), study: ["crossrefs"], question: 54 },
  steps: [
    before("What does it mean to take God’s name in vain? Is it only swearing?", "To take God’s name in vain is…"),
    read(
      "Let your communication be",
      "Read Matthew 5:33–37. Highlight what Jesus says our plain words should be.",
      p("Matt", 5, 33, 37),
      p("Matt", 5, 37),
    ),
    look(
      "vain",
      "An old word: vain",
      "Look up “vain” in Webster. Which of his senses fits the commandment? Then read Matthew 15:8–9, where worship itself is “in vain”.",
      { pane: "webster", word: "vain" },
    ),
    answer(
      54,
      "Read Questions 53 to 56. The commandment requires “the holy and reverend use of God’s names, titles, attributes, ordinances, Word, and works,” and forbids “all profaning or abusing of anything whereby God maketh himself known.” Its reason: however men may escape punishment from men, “the Lord our God will not suffer them to escape his righteous judgment.”",
    ),
    standards("Oaths and vows are a right use of God’s name. Read the Confession 22.1, on when an oath is lawful.", "wcf", 22, 1, "The Confession"),
    teaching(54, "flavel", "Read John Flavel on Question 54."),
    classic("Read Watson’s sermon on the third commandment.", "The Ten Commandments", "Thou shalt not take the name of the Lord thy God in vain", 53, "whyte"),
    quiz(
      [
        {
          q: "Does the third commandment concern only the words we say?",
          choices: ["Yes, only swearing and cursing", "No: it covers anything whereby God makes himself known, his titles, attributes, ordinances, Word and works"],
          answer: 1,
          why: "Questions 54 and 55: “the holy and reverend use of God’s names, titles, attributes, ordinances, Word, and works.”",
        },
      ],
      [
        [53, "Is God’s name all that whereby he makes himself known?"],
        [54, "Are we to worship God reverently in every religious duty?"],
        [55, "Do hypocritical worshippers take God’s name in vain?"],
        [56, "But shall they escape God’s judgments?"],
      ],
    ),
    write("Write a note on Matthew 6:9, “Hallowed be thy name”: one way you use God’s name or his things lightly, and one way you could honour them.", p("Matt", 6, 9), "wsc-53"),
    keep("Learn Questions 53 to 56, and Exodus 20:7.", [53, 54, 55, 56], p("Exod", 20, 7)),
    pray("Pray Psalm 141:3 in the prayer journal: “Set a watch, O LORD, before my mouth; keep the door of my lips.”", "wsc-53"),
  ],
};
