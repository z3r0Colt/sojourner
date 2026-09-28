import { useEffect, useMemo, useState, type RefObject } from "react";
import { ArrowDown, ChevronDown, ChevronUp } from "lucide-react";
import { useWebsterLookup } from "../../api/queries";
import { useWorkspaceStore } from "../../state/workspaceStore";
import { openContent, targetFor } from "../../workspace/openContent";
import { CommentaryHtml, type JumpToRef } from "../commentary/CommentaryPanel";
import { sectionLabelClass } from "../../components/ui/classes";
import { markWebsterParagraphs, partOfSpeechName, websterPreview, type ReadingPlace } from "./websterDisplay";

/**
 * Opens a Webster entry on the Dictionary page: in the Dictionary pane if
 * one is open, else in a new pane beside this one, as "Search the lexicon"
 * does -- a reader looking up one word after another wants them in one
 * place, not a new pane each. Ctrl+click or a middle-click always opens a
 * new one.
 */
export function openInWebster(entryId: number, e: React.MouseEvent) {
  const existing = useWorkspaceStore.getState().panes.find((p) => p.kind === "dictionary");
  const target = targetFor(e, existing?.id ?? "new");
  openContent("dictionary", { slug: null, work: "webster", webster: entryId }, { target });
}

/**
 * The Webster 1828 section of the word card, for a word double-clicked in
 * an English Bible: what the word meant to the English of the King James
 * Version's readers, which is not always what it means now. PREVENT is to
 * go before ("I prevented the dawning of the morning"), CONVERSATION is
 * manner of life, to LET is to hinder, the QUICK are the living.
 *
 * It comes after the Strong's entry and stays short there: the headword and
 * a sense or two (see websterPreview for which), then "More" for the whole
 * of every entry under the word, and "Open in Webster" for the Dictionary
 * page. A word the dictionary does not have leaves no section at all rather
 * than a "not found" under every name and number. The lookup runs only once
 * the card is open on an English word, so a Greek or Hebrew word, or a
 * card that is never opened, costs nothing.
 */
