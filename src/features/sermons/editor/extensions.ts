import { Extension, Mark, Node, mergeAttributes, type Editor } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { liftTarget } from "@tiptap/pm/transform";
import { PassageBlock } from "./PassageBlock";
import { SourceBlock } from "./SourceBlock";
import { CalloutBlock } from "./CalloutBlock";
import { CALLOUT_KINDS, isCalloutKind, type CalloutKind } from "./callouts";
import { headingAtCursor, moveSectionBy } from "./moveSection";

/** An attribute stored as a `data-` string on the saved HTML and read back
 * as a number, so the document is self-describing: the handout, the slide
 * generator, and the print view all read the same markup without running
 * the editor. */
function numberAttr(dataName: string) {
  return {
    default: null as number | null,
    parseHTML: (element: HTMLElement) => {
      const raw = element.getAttribute(dataName);
      const n = raw == null ? NaN : Number(raw);
      return Number.isFinite(n) ? n : null;
    },
    renderHTML: (attributes: Record<string, unknown>) => {
      const key = dataName.replace(/^data-/, "").replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());
      const value = attributes[key];
      return value == null ? {} : { [dataName]: String(value) };
    },
  };
}

function stringAttr(dataName: string, fallback: string | null = null) {
  return {
    default: fallback,
    parseHTML: (element: HTMLElement) => element.getAttribute(dataName) ?? fallback,
    renderHTML: (attributes: Record<string, unknown>) => {
      const key = dataName.replace(/^data-/, "").replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());
      const value = attributes[key];
      return value == null || value === "" ? {} : { [dataName]: String(value) };
    },
  };
}

/** A live passage. The block is an atom holding only a reference; the node
 * view fetches the words in the sermon's translation (Q2), so the verse text
 * is never stored in the body and a change of translation rewrites every
 * block at once. `translationId` pins one block to another translation for
 * a comparison. */
export const PassageNode = Node.create({
  name: "passage",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      bookId: numberAttr("data-book-id"),
      chapter: numberAttr("data-chapter"),
      verseStart: numberAttr("data-verse-start"),
      verseEnd: numberAttr("data-verse-end"),
      translationId: numberAttr("data-translation-id"),
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="passage"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "passage" })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(PassageBlock);
  },
});

