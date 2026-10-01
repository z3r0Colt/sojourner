import type { LessonData } from "../course";
import { answer, before, classic, keep, look, p, prayQuietly, quiz, read, standards, teaching, write } from "./steps";

// New tool: a Bible commentary.
export const WSC_12: LessonData = {
  id: "wsc-12",
  title: "The covenant of life",
  questions: [12],
  intro:
    "In the garden God bound himself to Adam by a covenant: life, on condition of perfect obedience; death, for disobedience. Everything that follows in the Catechism, the fall and the covenant of grace, makes sense only against this first covenant, and against Adam as the one who stood for us all.",
  workspace: { passage: p("Gen", 2, 8), study: ["commentary"], question: 12 },
  steps: [
    before("Before Adam sinned, what did God require of him, and what did God promise?", "God required… and promised…"),
    read("The command", "Read Genesis 2:8–17. Highlight the command God gave, and the warning with it.", p("Gen", 2, 8, 17), p("Gen", 2, 16, 17)),
    look(
      "commentary",
      "A commentary",
      "Read what Matthew Henry’s commentary says on Genesis 2:16–17: why God gave Adam a command at all, and why this one.",
      { pane: "commentary", passage: p("Gen", 2, 16), source: "mhc" },
      { tip: "A Bible commentary follows the Bible pane beside it; the list at its top chooses the commentator.", openLabel: "Matthew Henry on Genesis 2" },
    ),
    read(
      "Adam and Christ",
      "Read Romans 5:12–19. Paul sets Adam beside Christ: one man’s disobedience, one man’s obedience. Highlight verses 18 and 19.",
      p("Rom", 5, 12, 19),
      p("Rom", 5, 18, 19),
      { id: "adam", tip: null },
    ),
    answer(
      12,
      "Read Question 12. God “entered into a covenant of life with him, upon condition of perfect obedience; forbidding him to eat of the tree of the knowledge of good and evil, upon pain of death.” The word covenant is not in Genesis 2, but Hosea 6:7 says of Israel, “they like men have transgressed the covenant” (the margin reads “like Adam”).",
    ),
    standards(
      "Read the Confession 7.2, which calls it “a covenant of works, wherein life was promised to Adam; and in him to his posterity, upon condition of perfect and personal obedience.” Notice “and in him to his posterity”: Adam stood for us.",
      "wcf",
      7,
      2,
      "The Confession",
    ),
    teaching(12, "whyte", "Read Alexander Whyte on Question 12."),
    classic("Read Watson’s sermon on the covenant of works.", "A Body of Divinity", "WHAT SPECIAL ACT OF PROVIDENCE", 12, "whyte"),
    quiz(
      [
        {
          q: "On what condition was life promised in the covenant of works?",
          choices: ["Perfect obedience", "Faith in a Saviour to come", "Sacrifice for sin"],
          answer: 0,
          why: "“Upon condition of perfect obedience” (Question 12); “perfect and personal obedience” (Confession 7.2).",
        },
      ],
      [
        [12, "Did God give him a law?"],
        [12, "Did he threaten death upon his disobedience?"],
        [12, "Was this God’s covenant with Adam?"],
      ],
    ),
    write("Write a note on Romans 5:19: what Adam’s disobedience did, and what Christ’s obedience does.", p("Rom", 5, 19), "wsc-12"),
    keep("Learn Question 12, and Romans 5:19.", [12], p("Rom", 5, 19)),
    prayQuietly("Thank God that where the first Adam failed, the last Adam, Christ, obeyed perfectly, and that his obedience is counted for all who trust him."),
  ],
};
