import type { LessonData } from "../course";
import { answer, before, classic, keep, look, p, prayQuietly, quiz, read, standards, teaching, write } from "./steps";

// New tool: the Factbook.
export const WSC_11: LessonData = {
  id: "wsc-11",
  title: "Providence",
  questions: [11],
  intro:
    "God did not make the world and leave it to run. He holds it up and rules it, down to a sparrow’s fall and the hairs of your head. In this lesson you read Jesus’ words on providence and follow it through one life, Joseph’s.",
  workspace: { passage: p("Matt", 10, 29), study: ["crossrefs"], question: 11 },
  steps: [
    before("Does God care about the small things in your life? Why do you think so?", "I think…"),
    read("Not one sparrow", "Read Matthew 10:28–31. Highlight what Jesus says the Father does, and what follows for his disciples.", p("Matt", 10, 28, 31), p("Matt", 10, 29, 31)),
    look(
      "joseph",
      "One life",
      "Look up Joseph, Jacob’s son, in the Factbook: his family, and the places his story passes through. Then read Genesis 45:4–8, where he tells his brothers, “So now it was not you that sent me hither, but God.”",
      { pane: "factbook", id: "Joseph@Gen.30.24-Rev" },
      { tip: "The Factbook gathers what Scripture says about a person or place: family, verses, and where they appear.", openLabel: "Joseph in the Factbook" },
    ),
    read("Sent before you", "Read Genesis 45:4–8 and highlight each time Joseph says God sent him.", p("Gen", 45, 4, 8), p("Gen", 45, 5, 8), { id: "sent", tip: null }),
    answer(
      11,
      "Read Question 11. Providence is God’s “most holy, wise, and powerful preserving and governing all his creatures, and all their actions.” Two verbs: preserving and governing. And it reaches “all their actions”, including the brothers’ sin, which God governed without approving.",
    ),
    standards(
      "Read the Confession 5.7. Providence reaches all creatures, and “after a most special manner” it takes care of his church, and disposes all things to the good thereof.",
      "wcf",
      5,
      7,
      "The Confession",
    ),
    teaching(11, "flavel", "Read John Flavel on Question 11. He was a great student of providence, and wrote a whole book on observing it in one’s own life."),
    classic("Watson’s sermon on providence answers two objections people raise when the world seems disorderly and God’s ways hard.", "A Body of Divinity", "WHAT ARE GOD'S WORKS OF PROVIDENCE", 11, "whyte"),
    quiz(
      [
        {
          q: "What two things does Question 11 say God does in providence?",
          choices: ["Creating and redeeming", "Preserving and governing", "Watching and waiting"],
          answer: 1,
          why: "“His most holy, wise, and powerful preserving and governing all his creatures, and all their actions.”",
        },
      ],
      [
        [11, "When God had made the world, did he leave it to itself?"],
        [11, "What! even the sparrows?"],
        [11, "Is he man’s Protector and Benefactor?"],
      ],
    ),
    write("Write a note on Romans 8:28 about a time you can now see God’s hand in something that seemed to be going wrong.", p("Rom", 8, 28), "wsc-11"),
    keep("Learn Question 11, and Romans 8:28.", [11], p("Rom", 8, 28)),
    prayQuietly("Cast your cares on God, as 1 Peter 5:7 says, “for he careth for you.” Name the things you are anxious about, one by one."),
  ],
};
