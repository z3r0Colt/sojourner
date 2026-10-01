import type { LessonData } from "../course";
import { answer, before, classic, keep, p, pray, quiz, read, sing, standards, teaching, write } from "./steps";

export const WSC_49: LessonData = {
  id: "wsc-49",
  title: "The second commandment",
  questions: [49, 50, 51, 52],
  intro:
    "The first commandment tells us whom to worship; the second, how. At the foot of Sinai Israel made a golden calf and called it a feast to the LORD: the right God, worshipped the wrong way. The Catechism draws from this commandment the rule that God is to be worshipped only as he has appointed in his Word.",
  workspace: { passage: p("Exod", 32, 1), study: ["crossrefs"], question: 50 },
  steps: [
    before("Does it matter how we worship God, as long as we mean well?", "I think it matters / does not matter because…"),
    read(
      "A feast to the LORD",
      "Read Exodus 32:1–10. Highlight what Aaron calls the day, and what God calls what they did.",
      p("Exod", 32, 1, 10),
      p("Exod", 32, 4, 8),
    ),
    read(
      "Add not thereto",
      "Read Deuteronomy 12:29–32, and highlight the last verse.",
      p("Deut", 12, 29, 32),
      p("Deut", 12, 32),
      { id: "add", tip: null },
    ),
    answer(
      50,
      "Read Questions 49 to 52. The commandment requires “the receiving, observing, and keeping pure and entire, all such religious worship and ordinances as God hath appointed in his Word.” It forbids “the worshipping of God by images, or any other way not appointed in his Word.” And it gives three reasons: “God’s sovereignty over us, his propriety in us, and the zeal he hath to his own worship.”",
    ),
    standards(
      "Read the Confession 21.1, the plainest statement of this rule: “the acceptable way of worshipping the true God is instituted by himself, and so limited to his own revealed will, that he may not be worshipped according to the imaginations and devices of men, or the suggestions of Satan, under any visible representations or any other way not prescribed in the Holy Scripture.” Then read 21.5, the parts of ordinary worship.",
      "wcf",
      21,
      1,
      "The Confession",
    ),
    teaching(50, "fisher", "Read Fisher’s Catechism on Question 50."),
    classic("Read Watson’s sermon on the second commandment.", "The Ten Commandments", "Thou shalt not make unto thee any graven image", 49, "whyte"),
    quiz(
      [
        {
          q: "According to Question 51, what does the second commandment forbid besides worship by images?",
          choices: ["Nothing else", "Any other way not appointed in his Word", "Worship on any day but the sabbath"],
          answer: 1,
          why: "“The worshipping of God by images, or any other way not appointed in his Word.”",
        },
      ],
      [
        [49, "Are we Christians forbidden to worship images?"],
        [50, "But does it teach us sufficiently how to worship him?"],
        [51, "Is it possible to make an image of God?"],
        [52, "Has God a sovereignty over us?"],
      ],
    ),
    write("Write a note on John 4:24: what it means to worship God “in spirit and in truth”, and how that shapes your own worship.", p("John", 4, 24), "wsc-49"),
    keep("Learn Questions 49 to 52, and Deuteronomy 12:32. Question 49 is the commandment itself, word for word.", [49, 50, 51, 52], p("Deut", 12, 32)),
    sing(95, "Sing Psalm 95: “O come, let us worship and bow down: let us kneel before the LORD our maker.”"),
    pray("Pray in the prayer journal for your church’s worship next Lord’s day: that it would be pure, reverent, and glad.", "wsc-49"),
  ],
};
