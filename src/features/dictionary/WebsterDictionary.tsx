import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BookType, ChevronLeft, ChevronRight, CornerDownRight, Search } from "lucide-react";
import { useBooks, useWebsterBrowse, useWebsterEntry, useWebsterLookup, useWebsterSearch } from "../../api/queries";
import type { WebsterEntry } from "../../api/types";
import { usePane, usePaneNavigate } from "../../workspace/PaneContext";
import { SidePanel } from "../../components/ui/SidePanel";
import { openPassage, targetFor } from "../../workspace/openContent";
import { openAboutAt } from "../settings/sections/AboutSection";
import { useReadingTypography } from "../../state/uiStore";
import { CommentaryHtml } from "../commentary/CommentaryPanel";
import { EmptyState, LoadingState } from "../../components/ui/EmptyState";
import { cx, inputSmClass } from "../../components/ui/classes";
import {
  BROWSE_PAGE,
  browsePage,
  entryRelations,
  fitScale,
  markWebsterParagraphs,
  paragraphText,
  partOfSpeechName,
  unbreakableRuns,
  websterEnterTarget,
  websterPreview,
} from "./websterDisplay";
import {
  LIST_TOP,
  entryPlace,
  keepWebsterEntry,
  keepWebsterIndex,
  keptWebsterEntry,
  keptWebsterIndex,
  listPlace,
  scrollToEntryPlace,
  scrollToListPlace,
} from "./websterIndexMemory";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

/** One row of the index: a search hit, a browse row, or an entry the
 *  lookup found for what was typed. */
interface IndexRow {
  id: number;
  word: string;
  key: string;
  pos: string | null;
  snippet: string;
}

/** An entry as an index row, its first sense standing for the snippet. */
function rowOf(entry: WebsterEntry): IndexRow {
  const sense = websterPreview([entry], null, { count: 1 })?.senses[0];
  return { id: entry.id, word: entry.word, key: entry.key, pos: entry.pos, snippet: sense ? paragraphText(sense.html) : "" };
}

/**
 * Webster's 1828 dictionary: the Dictionary page's other work, beside the
 * Bible dictionaries and kept apart from them. Easton's and Smith's explain
 * the Bible's people, places and things; Webster explains its English, as
 * the language stood before two centuries of drift -- to PREVENT is to go
 * before, CONVERSATION is manner of life, CHARITY is love, MEAT is food, to
 * SUFFER is to allow, and to LET is to hinder. Sixty-nine thousand entries
 * is too many to list by letter the way the Bible dictionaries are, so the
 * index searches, and browses a page at a time from wherever the reader
 * starts.
 *
 * Typing a word looks it up as the word card does -- through its other
 * spellings and back from "prevented" or "knoweth" to the verb -- and puts
 * what that finds above the full-text hits, so the entry for the word
 * itself comes first, not the entries that happen to use it most. Enter
 * opens the headword typed, where Webster has it (see websterEnterTarget).
 *
 * The index keeps its place for the pane (see websterIndexMemory): a
 * Scripture link followed from an entry and Back again, or a pane opened
 * beside this one, finds the search and the list as the reader left them.
 */
