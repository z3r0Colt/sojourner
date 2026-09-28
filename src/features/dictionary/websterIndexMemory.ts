/**
 * Where each Dictionary pane's Webster index was, by pane id: what was typed
 * in its search box, and which page of the A-Z list it was on.
 *
 * The index is the page's own state, not a pane param, so it lived and died
 * with the component. But the component goes whenever the pane shows
 * something else: a Scripture link in an entry ("Ps.119") opens the psalm in
 * the same pane, and Back brought the entry again with the search box empty
 * and the list at "A", the reader's "prevent" and the entries around it gone.
 * The workspace also rebuilds a pane whenever the layout around it changes,
 * as when "Sources and licences" opens a pane beside it. The index keeps its
 * place here instead, for as long as the app is open, and a pane that shows
 * Webster again finds it as it was, whichever entry it opens on.
 *
 * The entry beside it keeps its place the same way (see keepWebsterEntry):
 * the Job.40 a reader followed from HAND is four thousand pixels down the
 * entry, and Back should find them there, not at its headword.
 */
export interface WebsterIndexPlace {
  /** What the search box held. */
  query: string;
  /** The browse list's letter, where the page starts, and where each earlier
   * page started (see browsePage). */
  letter: string;
  from: string;
  trail: string[];
  /** Where the list was scrolled to (see listPlace). */
  list: WebsterListPlace;
}

/** Where an index list is scrolled to: the entry in the row at its top and
 * how far into that row, as a share of its height, and the plain offset for
 * a list with no rows. */
export interface WebsterListPlace {
  /** The entry id of the row at the top, or null for none. */
  entry: number | null;
  within: number;
  scrollTop: number;
}

/** The top of a list: where a new page, letter or search starts. */
export const LIST_TOP: WebsterListPlace = { entry: null, within: 0, scrollTop: 0 };

/** The first of `items` still showing below `top`, found by halves (an entry
 *  like HAND has a hundred paragraphs and more, a page of the index two
 *  hundred rows), with its box; or none. */
function firstShowing(items: Element[], top: number): { index: number; box: DOMRect } | null {
  let lo = 0;
  let hi = items.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (items[mid].getBoundingClientRect().bottom > top) hi = mid;
    else lo = mid + 1;
  }
  return items[lo] ? { index: lo, box: items[lo].getBoundingClientRect() } : null;
}

/** Where index list `list` is scrolled to: the row (a `data-entry` element)
 *  at its top and how far into it -- a place among the entries, which the
 *  list drawn at another width finds again. A pixel offset cannot: the index
 *  a narrow pane folds away opens again narrower, its snippets wrapping onto
 *  more lines, and 700 pixels down "hand" was two rows short of where the
 *  reader left it. */
export function listPlace(list: HTMLElement): WebsterListPlace {
  const rows = [...list.querySelectorAll("[data-entry]")];
  const top = list.getBoundingClientRect().top;
  const first = firstShowing(rows, top);
  if (!first || first.box.height === 0) return { entry: null, within: 0, scrollTop: list.scrollTop };
  return {
    entry: Number((rows[first.index] as HTMLElement).dataset.entry),
    within: Math.max(0, (top - first.box.top) / first.box.height),
    scrollTop: list.scrollTop,
  };
}

/** Scrolls index list `list` to `place` (see listPlace): to its row where
 *  the list still has it, else to the offset. */
export function scrollToListPlace(list: HTMLElement, place: WebsterListPlace) {
  const row = place.entry != null ? list.querySelector(`[data-entry="${place.entry}"]`) : null;
  if (!row) {
    list.scrollTop = place.scrollTop;
    return;
  }
  const r = row.getBoundingClientRect();
  list.scrollTop += r.top - list.getBoundingClientRect().top + place.within * r.height;
}

/** How far down which entry a pane was: the paragraph at the top of the
 * column and how far into it, as a share of its height, so that a column
 * drawn at another width finds the same words (see WebsterEntryView); and
 * the plain offset, for a place above the first paragraph. */
export interface WebsterEntryPlace {
  id: number;
  /** The paragraph's index in the entry, or -1 for none. */
  para: number;
  within: number;
  scrollTop: number;
}

/** Where in an entry its column is scrolled to: the paragraph of `body` at
 *  the column's top, and how far into it as a share of its height -- a place
 *  in the text, which the column drawn at another width can find again. A
 *  pixel offset cannot: Back in a narrow pane draws the entry again with the
 *  index folded away, twice as wide and half as long, and HAND's Job.40 was
 *  then somewhere near its end. */
export function entryPlace(column: HTMLElement, body: HTMLElement | null): Omit<WebsterEntryPlace, "id"> {
  const paras = body ? [...body.querySelectorAll("p")] : [];
  const top = column.getBoundingClientRect().top;
  const first = firstShowing(paras, top);
  // Above the first paragraph (the headword and the lines under it), the
  // offset is the place.
  if (!first || first.box.height === 0 || (first.index === 0 && first.box.top > top)) return { para: -1, within: 0, scrollTop: column.scrollTop };
  return { para: first.index, within: (top - first.box.top) / first.box.height, scrollTop: column.scrollTop };
}

/** Scrolls `column` to `place` (see entryPlace). */
export function scrollToEntryPlace(column: HTMLElement, body: HTMLElement | null, place: Omit<WebsterEntryPlace, "id">) {
  const para = place.para >= 0 ? body?.querySelectorAll("p")[place.para] : undefined;
  if (!para) {
    column.scrollTop = place.scrollTop;
    return;
  }
  const r = para.getBoundingClientRect();
  column.scrollTop += r.top - column.getBoundingClientRect().top + place.within * r.height;
}

/** Enough for every Dictionary a workspace could hold, and then some: the
 * oldest is let go first. */
const MAX_KEPT = 32;

/** Keeps `value` under `key` as the newest, letting the oldest go. */
function keep<T>(map: Map<string, T>, key: string, value: T): void {
  map.delete(key);
  map.set(key, value);
  if (map.size > MAX_KEPT) map.delete(map.keys().next().value!);
}

const kept = new Map<string, WebsterIndexPlace>();
const keptEntries = new Map<string, WebsterEntryPlace>();

/** Keeps `place` as where pane `paneId`'s index is. */
export function keepWebsterIndex(paneId: string, place: WebsterIndexPlace): void {
  keep(kept, paneId, place);
}

/** Where pane `paneId`'s index was, if anywhere. */
export function keptWebsterIndex(paneId: string): WebsterIndexPlace | null {
  return kept.get(paneId) ?? null;
}

/** Keeps `place` as where pane `paneId`'s entry is scrolled to. */
export function keepWebsterEntry(paneId: string, place: WebsterEntryPlace): void {
  keep(keptEntries, paneId, place);
}

/** How far down entry `id` pane `paneId` was, if that is the entry it was
 * last showing. */
export function keptWebsterEntry(paneId: string, id: number | null): WebsterEntryPlace | null {
  const place = keptEntries.get(paneId);
  return place && place.id === id ? place : null;
}

/** For tests: forget every pane. */
export function forgetWebsterIndexes(): void {
  kept.clear();
  keptEntries.clear();
}
