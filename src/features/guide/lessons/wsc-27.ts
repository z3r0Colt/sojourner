import type { LessonData } from "../course";
import { answer, before, classic, keep, look, p, pray, quiz, read, sing, standards, teaching, write } from "./steps";

// New tool: the Harmony of the Gospels.
export const WSC_27: LessonData = {
  id: "wsc-27",
  title: "Humiliation and exaltation",
  questions: [27, 28],
  intro:
    "Christ did his work as prophet, priest and king in two estates: first humbled, then exalted. Philippians 2 holds both in one sentence. In this lesson you trace the steps down, from the manger to the grave, and the steps up, from the empty tomb to his coming again.",
  workspace: { passage: p("Phil", 2, 5), study: ["crossrefs"], question: 27 },
  steps: [
    before("Why did Jesus have to suffer and die? Couldn’t God simply forgive?", "Jesus had to suffer because…"),
    read(
      "Down and up",
      "Read Philippians 2:5–11. Highlight each step down in verses 6–8, then each step up in verses 9–11.",
      p("Phil", 2, 5, 11),
      p("Phil", 2, 6, 11),
    ),
    look(
      "harmony",
      "The four Gospels together",
      "Open the Harmony of the Gospels and find his burial and resurrection. Read how each Gospel tells the empty tomb, side by side. What does each add?",
      { pane: "harmony" },
      { tip: "The Harmony sets the four Gospels’ accounts of each event side by side, in the order of Christ’s life." },
    ),
    answer(
      27,
      "Read Questions 27 and 28. His humiliation: “his being born, and that in a low condition, made under the law, undergoing the miseries of this life, the wrath of God, and the cursed death of the cross; in being buried, and continuing under the power of death for a time.” His exaltation: rising on the third day, ascending, sitting at the right hand of God the Father, “and in coming to judge the world at the last day.”",
    ),
    standards("The Larger Catechism takes each step in turn. Read Question 49, on how Christ humbled himself in his death.", "wlc", 49),
    teaching(27, "flavel", "Read John Flavel on Question 27."),
    classic(
      "Watson preaches on Christ’s exaltation from Philippians 2:9: “Wherefore God also hath highly exalted him.”",
      "A Body of Divinity",
      "Wherefore God also has highly exalted him",
      28,
      "whyte",
    ),
    quiz(
      [
        {
          q: "Which of these is part of Christ’s exaltation, not his humiliation?",
          choices: ["Being made under the law", "Continuing under the power of death for a time", "Sitting at the right hand of God the Father", "Being born in a low condition"],
          answer: 2,
          why: "Question 28: rising again, ascending, sitting at the right hand of God, and coming to judge the world.",
        },
      ],
      [
        [27, "Did Jesus Christ humble himself?"],
        [27, "Was it requisite he should humble himself?"],
        [28, "Did he continue always in the hands of death?"],
        [28, "Did the same body rise?"],
      ],
    ),
    write("Write a note on Philippians 2:5: “Let this mind be in you, which was also in Christ Jesus.” Where are you called to humble yourself?", p("Phil", 2, 5), "wsc-27"),
    keep("Learn Questions 27 and 28, and Philippians 2:8.", [27, 28], p("Phil", 2, 8)),
    sing(22, "Psalm 22 begins with the cry from the cross and ends with all the ends of the world turning to the LORD. Sing it, or read it aloud."),
    pray("Thank Christ in the prayer journal for each step he took down for you, and rejoice in each step up.", "wsc-27"),
  ],
};
