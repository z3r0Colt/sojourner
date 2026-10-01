import type { LessonData } from "../course";
import { HIGHLIGHT_TIP, NOTE_TIP } from "./tips";

const PSALMS = 19;
const FIRST_CORINTHIANS = 46;

// Unit 1 uses only the Bible, the Confessions, notes and memory.
export const WSC_1: LessonData = {
  id: "wsc-1",
  title: "The chief end of man",
  questions: [1],
  intro:
    "What were you made for? The Catechism begins there, and answers in one sentence that people have carried all their lives. In this first lesson you read two places in Scripture behind the answer, learn it, and write it in your own words. Each step opens what it needs beside this guide and ticks itself off when it is done; you can tick any step yourself, and skip any you like.",
  workspace: {
    passage: { book: PSALMS, chapter: 73, verse: 23 },
    study: [],
    question: 1,
  },
  steps: [
    {
      id: "before",
      title: "Before you read",
      text: "What do you think you were made for? Write a sentence. You will see it again at the end of the unit, beside what you have learned.",
      check: { type: "answer", placeholder: "I think I was made for…" },
    },
    {
      id: "observe",
      title: "Read and mark",
      text: "Read Psalm 73. Asaph had nearly envied the wicked (v. 3), until he went into the sanctuary of God (v. 17). Read verses 23–28 again, and highlight the words where he finds what he wants most.",
      tip: HIGHLIGHT_TIP,
      open: { pane: "bible", passage: { book: PSALMS, chapter: 73, verse: 23, to: 28 } },
      openLabel: "Open Psalm 73",
      check: { type: "highlight", passage: { book: PSALMS, chapter: 73, verse: 23, to: 28 } },
    },
    {
      id: "all-things",
      title: "Whatever you do",
      text: "Read 1 Corinthians 10:31. Paul is answering a question about what Christians may eat, and he ends with a rule for the whole of life. What does “whatsoever ye do” leave out?",
      open: { pane: "bible", passage: { book: FIRST_CORINTHIANS, chapter: 10, verse: 31 } },
      check: { type: "opened" },
    },
    {
      id: "answer",
      title: "The Catechism’s answer",
      text: "Now read Question 1. It names two things, not one: to glorify God, and to enjoy him. Psalm 73 is the second; 1 Corinthians 10:31 is the first.\n\nUnder the answer, “In the other Standards” links to the Larger Catechism’s first question. Open it and notice what it adds: man’s “chief and highest end” is to glorify God and “fully to enjoy him forever.”",
      tip: "The Confessions hold the Westminster Standards and other Reformed confessions. Under each answer, “In the other Standards” links to the same teaching in the Larger Catechism and the Confession.",
      open: { pane: "westminster", doc: "wsc", n: 1 },
      check: { type: "opened" },
    },
    {
      id: "teaching",
      title: "Teaching",
      text: "Alexander Whyte (1883) explains the answer word by word. Read what he says “end” means, and how he explains “glorify” from Christ’s words in John 17:4: “I have glorified thee on the earth: I have finished the work which thou gavest me to do.”",
      tip: "The commentary under each answer can be changed to another author with the list beside it.",
      open: { pane: "westminster", doc: "wsc", n: 1, commentary: "whyte" },
      openLabel: "Read Whyte on Q1",
      check: { type: "opened" },
    },
    {
      id: "check",
      title: "Check your understanding",
      text: "Matthew Henry wrote A Scripture Catechism (1703) to open each answer with plain questions, each one answered from Scripture. Here are some of his on Question 1.",
      check: {
        type: "quiz",
        questions: [
          {
            q: "The Catechism names two things together as man’s chief end. What are they?",
            choices: ["To obey God, and to be saved", "To glorify God, and to enjoy him for ever", "To know God, and to serve our neighbour"],
            answer: 1,
            why: "“Man’s chief end is to glorify God, and to enjoy him for ever.”",
          },
        ],
        henry: [
          { question: 1, ask: "Is he his own end?" },
          { question: 1, ask: "Will the riches of the world make you happy?" },
          { question: 1, ask: "Must this be ultimately designed in all our actions?" },
          { question: 1, ask: "Is communion with God in grace here the best pleasure?" },
        ],
      },
    },
    {
      id: "write",
      title: "Write it",
      text: "In your own words: how do glorifying God and enjoying him belong together? Write it as a note on Psalm 73:25. Your note stays with the verse, so you will meet it again whenever you read the psalm.",
      tip: NOTE_TIP,
      open: { pane: "bible", passage: { book: PSALMS, chapter: 73, verse: 25 } },
      openLabel: "Open Psalm 73:25",
      check: { type: "note", passage: { book: PSALMS, chapter: 73, verse: 25 }, tag: "wsc-1" },
    },
    {
      id: "keep",
      title: "Keep it",
      text: "Learn the answer by heart, and 1 Corinthians 10:31 with it.",
      tip: "Memory brings each card back for review just before you would forget it; Today shows what is due.",
      check: { type: "memory", questions: [1], verse: { book: FIRST_CORINTHIANS, chapter: 10, verse: 31 } },
    },
    {
      id: "pray",
      title: "Pray",
      text: "Pray Psalm 73:25–26 as your own: “Whom have I in heaven but thee? and there is none upon earth that I desire beside thee.” Ask God to make him your chief joy, and to use your ordinary days for his glory.",
      optional: true,
    },
  ],
};
