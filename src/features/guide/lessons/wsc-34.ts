import type { LessonData } from "../course";
import { answer, before, classic, keep, look, p, pray, quiz, read, sing, standards, teaching, write } from "./steps";

// New tool: the encyclopedia.
export const WSC_34: LessonData = {
  id: "wsc-34",
  title: "Adoption and sanctification",
  questions: [34, 35],
  intro:
    "Justification changes our standing before God the judge. Adoption brings us into his family: we may call him Father. Sanctification changes us, slowly and really, into the likeness of his Son. Justification is an act, done once; sanctification is a work, carried on all our lives.",
  workspace: { passage: p("Rom", 8, 12), study: ["crossrefs"], question: 34 },
  steps: [
    before("What is the difference between being forgiven and being changed? Does God do both?", "Being forgiven… being changed…"),
    read("Abba, Father", "Read Romans 8:12–17. Highlight what the Spirit of adoption enables us to say, and what we are heirs of.", p("Rom", 8, 12, 17), p("Rom", 8, 15, 17)),
    look(
      "adoption",
      "Adoption in the ancient world",
      "Read the encyclopedia’s article on adoption. What did it mean in Roman law for a son to be adopted, and how does Paul use the picture?",
      { pane: "encyclopedia", slug: "adoption" },
      { tip: "The encyclopedia (the International Standard Bible Encyclopedia, 1915) has longer articles on the people, places, customs and teaching of the Bible." },
    ),
    read(
      "Your sanctification",
      "Read 1 Thessalonians 4:1–8. Highlight what Paul calls “the will of God”, and what it means in practice.",
      p("1Thess", 4, 1, 8),
      p("1Thess", 4, 3, 7),
      { id: "holy", tip: null },
    ),
    answer(
      34,
      "Read Questions 34 and 35. Adoption is “an act of God’s free grace, whereby we are received into the number, and have a right to all the privileges, of the sons of God.” Sanctification is “the work of God’s free grace, whereby we are renewed in the whole man after the image of God, and are enabled more and more to die unto sin, and live unto righteousness.” Notice “act” and “work”, and “more and more”.",
    ),
    standards(
      "The Larger Catechism sets justification and sanctification side by side. Read Question 77: in justification God imputes Christ’s righteousness; in sanctification his Spirit infuses grace. The one is equal in all believers and perfect in this life; the other is neither.",
      "wlc",
      77,
    ),
    teaching(35, "whyte", "Read Alexander Whyte on Question 35."),
    classic("Watson preaches on adoption from John 1:12.", "A Body of Divinity", "As many as received him to them gave he power to become the sons of God", 34, "flavel"),
    quiz(
      [
        {
          q: "Is sanctification complete in this life?",
          choices: ["Yes, at conversion", "No: we are enabled more and more to die unto sin, and live unto righteousness"],
          answer: 1,
          why: "Question 35 says “more and more”; the Larger Catechism (Question 77) says sanctification is “neither equal in all, nor in this life perfect in any, but growing up to perfection.”",
        },
      ],
      [
        [34, "Are they so by nature?"],
        [34, "Have we leave to call God, Father?"],
        [35, "Is it necessary they should be so?"],
        [35, "Is it the work of the Spirit of God?"],
      ],
    ),
    write("Write a note on Romans 8:15: what it means for you to call God “Abba, Father”.", p("Rom", 8, 15), "wsc-34"),
    keep("Learn Questions 34 and 35, and Romans 8:15.", [34, 35], p("Rom", 8, 15)),
    sing(103, "Sing Psalm 103: “Like as a father pitieth his children, so the LORD pitieth them that fear him.”"),
    pray("Pray to God as your Father in the prayer journal, and ask him for help against one sin you want to die to.", "wsc-34"),
  ],
};