/** A citation with editable content and a remembered source identity. */
export const SourceNode = Node.create({
  name: "source",
  group: "block",
  content: "block+",
  defining: true,
  draggable: true,
  // StarterKit's blockquote matches every <blockquote>, so a citation has
  // to be tried first or it is parsed as an ordinary quotation and loses
  // the source identity that makes "Open source" possible.
  priority: 200,

  addAttributes() {
    return {
      kind: stringAttr("data-kind", "resource"),
      refId: stringAttr("data-ref-id"),
      label: stringAttr("data-label", ""),
    };
  },

  parseHTML() {
    return [{ tag: 'blockquote[data-type="source"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["blockquote", mergeAttributes(HTMLAttributes, { "data-type": "source" }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(SourceBlock);
  },
});

/** A typed block (callouts.ts): explanation, illustration, application,
 * transition, or the writer's own kind, holding ordinary paragraphs. Its
 * shortcut lives in SermonHeadingKeys, below.
 *
 * Anything a point says may go inside one -- except a point. A heading in a
 * block is not one of the manuscript's own headings (Q3), so it would drop
 * out of the outline, the slides, and preaching mode's pages without a word;
 * the schema refuses it, so Ctrl+Alt+1 inside a block does nothing and a
 * pasted heading lands after the block. Nor a block inside a block. */
export const CalloutNode = Node.create({
  name: "callout",
  group: "block",
  content: "(paragraph | bulletList | orderedList | blockquote | codeBlock | horizontalRule | passage | source)+",
  defining: true,
  draggable: true,

  addAttributes() {
    return {
      kind: stringAttr("data-kind", "explanation"),
      label: stringAttr("data-label"),
    };
  },

  parseHTML() {
    return [{ tag: 'aside[data-type="callout"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["aside", mergeAttributes(HTMLAttributes, { "data-type": "callout" }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CalloutBlock);
  },
});

/**
 * Sets the selection apart as a typed block of `kind`, or, inside one
 * already, changes that block's kind. False, doing nothing, when the
 * selection takes in a point or sub-point: a heading inside a block is no
 * longer one of the manuscript's own headings, so the point would drop out
 * of the outline, the slides, and preaching mode's pages without a word.
 */
export function setCallout(editor: Editor, kind: CalloutKind): boolean {
  if (editor.isActive("callout")) return editor.chain().focus().updateAttributes("callout", { kind }).run();
  const { from, to } = editor.state.selection;
  let takesHeading = false;
  editor.state.doc.nodesBetween(from, to, (node) => {
    if (node.type.name === "heading") takesHeading = true;
    return !takesHeading;
  });
  if (takesHeading) return false;
  return editor.chain().focus().wrapIn("callout", { kind }).run();
}

/** Returns the whole typed block the cursor is in to plain text -- all of
 * it, not only the selected paragraphs, which `lift` alone would split out
 * of the middle and leave two blocks behind. */
export function unsetCallout(editor: Editor): boolean {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth);
    if (node.type.name !== "callout") continue;
    const start = $from.before(depth);
    const doc = editor.state.doc;
    const range = doc.resolve(start + 1).blockRange(doc.resolve(start + node.nodeSize - 1));
    const target = range ? liftTarget(range) : null;
    if (!range || target == null) return false;
    editor.view.dispatch(editor.state.tr.lift(range, target).scrollIntoView());
    editor.view.focus();
    return true;
  }
  return false;
}

/** A word or phrase the handout leaves blank (SB4.3). A mark rather than a
 * node, so it can sit inside a sentence without breaking it. */
export const BlankMark = Mark.create({
  name: "blank",

  parseHTML() {
    return [{ tag: "span[data-blank]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-blank": "" }), 0];
  },

  addKeyboardShortcuts() {
    return {
      "Mod-Shift-b": () => this.editor.commands.toggleMark(this.name),
    };
  },
});

/** Words to put on the screen (SB4.4): a line the preacher wants projected
 * that is not a point, a passage, or a citation -- the big idea said a new
 * way, a question to leave with the room. A mark, like the blank, so it can
 * be one sentence of a paragraph; the slide generator turns each marked run
 * into a slide where it falls. */
export const SlideMark = Mark.create({
  name: "slide",

  parseHTML() {
    return [{ tag: "span[data-slide]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-slide": "" }), 0];
  },

  addKeyboardShortcuts() {
    return {
      "Mod-Shift-l": () => this.editor.commands.toggleMark(this.name),
    };
  },
});

/** Ctrl+Alt+1 and Ctrl+Alt+2 write a point and a sub-point. tiptap's own
 * heading shortcuts map those keys to levels 1 and 2, which a sermon does
 * not use, so document mode rebinds them to h2 and h3.
 *
 * Ctrl+Alt+3 -- tiptap's key for h3, already on Ctrl+Alt+2 here -- sets the
 * selection apart as a typed block; pressed again inside one, it steps the
 * block to the next kind, so a point's explanation, illustration, and
 * application are keypresses apart rather than trips to a menu.
 *
 * Alt+Shift+↑ and ↓ move the point the cursor is in, sub-points and all --
 * the keyboard's way to do what dragging a row in the Outline panel does. */
export const SermonHeadingKeys = Extension.create({
  name: "sermonHeadingKeys",
  addKeyboardShortcuts() {
    return {
      "Mod-Alt-1": () => this.editor.commands.toggleHeading({ level: 2 }),
      "Mod-Alt-2": () => this.editor.commands.toggleHeading({ level: 3 }),
      // Always handled, even when refused: passed on, the key would reach
      // tiptap's own heading binding and make the line a sub-point.
      "Mod-Alt-3": () => {
        const { editor } = this;
        if (!editor.isActive("callout")) {
          setCallout(editor, "explanation");
          return true;
        }
        const current = editor.getAttributes("callout").kind;
        const at = isCalloutKind(current) ? CALLOUT_KINDS.indexOf(current) : -1;
        setCallout(editor, CALLOUT_KINDS[(at + 1) % CALLOUT_KINDS.length]);
        return true;
      },
      "Alt-Shift-ArrowUp": () => {
        const at = headingAtCursor(this.editor);
        return at != null && moveSectionBy(this.editor, at, -1);
      },
      "Alt-Shift-ArrowDown": () => {
        const at = headingAtCursor(this.editor);
        return at != null && moveSectionBy(this.editor, at, 1);
      },
    };
  },
});

/** Everything document mode adds on top of the note editor's extensions. */
export const SERMON_EXTENSIONS = [PassageNode, SourceNode, CalloutNode, BlankMark, SlideMark, SermonHeadingKeys];
