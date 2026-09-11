import { useEffect, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Bold, ChevronDown, Italic, LayoutTemplate, Link2, Link2Off, List, ListOrdered } from "lucide-react";
import { useBooks, useResources } from "../../api/queries";
import { buildBookLookup, parseReference } from "../../hooks/useReferenceParser";
import { verseHref, resourceHref } from "../../lib/noteLinks";
import { IconButton, Button } from "../../components/ui/Button";
import { Popover, PopoverItem, PopoverLabel } from "../../components/ui/Popover";
import { cx, inputSmClass, selectSmClass } from "../../components/ui/classes";
import { applyTemplate, useNoteTemplates } from "./noteTemplates";

export function RichTextEditor({
  content,
  onChange,
  placeholder,
  autoFocus,
  offerTemplates = true,
}: {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  /** Show "Start from…" (the note templates) while the editor is empty.
   * Off for the template editor itself. */
  offerTemplates?: boolean;
}) {
  const { data: books } = useBooks();
  const { data: resources } = useResources();
  const [templates] = useNoteTemplates();
  const [linkPopoverOpen, setLinkPopoverOpen] = useState(false);
  const [linkInput, setLinkInput] = useState("");
  const [linkResourceId, setLinkResourceId] = useState("");

  const editor = useEditor({
    extensions: [
      // Headings are only reachable through templates (no toolbar button),
      // and one level keeps a note's structure flat.
      StarterKit.configure({ heading: { levels: [3] }, link: false }),
      Link.configure({ openOnClick: false, autolink: true }),
      Placeholder.configure({ placeholder: placeholder ?? "Write a note…" }),
    ],
    content,
    autofocus: autoFocus ?? false,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  useEffect(() => {
    if (editor && content !== editor.getHTML() && !editor.isFocused) {
      editor.commands.setContent(content, { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

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

  // Toolbar buttons keep the editor's selection by swallowing mousedown.
  const stop = { onMouseDown: (e: React.MouseEvent) => e.preventDefault() };

  return (
    <div className="rounded-md border border-line-2 bg-surface focus-within:border-accent">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-line p-1">
        <IconButton icon={Bold} label="Bold (Ctrl+B)" size="sm" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} {...stop} />
        <IconButton icon={Italic} label="Italic (Ctrl+I)" size="sm" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} {...stop} />
        <IconButton icon={List} label="Bullet list" size="sm" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} {...stop} />
        <IconButton icon={ListOrdered} label="Numbered list" size="sm" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} {...stop} />
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
                <PopoverLabel>Note templates</PopoverLabel>
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
      <EditorContent editor={editor} className="note-richtext px-3 py-2 text-sm text-ink" />
    </div>
  );
}
