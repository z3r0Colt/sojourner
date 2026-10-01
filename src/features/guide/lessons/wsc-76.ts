import type { LessonData } from "../course";
import { answer, before, classic, keep, p, pray, quiz, read, standards, teaching, write } from "./steps";

export const WSC_76: LessonData = {
  id: "wsc-76",
  title: "The ninth commandment",
  questions: [76, 77, 78],
  intro:
    "God is the God of truth, and the devil “is a liar, and the father of it.” The ninth commandment guards truth between people, and every person’s good name, our own and our neighbour’s: in court, and in conversation, gossip and silence.",
  workspace: { passage: p("Jas", 3, 1), study: ["crossrefs"], question: 77 },
  steps: [
    before("Is it ever right to lie? Write what you think, and why.", "I think…"),
    read(
      "The tongue is a fire",
      "Read James 3:1–12. Highlight the pictures James uses for the tongue.",
      p("Jas", 3, 1, 12),
      p("Jas", 3, 5, 8),
    ),
    read(
      "Speak every man truth",
      "Read Ephesians 4:25–32 and highlight the reason Paul gives for speaking the truth.",
      p("Eph", 4, 25, 32),
      p("Eph", 4, 25),
      { id: "truth", tip: null },
    ),
    answer(
      77,
      "Read Questions 76 to 78. The commandment requires “the maintaining and promoting of truth between man and man, and of our own and our neighbour’s good name, especially in witness bearing,” and forbids “whatsoever is prejudicial to truth, or injurious to our own, or our neighbour’s, good name.”",
    ),
    standards("The Larger Catechism lists the sins of the tongue. Read Question 145 slowly; it is long, and searching.", "wlc", 145),
    teaching(77, "whyte", "Read Alexander Whyte on Question 77."),
    classic("Read Watson’s sermon on the ninth commandment.", "The Ten Commandments", "THE tongue which at first was", 76, "whyte"),
    quiz(
      [
        {
          q: "Whose good name does the ninth commandment require us to promote?",
          choices: ["Only our own", "Only our neighbour’s", "Our own and our neighbour’s"],
          answer: 2,
          why: "Question 77: “of our own and our neighbour’s good name, especially in witness bearing.”",
        },
      ],
      [
        [77, "Is it our duty to govern our tongues?"],
        [77, "Is it our duty to speak truth?"],
        [78, "Is it a sin that God hates?"],
      ],
    ),
    write("Write a note on James 3:10: something you have said about someone that you should not have, and what you could say or do now.", p("Jas", 3, 10), "wsc-76"),
    keep("Learn Questions 76 to 78, and Ephesians 4:25.", [76, 77, 78], p("Eph", 4, 25)),
    pray("Pray Psalm 19:14 in the prayer journal: “Let the words of my mouth, and the meditation of my heart, be acceptable in thy sight, O LORD.”", "wsc-76"),
  ],
};
