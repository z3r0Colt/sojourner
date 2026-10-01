import type { LessonData } from "../course";
import { answer, before, classic, keep, look, p, pray, quiz, read, standards, teaching, write } from "./steps";

export const WSC_73: LessonData = {
  id: "wsc-73",
  title: "The eighth commandment",
  questions: [73, 74, 75],
  intro:
    "Stealing is more than taking what is not ours. The Catechism reads the eighth commandment as care for our own and our neighbour’s “wealth and outward estate”: honest work, fair dealing, generosity, and not wasting what God has given us.",
  workspace: { passage: p("Eph", 4, 28), study: ["crossrefs"], question: 74 },
  steps: [
    before("Can a person break the eighth commandment without ever taking anything?", "I think…"),
    read(
      "Let him labour",
      "Read Ephesians 4:28 and highlight the three things Paul tells the thief to do instead.",
      p("Eph", 4, 25, 32),
      p("Eph", 4, 28),
    ),
    look(
      "zacchaeus",
      "A thief restored",
      "Look up Zacchaeus in the Factbook, then read Luke 19:1–10. What did Zacchaeus do when Christ came to his house?",
      { pane: "factbook", id: "Zacchaeus@Luk.19.2-" },
      { openLabel: "Zacchaeus in the Factbook" },
    ),
    answer(
      74,
      "Read Questions 73 to 75. The commandment requires “the lawful procuring and furthering the wealth and outward estate of ourselves and others,” and forbids “whatsoever doth, or may, unjustly hinder our own, or our neighbour’s, wealth or outward estate.” Our own as well as our neighbour’s: idleness and waste break it too.",
    ),
    standards("Read the Larger Catechism Question 141, the duties of this commandment, and see how much of it is about contentment and generosity.", "wlc", 141),
    teaching(74, "fisher", "Read Fisher’s Catechism on Question 74."),
    classic("Read Watson’s sermon on the eighth commandment.", "The Ten Commandments", "AS the holiness of God sets him against uncleanness", 73, "whyte"),
    quiz(
      [
        {
          q: "Can a person break the eighth commandment against their own estate?",
          choices: ["No, only against a neighbour’s", "Yes: it forbids whatever unjustly hinders our own, or our neighbour’s, wealth"],
          answer: 1,
          why: "Question 75: “whatsoever doth, or may, unjustly hinder our own, or our neighbour’s, wealth or outward estate.”",
        },
      ],
      [
        [73, "Is robbing God the worst theft?"],
        [74, "Does it teach us to be diligent in our callings?"],
        [75, "May we do what we will with our own estates?"],
      ],
    ),
    write("Write a note on Ephesians 4:28: one way you could “give to him that needeth” this month.", p("Eph", 4, 28), "wsc-73"),
    keep("Learn Questions 73 to 75, and Ephesians 4:28.", [73, 74, 75], p("Eph", 4, 28)),
    pray("Pray Proverbs 30:8–9 in the prayer journal: “give me neither poverty nor riches; feed me with food convenient for me.”", "wsc-73"),
  ],
};
