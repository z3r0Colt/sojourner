import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useBooks } from "../../api/queries";
import { useNavigationStore } from "../../state/navigationStore";
import { buildRefMatcher, autoLinkScriptureRefs, parseInternalHref } from "../../lib/noteLinks";

/** Renders a note's HTML (from the rich text editor, or legacy plain text),
 * auto-linkifying any un-linked scripture references, and routes clicks on
 * internal verse/resource links within the app instead of navigating away. */
export function NoteBody({ body, className }: { body: string; className?: string }) {
  const { data: books } = useBooks();
  const goTo = useNavigationStore((s) => s.goTo);
  const navigate = useNavigate();
  const matcher = useMemo(() => (books && books.length > 0 ? buildRefMatcher(books) : null), [books]);
  const html = useMemo(() => autoLinkScriptureRefs(body, matcher), [body, matcher]);

  function handleClick(e: React.MouseEvent<HTMLSpanElement>) {
    const link = (e.target as HTMLElement).closest("a");
    if (!link) return;
    e.preventDefault();
    const href = link.getAttribute("href") ?? "";
    const internal = parseInternalHref(href);
    if (internal?.kind === "verse") {
      goTo({ bookId: internal.bookId, chapter: internal.chapter, verse: internal.verse });
      navigate("/");
    } else if (internal?.kind === "resource") {
      navigate(`/resources/${internal.id}`);
    } else if (/^https?:\/\//.test(href)) {
      openUrl(href).catch(() => {});
    }
  }

  return <span className={`note-html ${className ?? ""}`} onClick={handleClick} dangerouslySetInnerHTML={{ __html: html }} />;
}
