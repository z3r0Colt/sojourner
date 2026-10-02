import type { LessonData } from "../course";
import { answer, before, classic, keep, look, p, prayQuietly, quiz, read, standards, teaching, write } from "./steps";

// New tool: Confessions on this passage.
export const WSC_5: LessonData = {
  id: "wsc-5",
  title: "One God in three persons",
  questions: [5, 6],
  intro:
    "Israel confessed every day that the LORD is one. Yet at the Jordan the Father speaks from heaven, the Son stands in the water, and the Spirit descends like a dove. The Catechism holds both together in two short answers, and in this lesson you see where each comes from.",
  workspace: { passage: p("Matt", 3, 13), study: ["crossrefs", "confession-for-passage"], question: 6 },
  steps: [
    before("Christians say there is one God, and that the Father, the Son and the Holy Spirit are each God. How would you explain that to a friend?", "I would say…"),
    read(
      "The LORD is one",
      "Read Deuteronomy 6:4–9, the words Israel recited morning and evening. Highlight what Israel was to confess, and what follows from it.",
      p("Deut", 6, 4, 9),
      p("Deut", 6, 4, 5),
    ),
    read(
      "At the Jordan",
      "Read Matthew 3:13–17. Highlight where the Father, the Son and the Spirit each appear.",
      p("Matt", 3, 13, 17),
      p("Matt", 3, 16, 17),
      { id: "jordan", tip: null },
    ),
    answer(
      6,
      "Read Questions 5 and 6. Question 5: there is “but One only, the living and true God.” Question 6 then says there are three persons, “and these three are one God, the same in substance, equal in power and glory.” Notice what it does not say: not three Gods, and not one person wearing three masks.",
    ),
    look(
      "name",
      "Baptized into one name",
      "Read Matthew 28:19. Christ sends his disciples to baptize “in the name” (one name) “of the Father, and of the Son, and of the Holy Ghost.” Then look at which confessions cite this verse, and what they use it to prove.",
      { pane: "confession-for-passage", passage: p("Matt", 28, 19) },
      {
        tip: "Confessions on this passage lists every paragraph of the confessions that cites the verse you are reading as a proof.",
        openLabel: "Confessions on Matthew 28:19",
      },
    ),
    standards(
      "The Larger Catechism asks how it appears that the Son and the Holy Ghost are God equal with the Father, and answers from Scripture: by the names, attributes, works and worship that belong to God alone. Read Question 11.",
      "wlc",
      11,
    ),
    teaching(6, "whyte", "Read Alexander Whyte on Question 6. He explains where the word “person” comes from, and is honest about the mystery."),
    classic(
      "Watson says the Trinity could never be found out by human searching: “This is of divine revelation, and must be adored with humble believing.” Read his opening pages.",
      "A Body of Divinity",
      "HOW MANY PERSONS ARE THERE IN THE GODHEAD",
      6,
      "flavel",
    ),
    quiz(
      [
        {
          q: "What does Question 6 say of the three persons?",
          choices: ["They are three Gods, equal in power", "They are one God, the same in substance, equal in power and glory", "They are three ways in which one person shows himself"],
          answer: 1,
          why: "“These three are one God, the same in substance, equal in power and glory.”",
        },
      ],
      [
        [5, "Can there be any but one?"],
        [5, "Are all other gods false gods?"],
        [6, "Are there three gods?"],
        [6, "Is the Word God?"],
        [6, "Is the Holy Ghost a divine person?"],
      ],
    ),
    write("Write a note on Matthew 28:19: what it means to you to be baptized into the one name of the Father, the Son and the Holy Ghost.", p("Matt", 28, 19), "wsc-5"),
    keep("Learn Questions 5 and 6, and Deuteronomy 6:4.", [5, 6], p("Deut", 6, 4)),
    prayQuietly(
      "Pray to the Father, through the Son, in the Spirit, and end with the blessing of 2 Corinthians 13:14: “The grace of the Lord Jesus Christ, and the love of God, and the communion of the Holy Ghost, be with you all.”",
    ),
  ],
};
