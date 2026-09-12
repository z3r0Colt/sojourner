import type { Editor } from "@tiptap/react";
import type { PassageRef } from "../../api/types";

/**
 * The passage the writer is working on, for a sermon pane that leads its
 * link group (SB1.1): the block the cursor is in, or -- when the cursor is
 * in prose -- the first passage of the section it sits in, so putting the
 * caret on "II. The call" turns the Bible beside it to that point's text.
 *
 * Pure apart from reading the editor's document, so the rule is one place
 * and the pane only decides whether to publish.
 */
export function passageAtCursor(editor: Editor): PassageRef | null {
  const { doc, selection } = editor.state;
  const cursor = selection.from;

  const passages: { pos: number; end: number; ref: PassageRef }[] = [];
  const headings: number[] = [];

  doc.descendants((node, pos) => {
    if (node.type.name === "passage") {
      const ref = refOf(node.attrs);
      if (ref) passages.push({ pos, end: pos + node.nodeSize, ref });
      return false;
    }
    if (node.type.name === "heading") {
      headings.push(pos);
      return false;
    }
    return true;
  });

  if (passages.length === 0) return null;

  // In (or immediately beside) a block: that block wins.
  const inside = passages.find((p) => cursor >= p.pos && cursor <= p.end);
  if (inside) return inside.ref;

  // Otherwise the section the cursor sits in: from the heading at or before
  // it to the next heading.
  const sectionStart = headings.filter((h) => h <= cursor).pop() ?? 0;
  const sectionEnd = headings.find((h) => h > sectionStart) ?? doc.content.size;
  const inSection = passages.find((p) => p.pos >= sectionStart && p.pos < sectionEnd);
  return inSection?.ref ?? null;
}

function refOf(attrs: Record<string, unknown>): PassageRef | null {
  const bookId = Number(attrs.bookId);
  const chapter = Number(attrs.chapter);
  if (!bookId || !chapter) return null;
  const start = Number(attrs.verseStart) || 1;
  const end = Number(attrs.verseEnd) || start;
  return { book_id: bookId, chapter, verse_start: start, verse_end: Math.max(start, end) };
}
