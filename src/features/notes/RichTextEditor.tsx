import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  BookOpen,
  ChevronDown,
  Heading2,
  Heading3,
  Italic,
  LayoutTemplate,
  Lightbulb,
  Link2,
  Link2Off,
  List,
  ListOrdered,
  Minus,
  Quote,
  SquareDashedBottom,
  Underline as UnderlineIcon,
} from "lucide-react";
import { useBooks, useResources } from "../../api/queries";
import { buildBookLookup, parseReference } from "../../hooks/useReferenceParser";
import { verseHref, resourceHref } from "../../lib/noteLinks";
import { IconButton, Button } from "../../components/ui/Button";
import { Popover, PopoverItem, PopoverLabel } from "../../components/ui/Popover";
import { cx, inputSmClass, selectSmClass } from "../../components/ui/classes";
import { applyTemplate, useNoteTemplates, type NoteTemplate } from "./noteTemplates";
import { SERMON_EXTENSIONS } from "../sermons/editor/extensions";
import { passageBlockHtml } from "../sermons/editor/documentModel";
import type { PassageRef, SermonSourceInput } from "../../api/types";

/** What "Send to sermon" and the illustration picker hand the editor. */
export interface SourceInsert extends SermonSourceInput {
  /** The quoted text, as HTML paragraphs or plain text. */
  excerpt: string | null;
}

/** The handle a sermon pane holds so material sent from a study pane can be
 * dropped at the cursor (SB1.4). */
export interface RichTextEditorHandle {
  editor: Editor | null;
  insertPassage: (ref: PassageRef) => void;
  insertSource: (item: SourceInsert) => void;
  focus: () => void;
}

