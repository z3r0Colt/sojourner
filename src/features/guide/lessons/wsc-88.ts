import type { LessonData } from "../course";
import { answer, before, classic, keep, look, p, pray, quiz, read, standards, teaching, write } from "./steps";

export const WSC_88: LessonData = {
  id: "wsc-88",
  title: "The Word read and preached",
  questions: [88, 89, 90],
  intro:
    "Christ gives his benefits through ordinary means: his Word, the sacraments and prayer. The first and chief of them is the Word, read and especially preached. The Catechism also tells us how to hear a sermon, which is a skill few are ever taught.",
  workspace: { passage: p("Neh", 8, 1), study: ["crossrefs"], question: 90 },
  steps: [
    before("How do you listen to a sermon? What do you do before, during and after?", "Before… during… after…"),
    read(
      "They read in the book",
      "Read Nehemiah 8:1–12. Highlight what Ezra and the Levites did with the law, and how the people responded.",
      p("Neh", 8, 1, 12),
      p("Neh", 8, 8),
    ),
    read(
      "Preach the word",
      "Read 2 Timothy 4:1–5. Highlight what Paul charges Timothy to do, and why.",
      p("2Tim", 4, 1, 5),
      p("2Tim", 4, 2),
      { id: "preach", tip: null },
    ),
    answer(
      90,
      "Read Questions 88 to 90. The Spirit makes “the reading, but especially the preaching of the Word, an effectual means of convincing and converting sinners, and of building them up in holiness and comfort.” And to profit from it, “we must attend thereunto with diligence, preparation, and prayer; receive it with faith and love, lay it up in our hearts, and practice it in our lives.”",
    ),
    standards("The Larger Catechism says how the Word is to be read (Question 157) and heard (Question 160). Read Question 160, and compare it with your answer at the start.", "wlc", 160),
    teaching(90, "whyte", "Read Alexander Whyte on Question 90."),
    classic("Watson preaches on the Word as the third way of escaping God’s wrath.", "The Ten Commandments", "The third way to escape the wrath and curse of God", 89, "flavel"),
    look(
      "sermons",
      "Keep what you hear",
      "Open Sermons. Next Lord’s day, start a page for the sermon you hear: its text, its main points, and one thing to practise.",
      { pane: "sermons" },
      { tip: "Sermons is for writing sermons, and for keeping notes on the ones you hear.", optional: true },
    ),
    quiz(
      [
        {
          q: "Which of these does Question 90 not list for hearing the Word profitably?",
          choices: ["Diligence, preparation, and prayer", "Receiving it with faith and love", "Agreeing with the preacher", "Laying it up in our hearts and practising it"],
          answer: 2,
          why: "Question 90. We receive the Word “with faith and love” and test what we hear by Scripture (Acts 17:11), as the Bereans did.",
        },
      ],
      [
        [88, "Is he tied to those means?"],
        [88, "But are we tied to the use of them?"],
        [89, "Will the bare reading and hearing of the Word profit?"],
        [90, "Must we prepare for hearing it?"],
      ],
    ),
    write("Write a note on James 1:22, “be ye doers of the word”: one thing from a recent sermon or reading you have not yet put into practice.", p("Jas", 1, 22), "wsc-88"),
    keep("Learn Questions 88 to 90, and 2 Timothy 4:2.", [88, 89, 90], p("2Tim", 4, 2)),
    pray("Pray in the prayer journal for the next sermon you will hear: for the preacher, and for your own heart to receive it.", "wsc-88"),
  ],
};
