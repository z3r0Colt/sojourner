import type { LessonData } from "../course";
import { answer, before, classic, keep, p, prayQuietly, quiz, read, standards, teaching, write } from "./steps";

// Unit 1: the Bible, the Confessions, notes and memory only.
export const WSC_2: LessonData = {
  id: "wsc-2",
  title: "The Word of God",
  questions: [2, 3],
  intro:
    "If we were made to glorify and enjoy God, how do we know how to do it? The Catechism answers: God has told us, in the Scriptures, and they are the only rule. Then it says what they teach, and in doing so lays out the plan of the whole Catechism.",
  workspace: { passage: p("2Tim", 3, 14), study: [], question: 2 },
  steps: [
    before("How do you know what God wants of you? Where would you go to find out?", "I would find out by…"),
    read(
      "What Scripture is",
      "Read 2 Timothy 3:14–17. Timothy had known the Scriptures from a child. Highlight what Paul says Scripture is, and what it is able to do.",
      p("2Tim", 3, 14, 17),
      p("2Tim", 3, 15, 17),
    ),
    read(
      "A more sure word",
      "Read 2 Peter 1:16–21. Peter had heard God’s voice from heaven on the holy mount, yet he calls the written word “a more sure word of prophecy”. Highlight where he says the Scriptures came from.",
      p("2Pet", 1, 16, 21),
      p("2Pet", 1, 19, 21),
      { id: "peter", tip: null },
    ),
    answer(
      2,
      "Read Questions 2 and 3. Question 2 names the rule: the Word of God, contained in the Scriptures of the Old and New Testaments, and it is “the only rule”. Question 3 says what they teach: “what man is to believe concerning God, and what duty God requires of man.”\n\nThat is the plan of the whole Catechism. Questions 4 to 38 are what we are to believe; Questions 39 to 107 are the duty God requires.",
    ),
    standards(
      "The Confession begins with Scripture. Read 1.6, on what Scripture is enough for: “The whole counsel of God, concerning all things necessary for his own glory, man’s salvation, faith, and life, is either expressly set down in Scripture, or by good and necessary consequence may be deduced from Scripture: unto which nothing at any time is to be added, whether by new revelations of the Spirit, or traditions of men.”",
      "wcf",
      1,
      6,
      "The Confession on Scripture",
    ),
    teaching(2, "whyte", "Read Alexander Whyte on Question 2. Notice what he makes of the words “the only rule”."),
    classic(
      "Thomas Watson’s sermon on Question 2 asks how it appears that the Scriptures have “a divine authority stamped upon them”, and gives his answers one by one.",
      "A Body of Divinity",
      "WHAT RULE HAS GOD GIVEN TO DIRECT US",
      2,
      "whyte",
      "Resources holds the old books. A step opens one at the right page, and the book remembers where you stopped. Classic readings are optional: take them when you have time.",
    ),
    quiz(
      [
        {
          q: "What does Question 2 call the Word of God?",
          choices: ["The chief rule to direct us", "The only rule to direct us", "The first rule to direct us"],
          answer: 1,
          why: "“The Word of God… is the only rule to direct us how we may glorify and enjoy him.”",
        },
        {
          q: "What do the Scriptures principally teach?",
          choices: ["The history of Israel and the church", "What man is to believe concerning God, and what duty God requires of man", "How to live a good life"],
          answer: 1,
          why: "Question 3. The rest of the Catechism follows those two parts.",
        },
      ],
      [
        [2, "Are the Scriptures of the Old and New Testament the word of God, and a divine revelation?"],
        [2, "Were they indited by the blessed Spirit?"],
        [2, "Is the church’s authority the rule of our faith?"],
        [2, "Is the written word a sufficient rule?"],
        [3, "Is it enough to believe the truth revealed, if we do not the duty that is required?"],
      ],
    ),
    write(
      "In your own words: why can the Scriptures be trusted as the only rule for how to live before God? Write it as a note on 2 Timothy 3:16.",
      p("2Tim", 3, 16),
      "wsc-2",
    ),
    keep("Learn Questions 2 and 3, and 2 Timothy 3:16.", [2, 3], p("2Tim", 3, 16)),
    prayQuietly("Pray Psalm 119:18 before you next open your Bible: “Open thou mine eyes, that I may behold wondrous things out of thy law.”"),
  ],
};
