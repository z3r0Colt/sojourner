import type { LessonData } from "../course";
import { answer, before, classic, keep, look, p, pray, quiz, read, sing, standards, teaching, write } from "./steps";

// Unit 4 begins: the way of escape.
export const WSC_85: LessonData = {
  id: "wsc-85",
  title: "Faith and repentance",
  questions: [85, 86, 87],
  intro:
    "The law has shown us our sin and what it deserves. How do we escape? The Catechism answers: faith in Jesus Christ, repentance unto life, and the diligent use of the means of grace. This lesson takes the first two, the two hands of the soul: one receiving Christ, the other letting go of sin.",
  workspace: { passage: p("Luke", 15, 11), study: ["crossrefs"], question: 86 },
  steps: [
    before("What is faith? And what is repentance? Write a sentence on each.", "Faith is… Repentance is…"),
    read(
      "He came to himself",
      "Read Luke 15:11–24. Highlight what the son realises, what he says, and what he does, in verses 17 to 20.",
      p("Luke", 15, 11, 24),
      p("Luke", 15, 17, 20),
    ),
    read(
      "Him that cometh",
      "Read John 6:35–40 and highlight Christ’s promise to everyone who comes to him.",
      p("John", 6, 35, 40),
      p("John", 6, 37),
      { id: "come", tip: null },
    ),
    answer(
      86,
      "Read Questions 85 to 87. Faith is “a saving grace, whereby we receive and rest upon him alone for salvation, as he is offered to us in the gospel.” Repentance is turning from sin “unto God, with full purpose of, and endeavour after, new obedience,” out of “a true sense of his sin, and apprehension of the mercy of God in Christ.” Notice that the mercy of God is part of repentance: we turn because there is somewhere to turn to.",
    ),
    standards("Read the Confession 15.3: repentance is not “any satisfaction for sin, or any cause of the pardon thereof”, yet it is so necessary that none may expect pardon without it.", "wcf", 15, 3, "The Confession"),
    teaching(87, "whyte", "Read Alexander Whyte on Question 87."),
    classic("Watson preaches on faith as the first thing God requires to escape his wrath.", "The Ten Commandments", "What does God require of us, that we may escape his wrath and curse due to us for our sin", 86, "whyte"),
    look(
      "cited",
      "What the old writers said",
      "See where your library quotes Isaiah 55:7, “let him return unto the LORD, and he will have mercy upon him”. Read one of them.",
      { pane: "citations", passage: p("Isa", 55, 7) },
      { optional: true },
    ),
    quiz(
      [
        {
          q: "What does faith do, according to Question 86?",
          choices: ["Earns salvation by believing hard enough", "Receives and rests upon Christ alone for salvation", "Believes that God exists"],
          answer: 1,
          why: "“Whereby we receive and rest upon him alone for salvation, as he is offered to us in the gospel.”",
        },
      ],
      [
        [86, "Is faith in Christ a grace?"],
        [86, "Is it a saving grace?"],
        [87, "Is repentance required of every one of us?"],
      ],
    ),
    write("Write a note on Luke 15:20, where the father runs. What does it tell you about how God receives those who repent?", p("Luke", 15, 20), "wsc-85"),
    keep("Learn Questions 85 to 87, and John 6:37.", [85, 86, 87], p("John", 6, 37)),
    sing(51, "Sing Psalm 51 again, as a prayer of repentance: “The sacrifices of God are a broken spirit.”"),
    pray("Turn to God in the prayer journal: name a sin you want to leave, and rest on Christ alone for your forgiveness.", "wsc-85"),
  ],
};
