import { useCallback } from "react";
import type { Editor } from "@tiptap/react";
import { useSetting } from "../../hooks/useSetting";

/**
 * Note templates (F2.1): headed sections an empty note editor can start
 * from. The shipped set lives here; the reader's own list (renamed,
 * reordered, added to) is the setting `note_templates`, so it survives a
 * reinstall and travels with backups. Nothing is written until the reader
 * changes something, so an install that never touches them keeps getting
 * the shipped defaults.
 */

export interface NoteTemplate {
  name: string;
  /** Editor HTML: `<h3>` headings with empty paragraphs to type into. */
  html: string;
}

export const NOTE_TEMPLATES_SETTING = "note_templates";

function sections(...headings: string[]): string {
  return headings.map((h) => `<h3>${h}</h3><p></p>`).join("");
}

export const DEFAULT_NOTE_TEMPLATES: readonly NoteTemplate[] = [
  { name: "Observation / Interpretation / Application", html: sections("Observation", "Interpretation", "Application") },
  { name: "Question and answer", html: sections("Question", "Answer") },
  { name: "Sermon outline", html: `${sections("Text", "Proposition")}<h3>Points</h3><ol><li><p></p></li></ol>${sections("Application")}` },
  { name: "Prayer response", html: sections("What this passage shows about God", "My response", "Prayer") },
];

function isTemplate(v: unknown): v is NoteTemplate {
  return typeof v === "object" && v !== null && typeof (v as NoteTemplate).name === "string" && typeof (v as NoteTemplate).html === "string";
}

/** Drops anything in a stored list that is not a usable template. */
export function sanitizeTemplates(raw: unknown): NoteTemplate[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isTemplate).map((t) => ({ name: t.name.trim() || "Untitled template", html: t.html }));
}

export function templatesAreDefault(list: readonly NoteTemplate[]): boolean {
  return list.length === DEFAULT_NOTE_TEMPLATES.length && list.every((t, i) => t.name === DEFAULT_NOTE_TEMPLATES[i].name && t.html === DEFAULT_NOTE_TEMPLATES[i].html);
}

/** The reader's templates: `[templates, setTemplates]`. Defaults until the
 * setting is written; a stored list is sanitized so a hand-edited value
 * cannot break the editor. */
export function useNoteTemplates(): [NoteTemplate[], (next: NoteTemplate[]) => void] {
  const [stored, setStored] = useSetting<unknown>(NOTE_TEMPLATES_SETTING, undefined);
  const templates = stored === undefined ? (DEFAULT_NOTE_TEMPLATES as NoteTemplate[]) : sanitizeTemplates(stored);
  const set = useCallback((next: NoteTemplate[]) => setStored(next), [setStored]);
  return [templates, set];
}

/** True for the content tiptap produces for a note with nothing typed. */
export function isEmptyNoteHtml(html: string): boolean {
  return html.replace(/<p><\/p>/g, "").trim() === "";
}

/** Replaces the editor's content with a template and puts the caret in its
 * first empty paragraph, so typing can start at once. */
export function applyTemplate(editor: Editor, template: NoteTemplate): void {
  editor.commands.setContent(template.html, { emitUpdate: true });
  let pos: number | null = null;
  editor.state.doc.descendants((node, p) => {
    if (pos != null) return false;
    if (node.type.name === "paragraph" && node.content.size === 0) {
      pos = p + 1;
      return false;
    }
    return true;
  });
  editor.chain().focus(pos ?? "end").run();
}
