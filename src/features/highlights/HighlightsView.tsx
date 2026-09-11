import { useMemo, useState } from "react";
import { Highlighter, Trash2 } from "lucide-react";
import { useAllHighlights, useBooks, useDeleteHighlight, usePassages } from "../../api/queries";
import { usePaneNavigate } from "../../workspace/PaneContext";
import { openPassage, targetFor } from "../../workspace/openContent";
import { Page } from "../../components/ui/Page";
import { Button } from "../../components/ui/Button";
import { EmptyState, LoadingState } from "../../components/ui/EmptyState";
import { toast } from "../../components/ui/toast";
import { confirmDelete } from "../../components/ui/confirm";
import { cardClass, cx, selectSmClass } from "../../components/ui/classes";
import { useReadingTypography } from "../../state/uiStore";
import { formatRef, refKey, toPassageRef, useBookName } from "../../lib/passage";
import { HIGHLIGHT_COLORS, UNDERLINE_COLOR, highlightColorFor, useHighlightLabels, type HighlightColorKey, type HighlightLabels } from "../reading/highlightColors";
import type { Highlight, Passage } from "../../api/types";

/** Which group on the page a highlight belongs to: one of the five named
 * colors, "underline", or "other" for a color from before the palette was
 * fixed. */
type GroupKey = HighlightColorKey | "underline" | "other";

const GROUP_ORDER: GroupKey[] = [...HIGHLIGHT_COLORS.map((c) => c.key), "underline", "other"];

function groupOf(h: Highlight): GroupKey {
  if (h.style === "underline") return "underline";
  return highlightColorFor(h.color)?.key ?? "other";
}