export function WebsterDictionary({ entryId, switcher }: { entryId: number | null; switcher: ReactNode }) {
  const navigate = usePaneNavigate();
  const { id: paneId } = usePane();
  // Where this pane's index was, the last time it showed Webster.
  const [kept] = useState(() => keptWebsterIndex(paneId));
  const [query, setQuery] = useState(kept?.query ?? "");
  const [debounced, setDebounced] = useState(kept?.query ?? "");
  const [activeLetter, setActiveLetter] = useState(kept?.letter ?? "A");
  // Where the browse list starts, and where each earlier page started, for
  // going back.
  const [from, setFrom] = useState(kept?.from ?? "a");
  const [trail, setTrail] = useState<string[]>(kept?.trail ?? []);
  const listRef = useRef<HTMLDivElement | null>(null);
  // Where the list is scrolled to, by the row at its top (see listPlace):
  // kept as the reader scrolls, and gone back to whenever it is drawn again
  // -- on Back, or when the index a narrow pane folded away is opened again,
  // perhaps at another width.
  const listScroll = useRef(kept?.list ?? LIST_TOP);

  useEffect(() => {
    keepWebsterIndex(paneId, { query, letter: activeLetter, from, trail, list: listScroll.current });
  }, [paneId, query, activeLetter, from, trail]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  const term = debounced.trim();
  const showingSearch = term.length > 1;
  const { data: lookup } = useWebsterLookup(showingSearch ? term : null);
  const { data: hits, isFetching } = useWebsterSearch(showingSearch ? term : "");
  const { data: browse, isLoading: browseLoading } = useWebsterBrowse(from, BROWSE_PAGE);

  // The word itself first, then everything else that mentions it.
  const bestRows = useMemo(() => (lookup?.entries ?? []).map(rowOf), [lookup]);
  // What Enter opens: the word as typed, where it is a headword.
  const bestId = useMemo(() => websterEnterTarget(lookup), [lookup]);
  const searchRows = useMemo(() => {
    const shown = new Set(bestRows.map((r) => r.id));
    return (hits ?? []).filter((h) => !shown.has(h.id));
  }, [hits, bestRows]);
  // The page's rows under the letter, whole words only, and where the next
  // page starts: nowhere once the list has run past the letter or the end.
  const page = useMemo(() => browsePage(browse ?? [], activeLetter, BROWSE_PAGE), [browse, activeLetter]);
  const browseRows = page.rows;

  // A new page, letter or search is a new list: start it at the top. Only a
  // change of list does -- not the list the index mounts with, which is new
  // (and at the top) or the one being gone back to. On Back its rows are
  // already fetched and the list already put back where it was (below), and
  // a "top" here undid it.
  const listShown = useRef({ from, debounced });
  useEffect(() => {
    const shown = listShown.current;
    if (shown.from === from && shown.debounced === debounced) return;
    listShown.current = { from, debounced };
    listScroll.current = LIST_TOP;
    keepWebsterIndex(paneId, { query, letter: activeLetter, from, trail, list: LIST_TOP });
    listRef.current?.scrollTo({ top: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a new list is a change of these two
  }, [from, debounced]);

  // Where the list was, as soon as it is drawn with all its rows: at once
  // when they are fetched already, else when they arrive (the ref is called
  // again when `listReady` changes).
  const listReady = showingSearch ? lookup !== undefined && hits !== undefined : browse !== undefined;
  const placeList = useCallback(
    (list: HTMLDivElement | null) => {
      listRef.current = list;
      if (list && listReady) scrollToListPlace(list, listScroll.current);
    },
    [listReady],
  );

  function noteListScroll(e: React.UIEvent<HTMLDivElement>) {
    listScroll.current = listPlace(e.currentTarget);
    keepWebsterIndex(paneId, { query, letter: activeLetter, from, trail, list: listScroll.current });
  }

  function chooseLetter(letter: string) {
    setActiveLetter(letter);
    setFrom(letter.toLowerCase());
    setTrail([]);
  }

  function nextPage() {
    const next = page.next;
    if (next == null) return;
    setTrail((t) => [...t, from]);
    setFrom(next);
  }

  function previousPage() {
    if (trail.length === 0) return;
    setFrom(trail[trail.length - 1]);
    setTrail(trail.slice(0, -1));
  }

  function openEntry(id: number, e?: React.MouseEvent) {
    navigate(`/dictionary/webster/${id}`, e);
  }

  function row(r: IndexRow, note?: string) {
    return (
      <button
        key={r.id}
        type="button"
        data-entry={r.id}
        onClick={(ev) => openEntry(r.id, ev)}
        onAuxClick={(ev) => ev.button === 1 && openEntry(r.id, ev)}
        className={cx("block w-full border-b border-line px-3 py-2 text-left text-sm hover:bg-hover", entryId === r.id ? "bg-accent-soft" : undefined)}
      >
        <span className={cx("font-medium", entryId === r.id ? "text-accent" : "text-ink")}>{r.word}</span>
        {r.pos && <i className="ml-1.5 text-xs text-ink-3">{r.pos}</i>}
        {note && <span className="ml-1.5 text-xs text-ink-4">{note}</span>}
        {r.snippet && <span className="mt-0.5 line-clamp-2 block text-xs text-ink-3">{r.snippet}</span>}
      </button>
    );
  }

  return (
    <div className="flex h-full">
      <SidePanel id="dictionary-index" label="Dictionary index" defaultWidth={320} autoCollapse={entryId != null} className="flex flex-col">
        {switcher}
        <div className="border-b border-line p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-4" aria-hidden="true" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && bestId != null) openEntry(bestId);
              }}
              placeholder="Look up an English word…"
              aria-label="Look up or search Webster 1828"
              className={cx(inputSmClass, "w-full pl-7")}
            />
          </div>
          {isFetching && <LoadingState className="pt-2" label="Searching…" />}
        </div>
        {!showingSearch && (
          <div className="flex flex-wrap gap-0.5 border-b border-line p-2">
            {LETTERS.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => chooseLetter(l)}
                aria-pressed={activeLetter === l}
                className={cx("h-7 w-7 rounded-md text-xs font-medium", activeLetter === l ? "bg-accent-soft text-accent" : "text-ink-3 hover:bg-hover hover:text-ink")}
              >
                {l}
              </button>
            ))}
          </div>
        )}
        <div ref={placeList} onScroll={noteListScroll} className="min-h-0 flex-1 overflow-y-auto">
          {showingSearch && (
            <>
              {/* What this copy lacks, where the word typed is one of those
                  words ("even", "rank"), before the rows it qualifies. */}
              {lookup?.note && <p className="border-b border-line px-3 py-2 text-xs text-ink-3">{lookup.note}</p>}
              {/* "from prevent" on PREVENT's rows when "prevented" was typed,
                  not on PREVENTED's own after them. */}
              {bestRows.map((r) => row(r, lookup?.via === "base" && r.key === lookup.matched ? `from ${lookup.matched}` : undefined))}
              {searchRows.map((r) => row(r))}
              {bestRows.length === 0 && searchRows.length === 0 && !isFetching && <EmptyState compact title="No entries match" />}
            </>
          )}
          {!showingSearch && (
            <>
              {trail.length > 0 && (
                <button type="button" onClick={previousPage} className="flex w-full items-center gap-1 border-b border-line px-3 py-1.5 text-xs text-accent hover:bg-hover">
                  <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  Earlier entries
                </button>
              )}
              {browseLoading && <LoadingState />}
              {browseRows.map((r) => row(r))}
              {!browseLoading && browseRows.length === 0 && (
                <EmptyState compact title={trail.length > 0 ? `No more entries under ${activeLetter}` : `No entries under ${activeLetter}`} />
              )}
              {page.next != null && (
                <button type="button" onClick={nextPage} className="flex w-full items-center justify-end gap-1 px-3 py-2 text-xs text-accent hover:bg-hover">
                  More under {activeLetter}
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </>
          )}
        </div>
      </SidePanel>

      <WebsterEntryView entryId={entryId} onOpenEntry={openEntry} />
    </div>
  );
}

