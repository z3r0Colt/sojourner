import { useMemo, useState } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { ChevronDown, Trash2 } from "lucide-react";
import {
  useBooks,
  useFootnotesForChapter,
  usePassagesIn,
  useRedLetterRanges,
  useTranslations,
} from "../../../api/queries";
import { useReaderTranslationId } from "../../../state/workspaceStore";
import { buildTokens } from "../../reading/verseTokens";
import { computeRedLetterSpans } from "../../reading/redLetterSpans";
import { FootnotePopup } from "../../reading/FootnotePopup";
import { formatRef, refKey } from "../../../lib/passage";
import { REF_ATTR } from "../../../lib/refAttr";
import { Popover, PopoverItem, PopoverLabel } from "../../../components/ui/Popover";
import { cx } from "../../../components/ui/classes";
import { useSermonEditorContext } from "./context";
import type { Footnote, PassageRef } from "../../../api/types";

/** The reference a passage node's attributes describe, or null while the
 * node is half-built (a drag in progress, a paste of malformed HTML). */
export function passageRefOf(attrs: Record<string, unknown>): PassageRef | null {
  const bookId = Number(attrs.bookId);
  const chapter = Number(attrs.chapter);
  if (!bookId || !chapter) return null;
  const start = Number(attrs.verseStart) || 1;
  const end = Number(attrs.verseEnd) || start;
  return { book_id: bookId, chapter, verse_start: start, verse_end: Math.max(start, end) };
}

/** A live passage: the block holds a reference, and the words are fetched in
 * the sermon's translation every time it renders, so switching the sermon's
 * translation rewrites every block at once and nothing in the document goes
 * stale when a translation is added or removed. */
export function PassageBlock({ node, updateAttributes, deleteNode, editor }: NodeViewProps) {
  const {
    translationId: sermonTranslationId,
    passages: shared,
    passagesLoading,
    readOnly,
  } = useSermonEditorContext();
  const readerTranslationId = useReaderTranslationId();
  const { data: books } = useBooks();
  const { data: translations } = useTranslations();
  const [footnote, setFootnote] = useState<{ note: Footnote; x: number; y: number } | null>(null);

  // A block pinned to a translation the app no longer carries (Wycliffe and
  // the OEB left in 0.3.1) renders in the sermon's own, as if unpinned.
  const pinnedAttr = node.attrs.translationId as number | null;
  const pinned = pinnedAttr != null && translations && !translations.some((t) => t.id === pinnedAttr) ? null : pinnedAttr;
  const translationId = pinned ?? sermonTranslationId ?? readerTranslationId;
  const ref = passageRefOf(node.attrs);
  // The shared query already holds every block rendering in the sermon's own
  // translation; only a block pinned to another one fetches for itself.
  const ownRefs = useMemo(
    () => (ref && pinned != null ? [ref] : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ref ? refKey(ref) : "", pinned],
  );
  const own = usePassagesIn(translationId, ownRefs);
  const passage = ref ? (pinned != null ? own.byKey.get(refKey(ref)) : shared?.get(refKey(ref))) : undefined;
  const isLoading = pinned != null ? own.isLoading : (passagesLoading ?? false);
  const { data: redLetterRanges } = useRedLetterRanges(ref?.book_id ?? null, ref?.chapter ?? null);
  const { data: footnotes } = useFootnotesForChapter(translationId, ref?.book_id ?? null, ref?.chapter ?? null);

  const redLetterSpans = useMemo(() => {
    if (!passage?.verses.length || !redLetterRanges?.length) return new Map<number, { start: number; end: number }[]>();
    const flagged = (verse: number) => redLetterRanges.some((r) => verse >= r.verse_start && verse <= r.verse_end);
    return computeRedLetterSpans(passage.verses, flagged);
  }, [passage, redLetterRanges]);

  const code = translations?.find((t) => t.id === translationId)?.code ?? "";
  const label = ref ? formatRef(books, ref) : "A passage";

  return (
    <NodeViewWrapper as="div" className="sermon-passage" contentEditable={false}>
      <p className="sermon-passage-text">
        {isLoading && <span className="text-ink-3">Loading {label}…</span>}
        {!isLoading && !passage?.verses.length && (
          <span className="text-ink-3">No text for {label} in this translation.</span>
        )}
        {passage?.verses.map((verse) => (
          <span key={verse.verse}>
            <sup className="sermon-passage-number">{verse.verse}</sup>
            {buildTokens(verse.text, [], verse.verse, footnotes?.[verse.verse] ?? [], redLetterSpans.get(verse.verse) ?? []).map(
              (token, i) =>
                token.kind === "footnote" ? (
                  <sup
                    key={`f${i}`}
                    role="button"
                    tabIndex={0}
                    className="ml-0.5 cursor-pointer select-none text-accent hover:underline"
                    aria-label={`Footnote ${token.footnote.marker}`}
                    onClick={(e) => {
                      const rect = (e.target as HTMLElement).getBoundingClientRect();
                      setFootnote({ note: token.footnote, x: rect.left, y: rect.bottom + 4 });
                    }}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" && e.key !== " ") return;
                      e.preventDefault();
                      const rect = (e.target as HTMLElement).getBoundingClientRect();
                      setFootnote({ note: token.footnote, x: rect.left, y: rect.bottom + 4 });
                    }}
                  >
                    [{token.footnote.marker}]
                  </sup>
                ) : (
                  <span key={`t${i}`} className={cx(token.segment.isRedLetter && "text-red-700 dark:text-red-400")}>
                    {token.segment.text}
                  </span>
                ),
            )}{" "}
          </span>
        ))}
      </p>
      <div className="sermon-passage-caption">
        {/* The caption carries data-ref, so hovering it previews the passage
            the way any reference in the app does -- and the block's own text
            stays free of a card that would only repeat it. */}
        <span {...(ref ? { [REF_ATTR]: refKey(ref) } : {})} tabIndex={0}>
          {label}
          {code && ` · ${code}`}
        </span>
        {!readOnly && editor.isEditable && (
          <Popover
            width="w-52"
            trigger={({ toggle, open }) => (
              <button
                type="button"
                className="sermon-block-menu"
                onClick={toggle}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label={`Options for ${label}`}
              >
                {pinned ? "Pinned" : "Translation"}
                <ChevronDown className="h-3 w-3" aria-hidden="true" />
              </button>
            )}
          >
            {(close) => (
              <>
                <PopoverLabel>Render this block in</PopoverLabel>
                <PopoverItem
                  selected={pinned == null}
                  onClick={() => {
                    updateAttributes({ translationId: null });
                    close();
                  }}
                >
                  The sermon's translation
                </PopoverItem>
                {translations?.map((t) => (
                  <PopoverItem
                    key={t.id}
                    selected={pinned === t.id}
                    onClick={() => {
                      updateAttributes({ translationId: t.id });
                      close();
                    }}
                  >
                    {t.code} — {t.name}
                  </PopoverItem>
                ))}
                <div className="my-1 h-px bg-line" aria-hidden="true" />
                <PopoverItem
                  danger
                  onClick={() => {
                    close();
                    deleteNode();
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Remove this passage
                </PopoverItem>
              </>
            )}
          </Popover>
        )}
      </div>
      {footnote && (
        <FootnotePopup
          marker={footnote.note.marker}
          text={footnote.note.text}
          x={footnote.x}
          y={footnote.y}
          onClose={() => setFootnote(null)}
        />
      )}
    </NodeViewWrapper>
  );
}
