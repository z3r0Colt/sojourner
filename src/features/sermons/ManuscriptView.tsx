import { useMemo } from "react";
import { useBooks, useTranslations } from "../../api/queries";
import { formatRef, refKey } from "../../lib/passage";
import { parseManuscript } from "./editor/documentModel";
import { cx } from "../../components/ui/classes";
import { sanitizeHtml } from "../../lib/sanitizeHtml";
import type { Passage, PassageRef } from "../../api/types";

/**
 * The manuscript, read-only (SB4.1, SB4.2, SB4.3).
 *
 * Preaching mode, the print views, and the handout all need the saved
 * document rendered without the editor: its passage blocks are references,
 * so they are filled in here from a passage map the caller has already
 * fetched, and everything else is the editor's own markup, which the
 * `.sermon-html` styles carry.
 */
export function ManuscriptView({
  html,
  passages,
  className,
  blanksAs,
}: {
  html: string;
  /** Every passage in the document, keyed by `refKey`. */
  passages: Map<string, Passage>;
  className?: string;
  /** How to draw a word marked as a blank: as itself, as a rule, or as the
   * answer key's accent (SB4.3). */
  blanksAs?: "word" | "rule" | "key";
}) {
  const { data: books } = useBooks();
  const { data: translations } = useTranslations();

  const parts = useMemo(() => {
    const root = parseManuscript(html).getElementById("sermon-root");
    if (!root) return [];
    return Array.from(root.children).map((child, i) => {
      if (child.getAttribute("data-type") === "passage") {
        const ref = refOf(child);
        return { key: `p${i}`, kind: "passage" as const, ref, translationId: numAttr(child, "data-translation-id") };
      }
      // Sanitized here rather than at the `dangerouslySetInnerHTML` below so
      // a long manuscript is not walked again on every render.
      return { key: `h${i}`, kind: "html" as const, html: sanitizeHtml(renderBlanks(child, blanksAs ?? "word")) };
    });
  }, [html, blanksAs]);

  return (
    <div className={cx("sermon-html", className)}>
      {parts.map((part) =>
        part.kind === "passage" ? (
          <PassagePart
            key={part.key}
            ref_={part.ref}
            passage={part.ref ? passages.get(refKey(part.ref)) : undefined}
            label={part.ref ? formatRef(books, part.ref) : "A passage"}
            code={translations?.find((t) => t.id === part.translationId)?.code}
          />
        ) : (
          <div key={part.key} dangerouslySetInnerHTML={{ __html: part.html }} />
        ),
      )}
    </div>
  );
}

function PassagePart({
  ref_,
  passage,
  label,
  code,
}: {
  ref_: PassageRef | null;
  passage: Passage | undefined;
  label: string;
  code?: string;
}) {
  if (!ref_) return null;
  return (
    <div className="sermon-passage">
      <p className="sermon-passage-text">
        {passage?.verses.length
          ? passage.verses.map((v) => (
              <span key={v.verse}>
                <sup className="sermon-passage-number">{v.verse}</sup>
                {v.text}{" "}
              </span>
            ))
          : passage?.text || "…"}
      </p>
      <div className="sermon-passage-caption">
        <span>
          {label}
          {code ? ` · ${code}` : ""}
        </span>
      </div>
    </div>
  );
}

function numAttr(el: Element, name: string): number | null {
  const raw = el.getAttribute(name);
  const n = raw == null ? NaN : Number(raw);
  return Number.isFinite(n) ? n : null;
}

function refOf(el: Element): PassageRef | null {
  const bookId = numAttr(el, "data-book-id");
  const chapter = numAttr(el, "data-chapter");
  if (!bookId || !chapter) return null;
  const start = numAttr(el, "data-verse-start") ?? 1;
  const end = numAttr(el, "data-verse-end") ?? start;
  return { book_id: bookId, chapter, verse_start: start, verse_end: Math.max(start, end) };
}

/** Rewrites the blanks inside one block for the way this view shows them:
 * as the word itself (the manuscript), a rule the congregation fills in, or
 * the answer key in the accent color. */
function renderBlanks(el: Element, mode: "word" | "rule" | "key"): string {
  if (mode === "word") return el.outerHTML;
  const clone = el.cloneNode(true) as Element;
  for (const blank of Array.from(clone.querySelectorAll("span[data-blank]"))) {
    const word = (blank.textContent ?? "").trim();
    if (mode === "rule") {
      // A rule as long as the word it hides, so the sheet still looks right.
      blank.textContent = " ".repeat(Math.max(6, Math.min(40, word.length * 2)));
      blank.setAttribute("class", "handout-blank");
    } else {
      blank.setAttribute("class", "handout-blank-key");
    }
  }
  return clone.outerHTML;
}
