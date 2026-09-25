import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { neighborMove, sectionMove, type BlockLevel, type DropSide, type SectionMove } from "./documentModel";

/**
 * Moving a point in the live editor: documentModel's `sectionMove` says
 * which top-level blocks go where, and this does it as one transaction --
 * one Ctrl+Z puts it back, and the passage blocks inside keep their node
 * views rather than being torn down and rebuilt as a `setContent` would.
 */

interface TopBlock {
  level: BlockLevel;
  pos: number;
}

function topBlocks(editor: Editor): TopBlock[] {
  const out: TopBlock[] = [];
  editor.state.doc.forEach((node, offset) => {
    const level = node.type.name === "heading" ? (node.attrs.level as number) : null;
    out.push({ level: level === 2 || level === 3 ? level : null, pos: offset });
  });
  return out;
}

function apply(editor: Editor, blocks: TopBlock[], move: SectionMove | null): boolean {
  if (!move) return false;
  const { state } = editor;
  const posOf = (i: number) => (i < blocks.length ? blocks[i].pos : state.doc.content.size);
  const from = posOf(move.start);
  const to = posOf(move.end);
  const slice = state.doc.slice(from, to);
  const tr = state.tr.delete(from, to);
  const at = tr.mapping.map(posOf(move.insertAt));
  tr.insert(at, slice.content);
  // The caret goes to the moved heading, so a second Alt+Shift+↑ keeps going.
  tr.setSelection(TextSelection.near(tr.doc.resolve(at + 1)));
  tr.scrollIntoView();
  editor.view.dispatch(tr);
  return true;
}

/** Drops heading `from`'s section before or after heading `target`. */
export function moveSectionTo(editor: Editor, from: number, target: number, side: DropSide): boolean {
  const blocks = topBlocks(editor);
  return apply(editor, blocks, sectionMove(blocks.map((b) => b.level), from, target, side));
}

/** Moves heading `from`'s section one step up or down. */
export function moveSectionBy(editor: Editor, from: number, direction: -1 | 1): boolean {
  const blocks = topBlocks(editor);
  return apply(editor, blocks, neighborMove(blocks.map((b) => b.level), from, direction));
}

/** Which heading the cursor is under, by its index among the top-level
 * headings -- the same count the Outline panel uses -- or null above the
 * first one. */
export function headingAtCursor(editor: Editor): number | null {
  const cursor = editor.state.selection.from;
  let index = 0;
  let active: number | null = null;
  editor.state.doc.forEach((node, offset) => {
    if (node.type.name !== "heading") return;
    if (offset <= cursor) active = index;
    index += 1;
  });
  return active;
}
