import type { LessonData } from "../course";
import { HIGHLIGHT_TIP, NOTE_TIP } from "./tips";

const EXODUS = 2;
const JOHN = 43;

// The first lesson of unit 2; the new tool is cross references.
export const WSC_4: LessonData = {
  id: "wsc-4",
  title: "What God is",
  questions: [4],
  intro:
    "Charles Hodge called this answer “probably the best definition ever penned by man.” It is built on Christ’s words to the woman at the well, and filled out from the whole of Scripture. In this lesson you hear God describe himself to Moses, trace that description through the rest of the Bible, and see how the Catechism’s answer is put together.",
  workspace: {
    passage: { book: EXODUS, chapter: 34, verse: 5 },
    study: ["crossrefs"],
    question: 4,
  },
  steps: [
    {
      id: "before",
      title: "Before you read",
      text: "What is God like? Write down the words you would use to describe him.",
      check: { type: "answer", placeholder: "God is…" },
    },
    {
      id: "observe",
      title: "God names himself",
      text: "Moses asked to see God’s glory (Exodus 33:18). Read what God proclaimed as he passed by, in Exodus 34:5–7. Highlight what God says about himself.",
      tip: HIGHLIGHT_TIP,
      open: { pane: "bible", passage: { book: EXODUS, chapter: 34, verse: 5, to: 7 } },
      openLabel: "Open Exodus 34",
      check: { type: "highlight", passage: { book: EXODUS, chapter: 34, verse: 6, to: 7 } },
    },
    {
      id: "scripture",
      title: "Scripture with Scripture",
      text: "The rest of the Bible keeps coming back to these verses. Follow the cross references from Exodus 34:6 to Numbers 14:18, Psalm 86:15, Psalm 103:8, Joel 2:13 and Jonah 4:2. Who quotes it, and why? Notice Jonah, who quotes it as a complaint.",
      tip: "Cross references list other verses on the same subject, strongest first. They follow whichever verse you click in the Bible pane.",
      open: { pane: "crossrefs", passage: { book: EXODUS, chapter: 34, verse: 6 } },
      check: { type: "opened" },
    },
    {
      id: "spirit",
      title: "God is a Spirit",
      text: "Read John 4:19–24. The woman asks where God must be worshipped: on this mountain, or at Jerusalem? What does Jesus’ answer, “God is a Spirit,” change about worship?",
      open: { pane: "bible", passage: { book: JOHN, chapter: 4, verse: 19, to: 24 } },
      openLabel: "Open John 4",
      check: { type: "opened" },
    },
    {
      id: "answer",
      title: "The Catechism’s answer",
      text: "Now read Question 4, and look at how it is built. After “God is a Spirit” come three words, infinite, eternal and unchangeable, and then seven perfections: his being, wisdom, power, holiness, justice, goodness and truth. The three words describe each of the seven. Try reading it that way: God is infinite in his wisdom, eternal in his wisdom, unchangeable in his wisdom; and so on through the list.",
      open: { pane: "westminster", doc: "wsc", n: 4 },
      check: { type: "opened" },
    },
    {
      id: "standards",
      title: "The Larger Catechism and the Confession",
      text: "The Larger Catechism (Question 7) and the Confession (chapter 2) say more. Read the Larger Catechism’s answer, then follow “In the other Standards” to Confession 2.1. Which words in the Confession’s list would you not have thought to say?",
      open: { pane: "westminster", doc: "wlc", n: 7 },
      openLabel: "Open WLC 7",
      check: { type: "opened" },
    },
    {
      id: "teaching",
      title: "Teaching",
      text: "Read Alexander Whyte on Question 4. He quotes the Westminster Assembly’s own minutes for 22 September 1646, where the divines settled the question “Hath God any body, or is He to be seen with bodily eyes?” with the answer “God is a Spirit, invisible, without body or bodily parts, not like a man or any other creature.”",
      open: { pane: "westminster", doc: "wsc", n: 4, commentary: "whyte" },
      openLabel: "Read Whyte on Q4",
      check: { type: "opened" },
    },
    {
      id: "check",
      title: "Check your understanding",
      text: "One question on the shape of the answer, then some of Matthew Henry’s questions from A Scripture Catechism (1703), each answered from Scripture.",
      check: {
        type: "quiz",
        questions: [
          {
            q: "Which words in the answer describe every one of God’s seven perfections?",
            choices: ["Spirit, being and truth", "Infinite, eternal and unchangeable", "Wisdom, power and holiness"],
            answer: 1,
            why: "He is infinite, eternal and unchangeable in each of them: in his being, wisdom, power, holiness, justice, goodness and truth.",
          },
        ],
        henry: [
          { question: 4, ask: "Has he a body as we have?" },
          { question: 4, ask: "Is he contained in any place?" },
          { question: 4, ask: "Is it well for us that he is unchangeable?" },
          { question: 4, ask: "Can any thing be hid from him?" },
          { question: 4, ask: "Is this a complete description of God?" },
        ],
      },
    },
    {
      id: "write",
      title: "Write it",
      text: "Choose one of the seven perfections. Write, as a note on Exodus 34:6, what it means for you that God is infinite, eternal and unchangeable in it: whether it comforts you, or warns you, or both.",
      tip: NOTE_TIP,
      open: { pane: "bible", passage: { book: EXODUS, chapter: 34, verse: 6 } },
      openLabel: "Open Exodus 34:6",
      check: { type: "note", passage: { book: EXODUS, chapter: 34, verse: 6, to: 7 }, tag: "wsc-4" },
    },
    {
      id: "keep",
      title: "Keep it",
      text: "Learn the answer by heart, and John 4:24 with it.",
      check: { type: "memory", questions: [4], verse: { book: JOHN, chapter: 4, verse: 24 } },
    },
    {
      id: "pray",
      title: "Pray",
      text: "Before asking God for anything, praise him for what he is. Go through the seven perfections slowly, one at a time, and thank him for each.",
      optional: true,
    },
  ],
};
