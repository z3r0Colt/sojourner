import { parseManuscript, sectionsOf } from "./editor/documentModel";
import type { Book, PassageRef, Sermon } from "../../api/types";
import { passageLabel } from "./sermonFormat";

/**
 * The fill-in handout (SB4.3): a pure function from the saved manuscript to
 * the sheet a congregation writes on.
 *
 * Pure so it can be reasoned about and reused: the print region renders
 * what comes back, and nothing about the handout depends on the editor
 * being open. Every word marked as a blank becomes a rule as long as the
 * word it hides, so the sheet's shape is a hint rather than a giveaway; the
 * answer key prints those words in the accent color instead, which is the
 * copy the preacher keeps.
 */

export interface HandoutOptions {
  /** Print the blanked words instead of rules. */
  answerKey?: boolean;
  /** Include the passage text, rather than the reference alone. */
  includePassageText?: boolean;
  /** Rendered passage text by `refKey`, when including it. */
  passageText?: Map<string, string>;
  books?: Book[];
  /** Ruled lines after each point for the listener's own notes. */
  noteLines?: number;
}

export interface HandoutSection {
  /** 2 for a point, 3 for a sub-point, 0 for the opening. */
  level: number;
  heading: string;
  /** The passages this point rests on, as references. */
  references: string[];
  /** The section's prose with its blanks drawn. */
  html: string;
  noteLines: number;
  /** True for the Discussion questions section, which prints last with
   * more room to write. */
  isDiscussion: boolean;
}

export interface Handout {
  title: string;
  bigIdea: string | null;
  text: string;
  line: string;
  sections: HandoutSection[];
}

const DISCUSSION = /discussion/i;

/** Builds the whole handout from a sermon and its document. */
export function buildHandout(sermon: Sermon, options: HandoutOptions = {}): Handout {
  const books = options.books;
  const noteLines = options.noteLines ?? 2;

  const sections = sectionsOf(sermon.body).map<HandoutSection>((section) => {
    const isDiscussion = DISCUSSION.test(section.heading?.text ?? "");
    return {
      level: section.heading?.level ?? 0,
      heading: section.heading?.text ?? "",
      references: referencesIn(section.html, books),
      html: renderSectionBody(section.html, options),
      noteLines: isDiscussion ? noteLines + 2 : noteLines,
      isDiscussion,
    };
  });

  const texts = sermon.passages
    .filter((p) => p.role === "text")
    .map((p) => passageLabel(books, p))
    .join("; ");

  return {
    title: sermon.title,
    bigIdea: sermon.big_idea?.trim() || null,
    text: texts,
    line: [sermon.preach_date, sermon.venue].filter(Boolean).join(" · "),
    // The discussion questions, wherever they were written, print last.
    sections: [...sections.filter((s) => !s.isDiscussion), ...sections.filter((s) => s.isDiscussion)],
  };
}

/** The passage blocks inside one section, as references. */
function referencesIn(html: string, books: Book[] | undefined): string[] {
  const root = parseManuscript(html).getElementById("sermon-root");
  if (!root) return [];
  return Array.from(root.querySelectorAll('[data-type="passage"]'))
    .map((el) => refOf(el))
    .filter((r): r is PassageRef => r !== null)
    .map((r) => passageLabel(books, { book_id: r.book_id, chapter: r.chapter, verse_start: r.verse_start, verse_end: r.verse_end }));
}

function refOf(el: Element): PassageRef | null {
  const bookId = Number(el.getAttribute("data-book-id"));
  const chapter = Number(el.getAttribute("data-chapter"));
  if (!bookId || !chapter) return null;
  const start = Number(el.getAttribute("data-verse-start")) || 1;
  const end = Number(el.getAttribute("data-verse-end")) || start;
  return { book_id: bookId, chapter, verse_start: start, verse_end: Math.max(start, end) };
}

/** Which of `.handout-blank-w1`..`w5` a word of this length gets. */
function blankWidthClass(length: number): string {
  if (length <= 4) return "handout-blank-w1";
  if (length <= 8) return "handout-blank-w2";
  if (length <= 12) return "handout-blank-w3";
  if (length <= 18) return "handout-blank-w4";
  return "handout-blank-w5";
}

/**
 * One section's prose, ready for paper: the heading dropped (the sheet
 * prints it itself), every blank drawn as a rule or as the key, citations
 * kept as quotations, and passage blocks reduced to their reference -- or
 * to the verse text when the preacher wants the congregation to have it.
 */
function renderSectionBody(html: string, options: HandoutOptions): string {
  const doc = parseManuscript(html);
  const root = doc.getElementById("sermon-root");
  if (!root) return "";

  // The sheet prints the heading above the body, so drop the one inside it.
  const first = root.firstElementChild;
  if (first && (first.tagName === "H2" || first.tagName === "H3")) first.remove();

  for (const block of Array.from(root.querySelectorAll('[data-type="passage"]'))) {
    const ref = refOf(block);
    const replacement = doc.createElement("p");
    replacement.className = "handout-passage";
    const label = ref
      ? passageLabel(options.books, { book_id: ref.book_id, chapter: ref.chapter, verse_start: ref.verse_start, verse_end: ref.verse_end })
      : "";
    const text =
      options.includePassageText && ref
        ? options.passageText?.get(`${ref.book_id}:${ref.chapter}:${ref.verse_start}:${ref.verse_end}`)
        : undefined;
    replacement.textContent = text ? `${label} — ${text}` : label;
    block.replaceWith(replacement);
  }

  for (const blank of Array.from(root.querySelectorAll("span[data-blank]"))) {
    const word = (blank.textContent ?? "").trim();
    if (options.answerKey) {
      blank.className = "handout-blank-key";
    } else {
      // A rule roughly as wide as the word it hides, floored so a
      // three-letter word still leaves something to write on. The width is a
      // class rather than an inline `style`, which the display sanitizer
      // strips; five buckets are enough, and keep the widths out of the
      // markup the reader's file carries.
      blank.className = `handout-blank ${blankWidthClass(word.length)}`;
      blank.textContent = String.fromCharCode(160);
    }
  }

  return root.innerHTML;
}
