import type { LessonData } from "../course";
import { answer, before, classic, keep, p, pray, quiz, read, sing, standards, teaching, write } from "./steps";

// New tool: the prayer journal.
export const WSC_16: LessonData = {
  id: "wsc-16",
  title: "Sin and misery",
  questions: [16, 17, 18, 19],
  intro:
    "Adam did not fall alone. The covenant was made with him for his posterity, so all mankind fell with him into what the Catechism calls an estate of sin and misery. These four answers are the hardest news in the Catechism, and it does not soften them: the next lesson is the good news, and it means most to those who have heard this first.",
  workspace: { passage: p("Rom", 5, 12), study: ["crossrefs"], question: 18 },
  steps: [
    before("Are people basically good? Write what you think, and why.", "I think people are…"),
    read("In Adam", "Read Romans 5:12–14 and highlight how sin and death came to all men.", p("Rom", 5, 12, 14), p("Rom", 5, 12)),
    read(
      "Dead in sins",
      "Read Ephesians 2:1–3. Highlight what Paul says we were “by nature”.",
      p("Eph", 2, 1, 3),
      p("Eph", 2, 1, 3),
      { id: "dead", tip: null },
    ),
    answer(
      18,
      "Read Questions 16 to 19. Question 18 lists what makes the estate sinful: “the guilt of Adam’s first sin, the want of original righteousness, and the corruption of his whole nature, which is commonly called original sin; together with all actual transgressions which proceed from it.” Question 19 lists the misery: lost communion with God, his wrath and curse, the miseries of this life, death, and “the pains of hell for ever.”",
    ),
    standards(
      "Read the Confession 6.4: from this original corruption “we are utterly indisposed, disabled, and made opposite to all good, and wholly inclined to all evil,” and from it “do proceed all actual transgressions.”",
      "wcf",
      6,
      4,
      "The Confession",
    ),
    teaching(18, "whyte", "Read Alexander Whyte on Question 18, on each of its four parts."),
    classic("Read Watson’s sermon on original sin.", "A Body of Divinity", "DID ALL MANKIND FALL IN ADAM'S FIRST TRANSGRESSION", 16, "whyte"),
    quiz(
      [
        {
          q: "Which of these does Question 18 not list as part of the sinfulness of man’s estate?",
          choices: ["The guilt of Adam’s first sin", "The want of original righteousness", "The corruption of his whole nature", "The bad example of others"],
          answer: 3,
          why: "The sinfulness is in us: Adam’s guilt, the want of original righteousness, a corrupt nature, and the sins that proceed from it. We do not become sinners only by copying others.",
        },
      ],
      [
        [16, "Was he a public person?"],
        [17, "Is mankind in a state of sin?"],
        [18, "Are we all born in sin?"],
        [19, "Did they lose communion with God?"],
      ],
    ),
    write("Write a note on Ephesians 2:3: what “by nature the children of wrath” says about you, apart from Christ. Then read verse 4, and add what it says.", p("Eph", 2, 3), "wsc-16"),
    keep("Learn Questions 16 to 19, and Romans 5:12.", [16, 17, 18, 19], p("Rom", 5, 12)),
    sing(130, "Sing Psalm 130: “If thou, LORD, shouldest mark iniquities, O Lord, who shall stand? But there is forgiveness with thee.”"),
    pray(
      "Write a prayer of confession in the prayer journal: not only sins you have done, but the heart they come from. End with Psalm 130:4, “But there is forgiveness with thee, that thou mayest be feared.”",
      "wsc-16",
      "The prayer journal keeps your prayers by date. Adoration, confession, thanksgiving, supplication is one order to follow; or write freely.",
    ),
  ],
};