function groupTitle(key: GroupKey, labels: HighlightLabels): { label: string; name: string | null; swatch: string; underline: boolean } {
  if (key === "underline") return { label: "Underline", name: null, swatch: UNDERLINE_COLOR, underline: true };
  if (key === "other") return { label: "Other colors", name: null, swatch: "transparent", underline: false };
  const c = HIGHLIGHT_COLORS.find((x) => x.key === key)!;
  const label = labels[key]?.trim();
  return { label: label || c.name, name: label ? c.name : null, swatch: c.color, underline: false };
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** The verse text with the highlighted span marked the way the reader
 * shows it: the whole range for a verse-level highlight, or the exact
 * characters when the highlight was made within one verse in the
 * translation being shown (offsets from another translation would not
 * line up, so those fall back to marking the whole verse). */
function HighlightedText({ h, passage }: { h: Highlight; passage: Passage | undefined }) {
  if (!passage) return <span className="text-ink-4">…</span>;
  const text = passage.text;
  if (!text) return <span className="text-ink-4">Not in this translation.</span>;
  const markClass = h.style === "underline" ? "underline-only" : "highlight";
  const style = { ["--hl-color" as string]: h.color };
  const sameTranslation = h.translation_id == null || passage.verses.every((v) => v.translation_id === h.translation_id);
  const partial = h.char_start != null && h.char_end != null && h.verse_start === h.verse_end && sameTranslation;
  if (!partial) {
    return (
      <mark className={markClass} style={style}>
        {text}
      </mark>
    );
  }
  const start = Math.max(0, Math.min(text.length, h.char_start!));
  const end = Math.max(start, Math.min(text.length, h.char_end!));
  return (
    <>
      {text.slice(0, start)}
      <mark className={markClass} style={style}>
        {text.slice(start, end)}
      </mark>
      {text.slice(end)}
    </>
  );
}

export function HighlightsView() {
  const { data: highlights, isLoading } = useAllHighlights();
  const { data: books } = useBooks();
  const [labels] = useHighlightLabels();
  const bookName = useBookName();
  const navigate = usePaneNavigate();
  const deleteHighlight = useDeleteHighlight();
  const typography = useReadingTypography(0.9);
  const [colorFilter, setColorFilter] = useState<"all" | GroupKey>("all");
  const [bookFilter, setBookFilter] = useState<"all" | number>("all");

  const all = highlights ?? [];

  // Books that have highlights, in Bible order, for the filter.
  const bookIds = useMemo(() => {
    const seen = new Set<number>();
    for (const h of all) seen.add(h.book_id);
    return [...seen].sort((a, b) => a - b);
  }, [all]);
  const presentGroups = useMemo(() => {
    const seen = new Set<GroupKey>();
    for (const h of all) seen.add(groupOf(h));
    return GROUP_ORDER.filter((g) => seen.has(g));
  }, [all]);

  const filtered = useMemo(
    () => all.filter((h) => (colorFilter === "all" || groupOf(h) === colorFilter) && (bookFilter === "all" || h.book_id === bookFilter)),
    [all, colorFilter, bookFilter],
  );

  // Verse text: one round trip for everything shown.
  const refs = useMemo(() => {
    const seen = new Map<string, ReturnType<typeof toPassageRef>>();
    for (const h of filtered) {
      const ref = toPassageRef(h.book_id, h.chapter, h.verse_start, h.verse_end);
      seen.set(refKey(ref), ref);
    }
    return [...seen.values()];
  }, [filtered]);
  const { byKey: passagesByKey } = usePassages(refs);

  const groups = useMemo(() => {
    const map = new Map<GroupKey, Highlight[]>();
    for (const h of filtered) {
      const g = groupOf(h);
      map.set(g, [...(map.get(g) ?? []), h]);
    }
    return GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({ key: g, items: map.get(g)! }));
  }, [filtered]);

  async function remove(h: Highlight) {
    const ref = formatRef(books, toPassageRef(h.book_id, h.chapter, h.verse_start, h.verse_end));
    if (!(await confirmDelete(`the highlight on ${ref}`))) return;
    deleteHighlight.mutate(h.id, { onSuccess: () => toast.info(`Highlight removed: ${ref}`) });
  }

  const hasAny = all.length > 0;
  const nothingMatches = hasAny && filtered.length === 0;

  return (
    <Page
      title="Highlights"
      lead={hasAny ? `${all.length} ${all.length === 1 ? "highlight" : "highlights"} in ${bookIds.length} ${bookIds.length === 1 ? "book" : "books"}` : undefined}
      actions={
        hasAny && (
          <>
            <select value={colorFilter} onChange={(e) => setColorFilter(e.target.value as "all" | GroupKey)} className={selectSmClass} aria-label="Filter by color">
              <option value="all">All colors</option>
              {presentGroups.map((g) => {
                const t = groupTitle(g, labels);
                return (
                  <option key={g} value={g}>
                    {t.name ? `${t.label} (${t.name.toLowerCase()})` : t.label}
                  </option>
                );
              })}
            </select>
            <select
              value={bookFilter}
              onChange={(e) => setBookFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
              className={selectSmClass}
              aria-label="Filter by book"
            >
              <option value="all">All books</option>
              {bookIds.map((id) => (
                <option key={id} value={id}>
                  {bookName(id)}
                </option>
              ))}
            </select>
          </>
        )
      }
    >
      {isLoading && <LoadingState />}

      {!isLoading && !hasAny && (
        <EmptyState
          icon={Highlighter}
          title="No highlights yet"
          description="While reading, select some text or right-click a verse and pick a color. Each color has a name of its own (Promise, Command, and so on) that you can change under Settings → Reading."
          action={
            <Button variant="primary" onClick={(e) => navigate("/", e)}>
              Open the Bible
            </Button>
          }
        />
      )}
      {nothingMatches && <EmptyState compact title="No highlights match this filter" />}

      {groups.map((g) => {
        const t = groupTitle(g.key, labels);
        return (
          <section key={g.key} className="mb-8">
            <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-3">
              <span
                aria-hidden="true"
                className={cx("inline-block h-3 w-3 shrink-0 rounded-full", t.underline ? "border-b-2 rounded-none" : "border border-line-2")}
                style={t.underline ? { borderColor: t.swatch } : { backgroundColor: t.swatch }}
              />
              {t.label}
              {t.name && <span className="font-normal normal-case text-ink-4">{t.name}</span>}
              <span className="font-normal text-ink-4">· {g.items.length}</span>
            </h2>
            <ul className="space-y-3">
              {g.items.map((h) => {
                const ref = toPassageRef(h.book_id, h.chapter, h.verse_start, h.verse_end);
                const label = formatRef(books, ref);
                return (
                  <li key={h.id} className={cardClass}>
                    <div className="mb-1 flex items-baseline justify-between gap-3">
                      <button
                        type="button"
                        className="text-sm font-semibold text-accent hover:underline"
                        title="Open this passage (Ctrl+click for a new pane)"
                        onClick={(e) => openPassage({ bookId: h.book_id, chapter: h.chapter, verse: h.verse_start }, { target: targetFor(e) })}
                        onAuxClick={(e) => {
                          if (e.button === 1) openPassage({ bookId: h.book_id, chapter: h.chapter, verse: h.verse_start }, { target: "new" });
                        }}
                      >
                        {label}
                      </button>
                      <span className="shrink-0 text-xs text-ink-3">{formatDate(h.created_at)}</span>
                    </div>
                    <p className="reading-font text-ink-2" style={typography}>
                      <HighlightedText h={h} passage={passagesByKey.get(refKey(ref))} />
                    </p>
                    <div className="mt-2 flex justify-end">
                      <Button size="sm" variant="danger-ghost" icon={Trash2} onClick={() => remove(h)}>
                        Remove
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </Page>
  );
}
