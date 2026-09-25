import { create } from "zustand";
import { bookName } from "../../lib/passage";
import { escapeHtml } from "../../lib/escapeHtml";
import { passageBlockHtml } from "./editor/documentModel";
import type { Book, PassageRef, SermonIdea, SermonIdeaInput } from "../../api/types";

/**
 * The sermon idea inbox (USER_MIGRATION_0022): a thought caught before there
 * is a sermon for it. "Capture a sermon idea" works from anywhere -- the Go
 * to box, its shortcut, or a selection in the Bible -- and the modal that
 * takes it is mounted once in the shell, like the illustration capture.
 */

/** What a capture hands the modal: the words so far, and the passage it
 * came from, when it came from one. */
export interface IdeaDraft {
  body: string;
  ref: PassageRef | null;
  sourceLabel: string | null;
}

interface IdeaCaptureState {
  /** The idea being written, or null with the modal closed. `editing` is
   * the saved idea when this is an edit rather than a capture. */
  open: { draft: IdeaDraft; editing: SermonIdea | null; onSaved?: () => void } | null;
  capture: (draft?: Partial<IdeaDraft>, onSaved?: () => void) => void;
  edit: (idea: SermonIdea) => void;
  close: () => void;
}

export const useIdeaCapture = create<IdeaCaptureState>((set) => ({
  open: null,
  capture: (draft, onSaved) =>
    set({ open: { draft: { body: "", ref: null, sourceLabel: null, ...draft }, editing: null, onSaved } }),
  edit: (idea) =>
    set({ open: { draft: { body: idea.body, ref: ideaRef(idea), sourceLabel: idea.source_label }, editing: idea } }),
  close: () => set({ open: null }),
}));

/** Opens the idea box; `onSaved` runs once the idea is kept (the quick box
 * that handed its words over empties then, and not before). */
export function captureSermonIdea(draft?: Partial<IdeaDraft>, onSaved?: () => void): void {
  useIdeaCapture.getState().capture(draft, onSaved);
}

/** The idea's passage, when it has one. A chapter with no verses is the
 * whole chapter, the way a typed "Romans 8" is. */
export function ideaRef(idea: Pick<SermonIdea, "book_id" | "chapter" | "verse_start" | "verse_end">): PassageRef | null {
  if (idea.book_id == null || idea.chapter == null) return null;
  const start = idea.verse_start ?? 1;
  const end = idea.verse_end ?? (idea.verse_start == null ? 999 : start);
  return { book_id: idea.book_id, chapter: idea.chapter, verse_start: start, verse_end: Math.max(start, end) };
}

/** "Exodus 20", "Exodus 20:2", or "Exodus 20:2-3". */
export function ideaRefLabel(books: Book[] | undefined, idea: Pick<SermonIdea, "book_id" | "chapter" | "verse_start" | "verse_end">): string {
  if (idea.book_id == null || idea.chapter == null) return "";
  const base = `${bookName(books, idea.book_id)} ${idea.chapter}`;
  if (idea.verse_start == null) return base;
  const end = idea.verse_end != null && idea.verse_end !== idea.verse_start ? `-${idea.verse_end}` : "";
  return `${base}:${idea.verse_start}${end}`;
}

/** The saved shape of a reference: a whole chapter keeps no verses. */
export function ideaInput(body: string, ref: PassageRef | null, sourceLabel: string | null): SermonIdeaInput {
  const wholeChapter = ref != null && ref.verse_start === 1 && ref.verse_end >= 999;
  return {
    body: body.trim(),
    book_id: ref?.book_id ?? null,
    chapter: ref?.chapter ?? null,
    verse_start: ref && !wholeChapter ? ref.verse_start : null,
    verse_end: ref && !wholeChapter ? ref.verse_end : null,
    source_label: sourceLabel,
  };
}

/** The idea as manuscript markup: its words as paragraphs, then its passage
 * as a live block -- what lands where it is dropped or inserted. */
export function ideaHtml(idea: Pick<SermonIdea, "body" | "book_id" | "chapter" | "verse_start" | "verse_end">): string {
  const paragraphs = idea.body
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p.trim()).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const ref = ideaRef(idea);
  return paragraphs + (ref ? passageBlockHtml(ref) : "");
}

/** The drag type of an idea row; the manuscript reads `text/html` instead. */
export const IDEA_MIME = "application/x-sojourner-idea";