/** A row of links to other entries, each by headword and part of speech. */
function EntryChips({
  label,
  entries,
  onOpenEntry,
}: {
  label: string;
  entries: WebsterEntry[];
  onOpenEntry: (id: number, e?: React.MouseEvent) => void;
}) {
  if (entries.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1 text-xs">
      <span className="text-ink-3">{label}</span>
      {entries.map((h) => (
        <button
          key={h.id}
          type="button"
          onClick={(e) => onOpenEntry(h.id, e)}
          onAuxClick={(e) => e.button === 1 && onOpenEntry(h.id, e)}
          title={partOfSpeechName(h.pos) ?? undefined}
          className="rounded-full border border-line-2 px-2 py-0.5 text-ink-2 hover:bg-hover"
        >
          {h.word}
          {h.pos ? `, ${h.pos}` : ""}
        </button>
      ))}
    </div>
  );
}

/**
 * Sets `el` -- a title, a headword -- just small enough that none of its
 * words is broken to fit the block it is in (see fitScale): each word is
 * measured as the page draws it, at `el`'s own size, the pieces of one the
 * line broke added together. Leaves it at its own size where it fits.
 */
function fitWords(el: HTMLElement) {
  el.style.fontSize = "";
  // jsdom lays nothing out.
  if (typeof Range === "undefined" || !("getClientRects" in Range.prototype)) return;
  const block = el.matches("h1, p") ? el : (el.closest<HTMLElement>("h1, p") ?? el.parentElement);
  if (!block) return;
  const style = getComputedStyle(block);
  const available = block.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  const range = document.createRange();
  const width = (node: Node, start: number, end: number) => {
    range.setStart(node, start);
    range.setEnd(node, end);
    return [...range.getClientRects()].reduce((sum, r) => sum + r.width, 0);
  };
  const widths: number[] = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    for (const [start, end] of unbreakableRuns(node.textContent ?? "")) widths.push(width(node, start, end));
  }
  // A pixel short of the width, for glyphs that do not shrink quite in step.
  let scale = fitScale(widths, available - 1);
  // The comma after a headword goes with it ("INCOMPREHENS'IBLENESS,"), and
  // is not made smaller with it: fitted without it, the word filled the
  // line and the comma began the next.
  const after = el.nextSibling;
  const stuck = after?.nodeType === Node.TEXT_NODE && !/\s$/.test(el.textContent ?? "") ? /^[^\s-]+/.exec(after.textContent ?? "") : null;
  if (after && stuck && widths.length > 0) {
    scale = Math.min(scale, fitScale(widths.slice(-1), available - 1 - width(after, 0, stuck[0].length)));
  }
  if (scale < 1) el.style.fontSize = `${Math.floor(parseFloat(getComputedStyle(el).fontSize) * scale * 10) / 10}px`;
}

