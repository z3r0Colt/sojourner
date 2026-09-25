import { useCallback } from "react";
import { useSetting } from "../../hooks/useSetting";
import { sanitizeTemplates, type NoteTemplate } from "../notes/noteTemplates";
import { calloutBlockHtml, type CalloutKind } from "./editor/callouts";

/**
 * Sermon templates (SB1.6): the shapes a manuscript starts from. Same
 * machinery as note templates -- a shipped list, the reader's own in a
 * setting, nothing written until they change something -- but over two
 * heading levels, since a sermon has points and sub-points.
 */

export const SERMON_TEMPLATES_SETTING = "sermon_templates";

/** A point with an empty paragraph under it. */
function point(heading: string, ...subs: string[]): string {
  return `<h2>${heading}</h2><p></p>${subs.map((s) => `<h3>${s}</h3><p></p>`).join("")}`;
}

/** A point whose body is typed blocks rather than one empty paragraph. */
function blockPoint(heading: string, ...kinds: CalloutKind[]): string {
  return `<h2>${heading}</h2>${kinds.map((k) => calloutBlockHtml(k)).join("")}`;
}

/** A point with a one-line prompt under it, in italics, to be written over. */
function promptPoint(heading: string, prompt: string): string {
  return `<h2>${heading}</h2><p><em>${prompt}</em></p>`;
}

const EIA: CalloutKind[] = ["explanation", "illustration", "application"];

export const DEFAULT_SERMON_TEMPLATES: readonly NoteTemplate[] = [
  {
    name: "Expository",
    html: [
      point("Introduction"),
      point("The text"),
      point("The big idea"),
      point("I.", "Application"),
      point("II.", "Application"),
      point("III.", "Application"),
      point("Conclusion"),
    ].join(""),
  },
  {
    name: "Textual",
    html: [point("Introduction"), point("The text in its setting"), point("What it says"), point("What it means"), point("What it asks of us"), point("Conclusion")].join(""),
  },
  {
    name: "Topical",
    html: [point("The question"), point("What Scripture says"), point("What it does not say"), point("How this changes Monday"), point("Conclusion")].join(""),
  },
  {
    name: "Evangelistic",
    html: [point("Where we stand"), point("Who God is"), point("What we have done"), point("What Christ has done"), point("The call"), point("Come")].join(""),
  },
  {
    name: "Funeral",
    html: [point("Opening Scripture"), point("Thanksgiving for a life"), point("The hope of the gospel"), point("A word to those who grieve"), point("Prayer")].join(""),
  },
  {
    name: "Wedding",
    html: [point("Opening Scripture"), point("What marriage pictures"), point("A charge to the couple"), point("A charge to the congregation"), point("Prayer and blessing")].join(""),
  },
  {
    name: "Bible study",
    html: [point("The passage"), point("Observations"), point("Questions from the text"), point("What it teaches"), point("Discussion questions"), point("Prayer")].join(""),
  },
  // Appended, never inserted: the "Add new shipped templates" button in the
  // templates editor finds what a reader's saved list is missing by name.
  {
    name: "Three points",
    html: [point("Introduction"), blockPoint("I.", ...EIA), blockPoint("II.", ...EIA), blockPoint("III.", ...EIA), point("Conclusion")].join(""),
  },
  {
    name: "Me · We · God · You · We",
    html: [
      promptPoint("Me", "Where I have met this myself: the tension, told honestly."),
      promptPoint("We", "Where all of us meet it: the common ground."),
      `<h2>God</h2><p><em>What the text says about it.</em></p>`,
      promptPoint("You", "What to do about it this week: one step, plainly put."),
      promptPoint("We", "What it would look like if all of us did."),
    ].join(""),
  },
  {
    name: "Verse by verse",
    html: [
      point("Introduction"),
      blockPoint("v. 1", "explanation", "application"),
      blockPoint("v. 2", "explanation", "application"),
      blockPoint("v. 3", "explanation", "application"),
      point("Conclusion"),
    ].join(""),
  },
  {
    name: "Defender's outline",
    html: [
      point("The question"),
      point("The objection, stated fairly"),
      point("What Scripture says"),
      point("The answer"),
      point("Answering the answer"),
      blockPoint("The call", "application"),
    ].join(""),
  },
  {
    name: "Children and youth",
    html: [
      promptPoint("The big question", "One question the whole lesson answers."),
      blockPoint("The story", "illustration"),
      point("The Bible truth"),
      promptPoint("Say it together", "One line to remember, short enough to repeat."),
      blockPoint("Do it this week", "application"),
      point("Prayer"),
    ].join(""),
  },
];

export function sermonTemplatesAreDefault(list: readonly NoteTemplate[]): boolean {
  return (
    list.length === DEFAULT_SERMON_TEMPLATES.length &&
    list.every((t, i) => t.name === DEFAULT_SERMON_TEMPLATES[i].name && t.html === DEFAULT_SERMON_TEMPLATES[i].html)
  );
}

/** The reader's sermon templates: `[templates, setTemplates]`. */
export function useSermonTemplates(): [NoteTemplate[], (next: NoteTemplate[]) => void] {
  const [stored, setStored] = useSetting<unknown>(SERMON_TEMPLATES_SETTING, undefined);
  const templates = stored === undefined ? (DEFAULT_SERMON_TEMPLATES as NoteTemplate[]) : sanitizeTemplates(stored);
  const set = useCallback((next: NoteTemplate[]) => setStored(next), [setStored]);
  return [templates, set];
}
