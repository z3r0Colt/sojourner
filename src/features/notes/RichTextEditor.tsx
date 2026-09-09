import { useEffect, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { useBooks, useResources } from "../../api/queries";
import { buildBookLookup, parseReference } from "../../hooks/useReferenceParser";
import { verseHref, resourceHref } from "../../lib/noteLinks";

function ToolbarButton({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`rounded px-2 py-1 text-xs font-medium ${
        active
          ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
          : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
      }`}
    >
      {children}
    </button>
  );
}

export function RichTextEditor({
  content,
  onChange,
  placeholder,
  autoFocus,
}: {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const { data: books } = useBooks();
  const { data: resources } = useResources();
  const [linkPopoverOpen, setLinkPopoverOpen] = useState(false);
  const [linkInput, setLinkInput] = useState("");
  const [linkResourceId, setLinkResourceId] = useState("");

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false, link: false }),
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

  return (
    <div className="rounded border border-gray-300 dark:border-gray-700">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-gray-200 p-1 dark:border-gray-800">
        <ToolbarButton title="Bold (Ctrl+B)" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
          <span className="font-bold">B</span>
        </ToolbarButton>
        <ToolbarButton title="Italic (Ctrl+I)" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <span className="italic">I</span>
        </ToolbarButton>
        <ToolbarButton title="Bullet list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          •≡
        </ToolbarButton>
        <ToolbarButton title="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          1≡
        </ToolbarButton>
        <div className="relative">
          <ToolbarButton title="Insert link" active={editor.isActive("link")} onClick={() => setLinkPopoverOpen((v) => !v)}>
            🔗
          </ToolbarButton>
          {linkPopoverOpen && (
            <div className="absolute left-0 top-full z-30 mt-1 w-64 rounded border border-gray-200 bg-white p-2 shadow-lg dark:border-gray-700 dark:bg-gray-900">
              <input
                autoFocus
                value={linkInput}
                onChange={(e) => setLinkInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applyLink()}
                placeholder="Verse (John 3:16) or web URL"
                className="mb-1 w-full rounded border border-gray-300 px-2 py-1 text-xs outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-950"
              />
              <select
                value={linkResourceId}
                onChange={(e) => setLinkResourceId(e.target.value)}
                className="mb-2 w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-900"
              >
                <option value="">— or link to a resource —</option>
                {resources?.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </select>
              <div className="flex justify-end gap-2 text-xs">
                <button onClick={() => setLinkPopoverOpen(false)} className="text-gray-500 hover:underline">
                  Cancel
                </button>
                <button onClick={applyLink} className="text-blue-600 hover:underline dark:text-blue-400">
                  Add link
                </button>
              </div>
            </div>
          )}
        </div>
        {editor.isActive("link") && (
          <ToolbarButton title="Remove link" onClick={() => editor.chain().focus().unsetLink().run()}>
            ✕🔗
          </ToolbarButton>
        )}
      </div>
      <EditorContent editor={editor} className="note-richtext px-2 py-1.5 text-sm" />
    </div>
  );
}
