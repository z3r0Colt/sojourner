import { Extension, Mark, Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { PassageBlock } from "./PassageBlock";
import { SourceBlock } from "./SourceBlock";

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

/** Ctrl+Alt+1 and Ctrl+Alt+2 write a point and a sub-point. tiptap's own
 * heading shortcuts map those keys to levels 1 and 2, which a sermon does
 * not use, so document mode rebinds them to h2 and h3. */
export const SermonHeadingKeys = Extension.create({
  name: "sermonHeadingKeys",
  addKeyboardShortcuts() {
    return {
      "Mod-Alt-1": () => this.editor.commands.toggleHeading({ level: 2 }),
      "Mod-Alt-2": () => this.editor.commands.toggleHeading({ level: 3 }),
    };
  },
});

/** Everything document mode adds on top of the note editor's extensions. */
export const SERMON_EXTENSIONS = [PassageNode, SourceNode, BlankMark, SermonHeadingKeys];