export function WebsterWordSection({
  word,
  place,
  onJumpToRef,
  onClose,
}: {
  /** The word as double-clicked, cleaned for lookup ("prevented"). */
  word: string;
  /** The chapter the word was read in, so a sense Webster cites it for can
   * be brought forward. */
  place: ReadingPlace | null;
  onJumpToRef: JumpToRef;
  onClose: () => void;
}) {
  const { data: lookup } = useWebsterLookup(word);
  const [open, setOpen] = useState(false);
  const entries = lookup?.entries;
  const matched = lookup?.matched;
  const book = place?.book;
  const chapter = place?.chapter;
  const preview = useMemo(
    () => (entries ? websterPreview(entries, book != null && chapter != null ? { book, chapter } : null, { prefer: matched }) : null),
    [entries, matched, book, chapter],
  );
  // "More" shows the whole of every entry, the one the preview drew on first.
  const inFull = useMemo(() => {
    if (!entries || !preview) return [];
    return [entries[preview.entryIndex], ...entries.filter((_, i) => i !== preview.entryIndex)].map((e) => ({
      id: e.id,
      html: markWebsterParagraphs(e.html),
    }));
  }, [entries, preview]);

  if (!lookup || !entries || !preview) return null;
  const primary = entries[preview.entryIndex];

  return (
    <section aria-label="Webster 1828" data-webster-section className="mt-3 scroll-mt-11 border-t border-line pt-2 text-sm">
      <div className="mb-1 flex items-baseline gap-2">
        <span className={sectionLabelClass}>Webster 1828</span>
        {/* "prevented" shown as PREVENT, "saw" as SEE where Webster cites
            the chapter for it: say so, quietly. */}
        {primary.key !== lookup.query && <span className="text-xs text-ink-4">from {primary.key}</span>}
        <button
          type="button"
          onClick={(e) => {
            openInWebster(primary.id, e);
            onClose();
          }}
          onAuxClick={(e) => {
            if (e.button !== 1) return;
            openInWebster(primary.id, e);
            onClose();
          }}
          className="ml-auto text-xs text-accent hover:underline"
        >
          Open in Webster
        </button>
      </div>

      {/* Where this copy of the dictionary lacks the word the KJV means
          ("even", "rank") and what was found is another word, the lookup
          says so, and the card says it first, so EVE, the evening, is not
          taken for what "even so" means. */}
      {lookup.note && <p className="mb-1.5 text-xs text-ink-3">{lookup.note}</p>}

      {!open && (
        <div className="reading-font space-y-1 text-ink-2">
          <p className="text-ink">
            <span className="font-semibold">{preview.headword}</span>
            {primary.pos && (
              <i className="ml-1.5 text-ink-3" title={partOfSpeechName(primary.pos) ?? undefined}>
                {primary.pos}
              </i>
            )}
          </p>
          {preview.senses.map((sense, i) => (
            <div key={i}>
              {sense.citesHere && <p className="text-xs font-medium text-accent">Webster cites this chapter for this sense</p>}
              <CommentaryHtml html={sense.html} onJumpToRef={onJumpToRef} />
              {/* The quotation that cites it, where the sense's own line
                  cites another chapter or none. */}
              {sense.quote && (
                <div className="mt-0.5 pl-3 text-ink-3">
                  <CommentaryHtml html={sense.quote} onJumpToRef={onJumpToRef} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* In the card's own scroll, not a box of its own inside it: the card
          already scrolls, and two scrollbars in a card this size is one too
          many. */}
      {open && (
        <div className="reading-font text-ink-2 [&_.wb-head]:text-ink [&_.wb-quote]:pl-3 [&_.wb-quote]:text-ink-3">
          {inFull.map((e, i) => (
            <div key={e.id} className={i > 0 ? "mt-2 border-t border-line pt-2" : undefined}>
              <CommentaryHtml html={e.html} onJumpToRef={onJumpToRef} />
            </div>
          ))}
        </div>
      )}

      {preview.more && (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="mt-1 inline-flex items-center gap-0.5 text-xs text-ink-3 hover:text-ink"
        >
          {open ? <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />}
          {open ? "Less" : entries.length > 1 ? `More (${entries.length} entries)` : "More"}
        </button>
      )}
    </section>
  );
}

/**
 * "Webster 1828" with an arrow, for the word card's header, while the
 * card's Webster section is out of sight below it. After a Strong's entry --
 * the parsing, Thayer's, the KJV usage -- the section starts well below the
 * fold of a card the height of the window, and the old sense of PREVENT or
 * LETTETH it gives is what a reader of the King James Version double-clicked
 * the word for. The link says the section is there and goes to it, and goes
 * once the section is in view. Nothing shows for a word Webster does not
 * have, as the section itself shows nothing.
 */
export function WebsterJump({ word, cardRef }: { word: string; cardRef: RefObject<HTMLElement | null> }) {
  const { data: lookup } = useWebsterLookup(word);
  const [below, setBelow] = useState(false);
  const found = !!lookup && lookup.entries.length > 0;

  useEffect(() => {
    setBelow(false);
    const card = cardRef.current;
    const section = card?.querySelector("[data-webster-section]");
    if (!found || !card || !section || typeof IntersectionObserver === "undefined") return;
    // In view once its label and a line of it are: not for a sliver of its
    // top border at the foot of the card.
    const observer = new IntersectionObserver(
      ([e]) => setBelow(!e.isIntersecting && e.boundingClientRect.top > (e.rootBounds?.top ?? 0)),
      { root: card, rootMargin: "0px 0px -48px 0px" },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, [found, lookup, cardRef]);

  // The card's own scroll, and nothing else: scrollIntoView would go on to
  // scroll the clipped frames around it.
  function goToSection() {
    const card = cardRef.current;
    const section = card?.querySelector<HTMLElement>("[data-webster-section]");
    if (!card || !section) return;
    // Clear of the card's pinned header (the section's scroll margin).
    const margin = parseFloat(getComputedStyle(section).scrollMarginTop) || 0;
    const top = card.scrollTop + section.getBoundingClientRect().top - card.getBoundingClientRect().top - margin;
    card.scrollTo({ top, behavior: "smooth" });
  }

  if (!below) return null;
  return (
    <button
      type="button"
      onClick={goToSection}
      title="Go to this word in Webster's 1828 dictionary, below"
      className="inline-flex h-7 items-center gap-0.5 rounded-md px-1.5 text-xs font-medium text-accent hover:bg-hover"
    >
      Webster 1828
      <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );
}
