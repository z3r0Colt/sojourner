import { useMemo, useState } from "react";
import { BookUser, MapPin, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { usePane } from "../../workspace/PaneContext";
import { openContent, targetFor } from "../../workspace/openContent";
import { useViewportClampedPosition } from "../../lib/useViewportClampedPosition";
import { IconButton } from "../../components/ui/Button";
import { cx } from "../../components/ui/classes";
import { useBooks, useColorTermVerses, usePassagesIn } from "../../api/queries";
import { formatRef, refKey } from "../../lib/passage";
import type { PassageRef } from "../../api/types";
import { COLOR_FAMILIES, colorCategory, colorStyle } from "./colorText";

const PAGE = 20;

/** Categories that name someone or somewhere the Factbook may know. */
const NAMED = new Set(["PN", "PP", "PG", "GS", "AN", "DE"]);

/** What a colored word is, and every verse where the same word has the same
 * color -- counted in the KJV, whose tagging every translation's colors come
 * from, and shown in the translation being read. */
export function ColorWordPopup({
  code,
  term,
  word,
  translationId,
  bookId,
  chapter,
  verse,
  x,
  y,
  anchorTop,
  onOpen,
  onClose,
}: {
  code: string;
  term: string;
  /** The word as clicked, in the translation being read. */
  word: string;
  translationId: number | null;
  /** Where the word was clicked: what finds the person or place it names. */
  bookId: number;
  chapter: number;
  verse: number;
  x: number;
  y: number;
  anchorTop: number;
  onOpen: (ref: PassageRef, e: React.MouseEvent) => void;
  onClose: () => void;
}) {
  const { ref, style, scrolled } = useViewportClampedPosition<HTMLDivElement>(x, y, {
    flipY: anchorTop,
    onDismiss: onClose,
    closeOnEscape: true,
    closeOnPressOutside: true,
  });
  const category = colorCategory(code);
  const family = COLOR_FAMILIES.find((f) => f.family === category?.family);
  const { data: books } = useBooks();
  const { data: found, isLoading } = useColorTermVerses(code, term);
  const [shown, setShown] = useState(PAGE);
  const refs: PassageRef[] = useMemo(
    () => (found ?? []).slice(0, shown).map((v) => ({ book_id: v.book_id, chapter: v.chapter, verse_start: v.verse, verse_end: v.verse })),
    [found, shown],
  );
  const { byKey } = usePassagesIn(translationId, refs);
  const differs = word.toLowerCase().replace(/\s+/g, " ") !== term;
  const { id: paneId } = usePane();
  // A name: who or where it is, from the Factbook (by the KJV's spelling,
  // in this verse), and a place's map.
  const named = NAMED.has(code);
  const { data: entity } = useQuery({
    queryKey: ["factbookForWord", bookId, chapter, verse, term, code],
    queryFn: async () => {
      const here = await api.getFactbookForWord(bookId, chapter, verse, term, null);
      if (here) return here;
      // Not linked to this verse in the Factbook: the one entry of the right
      // kind named by the word ("Moriah" finds "Moriah Mount"), if only one.
      const kind = code === "PP" ? "place" : code === "PN" ? "person" : null;
      const found = (await api.searchFactbook(term, 10)).filter(
        (e) => (!kind || e.kind === kind) && e.name.toLowerCase().split(/[\s,]+/)[0] === term.replace(/[’']s$/, ""),
      );
      return found.length === 1 ? found[0] : null;
    },
    enabled: named,
    staleTime: Infinity,
  });
  const { data: entry } = useQuery({
    queryKey: ["factbookEntry", entity?.id],
    queryFn: () => api.getFactbookEntry(entity!.id),
    enabled: !!entity && entity.kind === "place",
    staleTime: Infinity,
  });
  const atlas = entry?.links.find((l) => l.kind === "atlas");

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`${word}: ${category?.name ?? code}`}
      className="z-40 w-80 rounded-lg border border-line bg-surface px-3 pb-3 text-sm shadow-xl"
      style={style}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        className={cx(
          "sticky top-0 z-10 -mx-3 flex items-start justify-between gap-2 rounded-t-lg border-b bg-surface px-3 pb-2 pt-3",
          scrolled ? "border-line" : "border-transparent",
        )}
      >
        <div className="min-w-0">
          <div className="reading-font truncate text-lg font-semibold">
            <span className="ct" style={colorStyle(code)}>
              {word}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-ink-3">
            <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: `var(--ct-${code})` }} />
            <span className="font-medium text-ink-2">{category?.name ?? code}</span>
            {family && (
              <span>
                · {family.question} {family.label}
              </span>
            )}
          </div>
        </div>
        <IconButton icon={X} label="Close" size="sm" onClick={onClose} />
      </div>
      {entity && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs text-ink-2 hover:bg-hover"
            title="Open in the Factbook (Ctrl+click: in a new pane)"
            onClick={(e) => {
              openContent("factbook", { id: entity.id }, { target: targetFor(e, "new"), from: paneId });
              onClose();
            }}
          >
            <BookUser className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="font-medium">{entity.name}</span>
            {entity.description && entity.description !== "Place" && <span className="text-ink-3">· {entity.description}</span>}
          </button>
          {atlas && (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs text-ink-2 hover:bg-hover"
              title="Show on the map"
              onClick={(e) => {
                openContent("atlas", { slug: atlas.slug }, { target: targetFor(e, "new"), from: paneId });
                onClose();
              }}
            >
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" /> On the map
            </button>
          )}
        </div>
      )}
      <p className="mt-2 text-xs text-ink-3">
        {isLoading
          ? "Finding where else it appears…"
          : `In ${found?.length ?? 0} ${found?.length === 1 ? "verse" : "verses"} in this color${differs ? `, counted from the KJV’s “${term}”` : ""}.`}
      </p>
      <ul className="mt-1 space-y-0.5">
        {refs.map((r) => {
          const passage = byKey.get(refKey(r));
          return (
            <li key={refKey(r)}>
              <button
                type="button"
                className="w-full rounded px-1.5 py-1 text-left hover:bg-hover"
                title="Open (Ctrl+click: in a new pane)"
                onClick={(e) => onOpen(r, e)}
              >
                <span className="mr-1.5 text-xs font-semibold text-accent">{formatRef(books, r)}</span>
                <span className="line-clamp-2 block text-ink-2">{passage?.text ?? ""}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {found && found.length > shown && (
        <button type="button" className="mt-1 px-1.5 text-xs font-medium text-accent hover:underline" onClick={() => setShown((n) => n + PAGE)}>
          Show more ({found.length - shown} left)
        </button>
      )}
    </div>
  );
}
