import { useEffect, useMemo, useRef } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useBooks } from "../../api/queries";
import { usePaneNavigate } from "../../workspace/PaneContext";
import { openPassage, targetFor } from "../../workspace/openContent";
import { buildRefMatcher, autoLinkScriptureRefs, parseInternalHref } from "../../lib/noteLinks";
import { decorateRefLinks } from "../../lib/refAttr";
import { toPassageRef } from "../../lib/passage";

/** Renders a note's HTML (from the rich text editor, or legacy plain text),
 * auto-linkifying any un-linked scripture references, and routes clicks on
 * internal verse/resource links within the app instead of navigating away. */
export function NoteBody({ body, className }: { body: string; className?: string }) {
  const { data: books } = useBooks();
  const navigate = usePaneNavigate();
  const ref = useRef<HTMLSpanElement>(null);
  const matcher = useMemo(() => (books && books.length > 0 ? buildRefMatcher(books) : null), [books]);
  const html = useMemo(() => autoLinkScriptureRefs(body, matcher), [body, matcher]);

  // Hover previews for every verse link (typed, pasted, or auto-linked). A
  // chapter-only link ("Genesis 3") has no verse to preview and is skipped.
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    decorateRefLinks(root, 'a[href^="bsapp://verse/"]', (el) => {
      const internal = parseInternalHref(el.getAttribute("href") ?? "");
      return internal?.kind === "verse" && internal.verse != null ? toPassageRef(internal.bookId, internal.chapter, internal.verse) : null;
    });
  }, [html]);

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
      ref={ref}
      className={`note-html ${className ?? ""}`}
      onClick={handleClick}
      onAuxClick={(e) => e.button === 1 && handleClick(e)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