/** The entry itself: headword and part of speech, the other entries under
 *  the same word, and Webster's text with its Scripture linked. */
function WebsterEntryView({ entryId, onOpenEntry }: { entryId: number | null; onOpenEntry: (id: number, e?: React.MouseEvent) => void }) {
  const { id: paneId } = usePane();
  const { data: entry, isLoading } = useWebsterEntry(entryId);
  const { data: books } = useBooks();
  const typography = useReadingTypography(0.95);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  // How far down this entry the pane was when it last showed it, for Back
  // from a Scripture link followed from the middle of a long entry: gone to
  // once the entry is drawn (see websterIndexMemory).
  const placeToRestore = useRef(keptWebsterEntry(paneId, entryId));
  // The other entries filed under this word -- LET the verb, the noun, the
  // suffix -- found as the word card finds them. A participle whose own
  // entry is only a line ("PREVENT'ED, pp. Hindered") is sent on to its
  // verb, and a word that is also another's preterit (SAW) to that word.
  const { data: family } = useWebsterLookup(entry?.key ?? null);
  const { homographs, formOf, related } = useMemo(
    () => (entry ? entryRelations(entry, family) : { homographs: [], formOf: null, related: [] }),
    [entry, family],
  );
  const body = useMemo(() => (entry ? markWebsterParagraphs(entry.html) : ""), [entry]);

  // Another entry opens at its headword. The entry the view mounts with is
  // at the top already, or is going back to where it was (below).
  const entryShown = useRef(entryId);
  useEffect(() => {
    if (entryShown.current === entryId) return;
    entryShown.current = entryId;
    placeToRestore.current = null;
    scrollRef.current?.scrollTo({ top: 0 });
  }, [entryId]);

  // The title and the headword in capitals opening Webster's text are set
  // smaller in a column too narrow for them, rather than broken in the
  // middle of the word ("CONVERSATIO / N", "TRANSUBSTANTIA'TI / ON"): each
  // just as much as its longest word needs (see fitWords), again whenever
  // the column is resized, the reader's text size changes, or the page's
  // fonts arrive. Before the place is gone back to (below), which the
  // heading's height moves.
  //
  // A resize is fitted in the next frame, not in the observer's callback,
  // and only when the column's outer width has really changed: fitted in
  // the callback, the heading set back to full size and shrunk again moved
  // the very layout being reported, and the browser raised "ResizeObserver
  // loop" errors on every drag of a pane holding TRANSUBSTANTIATION. The
  // outer (border-box) width, because the inner one changes as the
  // scrollbar comes and goes with the heading's height, and a column
  // reported at no width (a pane being rebuilt) has nothing to fit to.
  useLayoutEffect(() => {
    const column = scrollRef.current;
    if (!column || !entry) return;
    let live = true;
    const fit = () => {
      if (live && column.clientWidth > 0) for (const el of column.querySelectorAll<HTMLElement>("h1, .wb-head b")) fitWords(el);
    };
    fit();
    void document.fonts?.ready.then(fit);
    if (typeof ResizeObserver === "undefined") return () => void (live = false);
    let fitted = column.getBoundingClientRect().width;
    let frame = 0;
    const observer = new ResizeObserver(([change]) => {
      const width = change?.borderBoxSize?.[0]?.inlineSize ?? change?.contentRect.width ?? 0;
      if (width <= 0 || Math.abs(width - fitted) < 0.5) return;
      fitted = width;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fit);
    });
    observer.observe(column, { box: "border-box" });
    return () => {
      live = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [entry, body, typography.fontSize, typography.lineHeight]);

  useLayoutEffect(() => {
    const place = placeToRestore.current;
    if (!place || !entry || entry.id !== entryId || !scrollRef.current) return;
    scrollToEntryPlace(scrollRef.current, bodyRef.current, place);
    placeToRestore.current = null;
  }, [entry, entryId]);

  function jumpToRef(bookOsis: string, chapter: number, verse: number, e?: React.MouseEvent) {
    const book = books?.find((b) => b.osis_code === bookOsis);
    if (book) openPassage({ bookId: book.id, chapter, verse }, { target: e ? targetFor(e) : "focused" });
  }

  return (
    <div
      ref={scrollRef}
      onScroll={(e) => entryId != null && keepWebsterEntry(paneId, { id: entryId, ...entryPlace(e.currentTarget, bodyRef.current) })}
      className="@container min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-6"
    >
      {/* The column's own width, not the window's, says how much margin it
          can spare: a middle pane with its index open has little. */}
      <div className="@md:px-4">
        {entryId == null && (
          <EmptyState
            icon={BookType}
            title="Webster's 1828 dictionary"
            description="What the King James Bible's English meant to its readers. Look a word up on the left, or double-click a word while reading."
          />
        )}
        {entryId != null && isLoading && <LoadingState />}
        {entryId != null && !isLoading && !entry && <EmptyState title="No such entry" description="This entry is not in the dictionary. Look the word up on the left." />}
        {entry && (
          <article className="mx-auto w-full max-w-[70ch]">
            {/* A long headword in a narrow column -- a middle pane with its
                index open -- is set smaller, by the column's size and then
                to fit its word (see fitWords), and breaks only where even
                that is not enough, rather than running off the edge under
                a sideways scrollbar. */}
            <h1 className="reading-font text-xl font-semibold text-ink [overflow-wrap:anywhere] @3xs:text-2xl @sm:text-3xl">{entry.word}</h1>
            {entry.pos && (
              <p className="mt-0.5 text-sm text-ink-3">
                <i>{entry.pos}</i>
                {partOfSpeechName(entry.pos) && <span className="text-ink-4"> · {partOfSpeechName(entry.pos)}</span>}
              </p>
            )}
            {/* Other spellings this entry is filed under (EVE's "even"): not
                other entries, which the chips below give. */}
            {entry.aliases.length > 0 && <p className="mt-1 text-sm text-ink-4">Also spelled {entry.aliases.join(", ")}</p>}

            {formOf && (
              <button
                type="button"
                onClick={(e) => onOpenEntry(formOf.id, e)}
                onAuxClick={(e) => e.button === 1 && onOpenEntry(formOf.id, e)}
                className="mt-3 flex items-center gap-1.5 text-sm text-accent hover:underline"
              >
                <CornerDownRight className="h-3.5 w-3.5" aria-hidden="true" />
                Read {formOf.word}
                {formOf.pos ? `, ${formOf.pos}` : ""}
              </button>
            )}

            <EntryChips label={`Other entries for “${entry.key}”`} entries={homographs} onOpenEntry={onOpenEntry} />
            <EntryChips label="See also" entries={related} onOpenEntry={onOpenEntry} />

            {/* The headword in capitals opening Webster's text is fitted to
                the column like the title (see fitWords): "CONVERSA'TION,"
                wants some 150px, and the middle pane with its index open
                leaves 144. `break-words` is left for a word too long for
                the column even at half its size. */}
            <div
              ref={bodyRef}
              className="reading-font mt-5 break-words text-ink [&_.wb-head]:text-ink-2 [&_.wb-quote]:pl-5 [&_.wb-quote]:text-ink-2"
              style={typography}
            >
              <CommentaryHtml html={body} onJumpToRef={jumpToRef} />
            </div>

            <p className="mt-10 border-t border-line pt-3 text-xs text-ink-4">
              Noah Webster, <i>An American Dictionary of the English Language</i>, 1828. Public domain.{" "}
              <button
                type="button"
                onClick={(e) => openAboutAt("webster-1828", e)}
                onAuxClick={(e) => e.button === 1 && openAboutAt("webster-1828", e)}
                className="text-accent hover:underline"
              >
                Sources and licences
              </button>
            </p>
          </article>
        )}
      </div>
    </div>
  );
}