export const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(function RichTextEditor(
  {
    content,
    onChange,
    placeholder,
    autoFocus,
    offerTemplates = true,
    templates: templatesProp,
    templatesLabel,
    mode = "note",
    onPickIllustration,
    onSelectionChange,
    className,
  },
  ref,
) {
  const { data: books } = useBooks();
  const { data: resources } = useResources();
  const [noteTemplates] = useNoteTemplates();
  // A sermon starts from a sermon template, a note from a note template;
  // the caller decides, and the note editor keeps the list it always had.
  const templates = templatesProp ?? noteTemplates;
  const [linkPopoverOpen, setLinkPopoverOpen] = useState(false);
  const [linkInput, setLinkInput] = useState("");
  const [linkResourceId, setLinkResourceId] = useState("");
  const [passageInput, setPassageInput] = useState("");
  const [passageError, setPassageError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const isDocument = mode === "document";

  const editor = useEditor({
    extensions: [
      // A note stays flat: h3 only, reachable through templates. A sermon is
      // a document, so it gets points (h2) and sub-points (h3), a rule, and
      // the sermon builder's own nodes -- all behind the mode, so the note
      // editor's extension list is exactly what it was.
      StarterKit.configure({
        heading: { levels: isDocument ? [2, 3] : [3] },
        link: false,
        horizontalRule: isDocument ? undefined : false,
      }),
      Link.configure({ openOnClick: false, autolink: true }),
      Placeholder.configure({ placeholder: placeholder ?? "Write a note…" }),
      ...(isDocument ? SERMON_EXTENSIONS : []),
    ],
    content,
    autofocus: autoFocus ?? false,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    onSelectionUpdate: onSelectionChange ? ({ editor }) => onSelectionChange(editor) : undefined,
  });

  useEffect(() => {
    if (editor && content !== editor.getHTML() && !editor.isFocused) {
      editor.commands.setContent(content, { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

  useImperativeHandle(
    ref,
    () => ({
      editor: editor ?? null,
      focus: () => editor?.view.focus(),
      insertPassage: (passageRef) => {
        if (!editor) return;
        // tiptap defers focus() on a blurred editor by a frame, which in
        // WebView2 drops the insert at the document start; focusing the view
        // first is what the note templates learned to do.
        editor.view.focus();
        editor.chain().focus().insertContent(passageBlockHtml(passageRef)).run();
      },
      insertSource: (item) => {
        if (!editor) return;
        editor.view.focus();
        editor.chain().focus().insertContent(sourceBlockHtml(item)).run();
      },
    }),
    [editor],
  );

  if (!editor) return null;

  function applyLink() {
    if (!editor) return;
    const bookLookup = books ? buildBookLookup(books) : new Map();
    const parsed = linkInput.trim() ? parseReference(linkInput.trim(), bookLookup) : null;
    let href: string | null = null;
    if (linkResourceId) {
      href = resourceHref(Number(linkResourceId));
    } else if (parsed) {
      href = verseHref(parsed.book.id, parsed.chapter, parsed.verse);
    } else if (/^https?:\/\//.test(linkInput.trim())) {
      href = linkInput.trim();
    }
    if (href) {
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
    setLinkPopoverOpen(false);
    setLinkInput("");
    setLinkResourceId("");
  }

  /** "Romans 8:28-30" typed into the Passage popover becomes a live block. */
  function applyPassage(close: () => void) {
    if (!editor) return;
    const bookLookup = books ? buildBookLookup(books) : new Map();
    const parsed = parseReference(passageInput.trim(), bookLookup);
    if (!parsed) {
      setPassageError("That doesn't look like a reference.");
      return;
    }
    const start = parsed.verse ?? 1;
    const end = parsed.verseEnd ?? parsed.verse ?? 999;
    editor.view.focus();
    editor
      .chain()
      .focus()
      .insertContent(
        passageBlockHtml({ book_id: parsed.book.id, chapter: parsed.chapter, verse_start: start, verse_end: Math.max(start, end) }),
      )
      .run();
    setPassageInput("");
    setPassageError(null);
    close();
  }

  // Toolbar buttons keep the editor's selection by swallowing mousedown.
  const stop = { onMouseDown: (e: React.MouseEvent) => e.preventDefault() };

  /** Ctrl+Shift+P opens the Passage popover rather than inserting blindly:
   * the block needs a reference, and the popover is where one is typed.
   * Handled here rather than in a tiptap keymap because what it opens is a
   * piece of React, not an editor command. */
  function onKeyDown(e: React.KeyboardEvent) {
    if (!isDocument || !e.ctrlKey || !e.shiftKey || e.key.toLowerCase() !== "p") return;
    const button = rootRef.current?.querySelector<HTMLButtonElement>("[data-sermon-insert-passage]");
    if (!button) return;
    e.preventDefault();
    button.click();
  }

  return (
    <div
      ref={rootRef}
      onKeyDown={onKeyDown}
      className={cx("rounded-md border border-line-2 bg-surface focus-within:border-accent", className)}
    >
      <div className="flex flex-wrap items-center gap-0.5 border-b border-line p-1">
        {isDocument && (
          <>
            <IconButton
              icon={Heading2}
              label="Point (Ctrl+Alt+1)"
              size="sm"
              active={editor.isActive("heading", { level: 2 })}
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              {...stop}
            />
            <IconButton
              icon={Heading3}
              label="Sub-point (Ctrl+Alt+2)"
              size="sm"
              active={editor.isActive("heading", { level: 3 })}
              onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
              {...stop}
            />
            <span className="mx-0.5 h-4 w-px bg-line" aria-hidden="true" />
          </>
        )}
        <IconButton icon={Bold} label="Bold (Ctrl+B)" size="sm" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} {...stop} />
        <IconButton icon={Italic} label="Italic (Ctrl+I)" size="sm" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} {...stop} />
        {isDocument && (
          <IconButton
            icon={UnderlineIcon}
            label="Underline (Ctrl+U)"
            size="sm"
            active={editor.isActive("underline")}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            {...stop}
          />
        )}
        <IconButton icon={List} label="Bullet list" size="sm" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} {...stop} />
        <IconButton icon={ListOrdered} label="Numbered list" size="sm" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} {...stop} />
        {isDocument && (
          <>
            <IconButton
              icon={Quote}
              label="Quotation"
              size="sm"
              active={editor.isActive("blockquote")}
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
              {...stop}
            />
            <IconButton icon={Minus} label="Rule" size="sm" onClick={() => editor.chain().focus().setHorizontalRule().run()} {...stop} />
          </>
        )}
        <div className="relative">
          <IconButton icon={Link2} label="Insert link" size="sm" active={editor.isActive("link") || linkPopoverOpen} onClick={() => setLinkPopoverOpen((v) => !v)} {...stop} />
          {linkPopoverOpen && (
            <div className="absolute left-0 top-full z-30 mt-1 w-72 rounded-lg border border-line bg-surface p-2 shadow-xl">
              <input
                autoFocus
                value={linkInput}
                onChange={(e) => setLinkInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applyLink();
                  if (e.key === "Escape") setLinkPopoverOpen(false);
                }}
                placeholder="A verse (John 3:16) or a web address"
                className={cx(inputSmClass, "mb-1 w-full")}
              />
              <select value={linkResourceId} onChange={(e) => setLinkResourceId(e.target.value)} className={cx(selectSmClass, "mb-2 w-full")}>
                <option value="">…or link to a resource</option>
                {resources?.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </select>
              <div className="flex justify-end gap-1">
                <Button size="sm" variant="ghost" onClick={() => setLinkPopoverOpen(false)}>
                  Cancel
                </Button>
                <Button size="sm" variant="primary" onClick={applyLink}>
                  Add link
                </Button>
              </div>
            </div>
          )}
        </div>
        {editor.isActive("link") && (
          <IconButton icon={Link2Off} label="Remove link" size="sm" onClick={() => editor.chain().focus().unsetLink().run()} {...stop} />
        )}
        {isDocument && (
          <>
            <span className="mx-0.5 h-4 w-px bg-line" aria-hidden="true" />
            <Popover
              align="left"
              width="w-72"
              trigger={({ toggle, open }) => (
                <IconButton
                  icon={BookOpen}
                  label="Insert passage (Ctrl+Shift+P)"
                  size="sm"
                  active={open}
                  onClick={toggle}
                  data-sermon-insert-passage=""
                  {...stop}
                />
              )}
            >
              {(close) => (
                <>
                  <PopoverLabel>Insert a passage</PopoverLabel>
                  <input
                    autoFocus
                    value={passageInput}
                    onChange={(e) => {
                      setPassageInput(e.target.value);
                      setPassageError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        applyPassage(close);
                      }
                    }}
                    placeholder="Romans 8:28-30"
                    aria-label="Reference"
                    className={cx(inputSmClass, "w-full")}
                  />
                  {passageError && <p className="px-1 pt-1 text-xs text-danger">{passageError}</p>}
                  <p className="px-1 pb-1 pt-1.5 text-xs text-ink-3">The block holds the reference; the words come from the sermon's translation.</p>
                  <div className="flex justify-end">
                    <Button size="sm" variant="primary" onClick={() => applyPassage(close)}>
                      Insert
                    </Button>
                  </div>
                </>
              )}
            </Popover>
            <IconButton
              icon={Quote}
              label="Citation"
              size="sm"
              active={editor.isActive("source")}
              onClick={() =>
                editor
                  .chain()
                  .focus()
                  .insertContent(sourceBlockHtml({ kind: "resource", ref_id: null, label: "", excerpt: null }))
                  .run()
              }
              {...stop}
            />
            {onPickIllustration && (
              <IconButton icon={Lightbulb} label="Insert an illustration" size="sm" onClick={onPickIllustration} {...stop} />
            )}
            <IconButton
              icon={SquareDashedBottom}
              label="Blank for the handout (Ctrl+Shift+B)"
              size="sm"
              active={editor.isActive("blank")}
              onClick={() => editor.chain().focus().toggleMark("blank").run()}
              {...stop}
            />
          </>
        )}
        {offerTemplates && templates.length > 0 && editor.isEmpty && (
          <Popover
            className="ml-auto"
            width="w-64"
            trigger={({ toggle, open }) => (
              <Button size="sm" variant="ghost" icon={LayoutTemplate} onClick={toggle} aria-haspopup="menu" aria-expanded={open} {...stop}>
                Start from…
                <ChevronDown className="h-3.5 w-3.5 text-ink-4" aria-hidden="true" />
              </Button>
            )}
          >
            {(close) => (
              <>
                <PopoverLabel>{templatesLabel ?? "Note templates"}</PopoverLabel>
                {templates.map((t, i) => (
                  <PopoverItem
                    key={`${i}-${t.name}`}
                    onClick={() => {
                      applyTemplate(editor, t);
                      close();
                    }}
                  >
                    {t.name}
                  </PopoverItem>
                ))}
              </>
            )}
          </Popover>
        )}
      </div>
      <EditorContent
        editor={editor}
        className={cx(isDocument ? "sermon-richtext px-4 py-3 text-ink" : "note-richtext px-3 py-2 text-sm text-ink")}
      />
    </div>
  );
});

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  /** Show "Start from…" while the editor is empty. Off for the template
   * editor itself. */
  offerTemplates?: boolean;
  /** The list to offer; defaults to the reader's note templates. */
  templates?: NoteTemplate[];
  /** The heading over that list ("Sermon templates"). */
  templatesLabel?: string;
  /** `document` adds points, sub-points, rules, and the sermon builder's
   * live passage and citation blocks. Notes stay exactly as they were. */
  mode?: "note" | "document";
  /** Opens the illustration picker (SB3.3); the button hides without it. */
  onPickIllustration?: () => void;
  /** Fires as the cursor moves, so a sermon pane can lead its link group. */
  onSelectionChange?: (editor: Editor) => void;
  className?: string;
}

/** The markup one citation saves as. Written here rather than through a
 * tiptap command so "Send to sermon" can build it from a study pane. */
export function sourceBlockHtml(item: SourceInsert): string {
  const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const body = (item.excerpt ?? "").trim();
  const paragraphs = body
    ? body
        .split(/\n{2,}/)
        .map((p) => `<p>${escape(p.trim()).replace(/\n/g, "<br>")}</p>`)
        .join("")
    : "<p></p>";
  return (
    `<blockquote data-type="source" data-kind="${escape(item.kind)}"` +
    (item.ref_id ? ` data-ref-id="${escape(item.ref_id)}"` : "") +
    ` data-label="${escape(item.label ?? "")}">${paragraphs}</blockquote>`
  );
}
