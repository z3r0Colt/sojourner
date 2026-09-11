import { useMemo } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useBooks } from "../../api/queries";
import { usePaneNavigate } from "../../workspace/PaneContext";
import { openPassage, targetFor } from "../../workspace/openContent";
import { buildRefMatcher, autoLinkScriptureRefs, parseInternalHref } from "../../lib/noteLinks";

/** Renders a note's HTML (from the rich text editor, or legacy plain text),
 * auto-linkifying any un-linked scripture references, and routes clicks on
 * internal verse/resource links within the app instead of navigating away. */
export function NoteBody({ body, className }: { body: string; className?: string }) {
  const { data: books } = useBooks();
  const navigate = usePaneNavigate();
  const matcher = useMemo(() => (books && books.length > 0 ? buildRefMatcher(books) : null), [books]);
  const html = useMemo(() => autoLinkScriptureRefs(body, matcher), [body, matcher]);

  function handleClick(e: React.MouseEvent<HTMLSpanElement>) {
    const link = (e.target as HTMLElement).closest("a");
    if (!link) return;
    e.preventDefault();
    const href = link.getAttribute("href") ?? "";
    const internal = parseInternalHref(href);
    if (internal?.kind === "verse") {
      openPassage({ bookId: internal.bookId, chapter: internal.chapter, verse: internal.verse }, { target: targetFor(e) });
    } else if (internal?.kind === "resource") {
      navigate(`/resources/${internal.id}`, e);
    } else if (/^https?:\/\//.test(href)) {
      openUrl(href).catch(() => {});
    }
  }

  return (
    <span
      className={`note-html ${className ?? ""}`}
      onClick={handleClick}
      onAuxClick={(e) => e.button === 1 && handleClick(e)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
