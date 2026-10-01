import type { LessonData } from "../course";
import { answer, before, classic, keep, look, p, pray, quiz, read, sing, standards, teaching, write } from "./steps";

export const WSC_45: LessonData = {
  id: "wsc-45",
  title: "The first commandment",
  questions: [45, 46, 47, 48],
  intro:
    "“Thou shalt have no other gods before me.” Few people now bow to idols of wood, but anything we love, trust or fear more than God has become a god to us. The first commandment is about whom we worship; the second, which follows, about how.",
  workspace: { passage: p("1Kgs", 18, 20), study: ["crossrefs"], question: 46 },
  steps: [
    before("What might be “another god” for someone today, who never bows to an idol?", "Another god could be…"),
    read(
      "How long halt ye?",
      "Read 1 Kings 18:20–39. Highlight Elijah’s question to the people, and what they say at the end.",
      p("1Kgs", 18, 20, 39),
      p("1Kgs", 18, 21),
    ),
    look(
      "elijah",
      "Elijah",
      "Look up Elijah in the Factbook. Where did he stand against Baal, and what happened to him next, in chapter 19?",
      { pane: "factbook", id: "Elijah@1Ki.17.1-Jas" },
      { openLabel: "Elijah in the Factbook" },
    ),
    answer(
      46,
      "Read Questions 45 to 48. The commandment requires us “to know and acknowledge God to be the only true God, and our God; and to worship and glorify him accordingly.” It forbids not only giving his glory to another, but “not worshipping and glorifying the true God as God, and our God.” And “before me” means in his sight: God, “who seeth all things, taketh notice of” it.",
    ),
    standards("The Larger Catechism lists the sins forbidden by this commandment at length. Read Question 105, slowly, and mark any that are yours.", "wlc", 105),
    teaching(46, "fisher", "Read Fisher’s Catechism on Question 46."),
    classic("Watson preaches on the first commandment.", "The Ten Commandments", "Why is the commandment in the second person singular", 45, "whyte"),
    quiz(
      [
        {
          q: "Does the first commandment forbid only worshipping false gods?",
          choices: ["Yes", "No: it also forbids not worshipping and glorifying the true God as God"],
          answer: 1,
          why: "Question 47: it forbids “the denying, or not worshipping and glorifying the true God as God, and our God”.",
        },
      ],
      [
        [45, "Did Israel need this commandment?"],
        [46, "Is it our duty to acquaint ourselves with him?"],
        [47, "Is it a sin to question God’s providence?"],
        [48, "Are we always in God’s sight?"],
      ],
    ),
    write("Write a note on 1 Kings 18:21: what you are tempted to love, trust or fear more than God.", p("1Kgs", 18, 21), "wsc-45"),
    keep("Learn Questions 45 to 48, and Exodus 20:3.", [45, 46, 47, 48], p("Exod", 20, 3)),
    sing(115, "Sing Psalm 115: “Not unto us, O LORD, not unto us, but unto thy name give glory,” and see what it says of idols and those who make them."),
    pray("Confess in the prayer journal the other gods you named, and ask God to be your God alone.", "wsc-45"),
  ],
};
