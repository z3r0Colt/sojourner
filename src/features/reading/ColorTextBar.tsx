import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookUser, CircleHelp, ListTree } from "lucide-react";
import { api } from "../../api/client";
import type { ColorSpan, Verse } from "../../api/types";
import { Popover } from "../../components/ui/Popover";
import { cx } from "../../components/ui/classes";
import { usePane } from "../../workspace/PaneContext";
import { useUiStore } from "../../state/uiStore";
import { openContent, targetFor } from "../../workspace/openContent";
import { COLOR_FAMILIES, PRONOUN_TERMS, colorCategory, termBase, type ColorFamily } from "./colorText";

/** Codes too common to list as "in this chapter": pronouns and the small
 * words of position, sequence and amount. They still color the text. */
const UNLISTED = new Set(["PR", "L2", "T2", "QU"]);


/** A term picked in "In this chapter": its code, and its term without the
 * possessive ending (see `termBase`), which rings "Noah" and "Noah's" both. */
export interface Spotlight {
  code: string;
  term: string;
}

/** The strip under the Bible toolbar while color text or "Who's speaking" is
 * on: how much of each family the chapter holds (a thin bar), the families
 * to show or hide, what the chapter names (each one ringed in the text when
 * picked), and the speakers' key. */
export function ColorTextBar({
  colorOn,
  voiceOn,
  spans,
  verses,
  hidden,
  onToggleFamily,
  spotlight,
  onSpotlight,
  bookId,
  chapter,
  onHelp,
  compact = false,
}: {
  colorOn: boolean;
  voiceOn: boolean;
  spans: ColorSpan[] | undefined;
  verses: Verse[] | undefined;
  hidden: string[];
  onToggleFamily: (family: ColorFamily) => void;
  spotlight: Spotlight | null;
  onSpotlight: (s: Spotlight | null) => void;
  bookId: number;
  chapter: number;
  /** Opens "What the colors mean". */
  onHelp: () => void;
  /** A narrow pane: one line that scrolls sideways, without the questions. */
  compact?: boolean;
}) {
  const { id: paneId } = usePane();
  // With the underlines on, the chips carry them too, as their key.
  const marks = useUiStore((s) => s.colorTextMarks);
  const byFamily = useMemo(() => {
    const counts = new Map<ColorFamily, number>();
    for (const s of spans ?? []) {
      const f = colorCategory(s.code)?.family;
      if (f) counts.set(f, (counts.get(f) ?? 0) + 1);
    }
    return counts;
  }, [spans]);
  const total = Array.from(byFamily.values()).reduce((a, b) => a + b, 0);

  // Each term the chapter colors, once, with how often and where it first
  // stands (for its spelling in this translation).
  const terms = useMemo(() => {
    const text = new Map((verses ?? []).map((v) => [v.verse, v.text]));
    const seen = new Map<string, { code: string; term: string; word: string; count: number }>();
    for (const s of spans ?? []) {
      if (UNLISTED.has(s.code) || PRONOUN_TERMS.has(s.term)) continue;
      // A hidden family's words aren't colored, so there is nothing to ring.
      if (hidden.includes(colorCategory(s.code)?.family ?? "")) continue;
      // "Abraham's" is Abraham.
      const term = termBase(s.term);
      const key = `${s.code} ${term}`;
      const hit = seen.get(key);
      if (hit) hit.count += 1;
      else seen.set(key, { code: s.code, term, word: termBase((text.get(s.verse) ?? "").slice(s.start, s.end) || s.term), count: 1 });
    }
    return Array.from(seen.values());
  }, [spans, verses, hidden]);

  const { data: named } = useQuery({
    queryKey: ["factbookForPassage", bookId, chapter],
    queryFn: () => api.getFactbookForPassage(bookId, chapter),
    enabled: colorOn,
    staleTime: Infinity,
  });
  const entityFor = (word: string) => named?.find((p) => p.entity.name.toLowerCase() === word.toLowerCase())?.entity;

  return (
    <div className="border-b border-line px-3 py-1.5">
      {colorOn && total > 0 && (
        <div className="mb-1.5 flex h-1.5 w-full overflow-hidden rounded-full" role="img" aria-label="How much of each color family this chapter holds">
          {COLOR_FAMILIES.map((f) => {
            const n = byFamily.get(f.family) ?? 0;
            return n ? (
              <span
                key={f.family}
                title={`${f.label}: ${n} (${Math.round((100 * n) / total)}%)`}
                style={{ width: `${(100 * n) / total}%`, background: `var(--ct-${f.swatch})`, opacity: hidden.includes(f.family) ? 0.25 : 1 }}
              />
            ) : null;
          })}
        </div>
      )}
      <div
        className={cx("flex items-center gap-1", compact ? "overflow-x-auto whitespace-nowrap [scrollbar-width:thin]" : "flex-wrap", marks && "ct-marks")}
        role="group"
        aria-label="Color text families"
      >
        {colorOn &&
          COLOR_FAMILIES.map((f) => {
            const off = hidden.includes(f.family);
            return (
              <button
                key={f.family}
                type="button"
                aria-pressed={!off}
                title={`${f.question} ${f.label}: ${off ? "show" : "hide"} these colors`}
                onClick={() => onToggleFamily(f.family)}
                className={cx(
                  "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs transition-colors",
                  off ? "border-line text-ink-4 hover:text-ink-3" : "border-line bg-surface text-ink-2 hover:bg-hover",
                )}
              >
                <span
                  aria-hidden="true"
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: off ? "transparent" : `var(--ct-${f.swatch})`, boxShadow: `inset 0 0 0 1.5px var(--ct-${f.swatch})` }}
                />
                {!compact && <span className="text-ink-4">{f.question}</span>}
                <span
                  style={off ? undefined : { color: `var(--ct-${f.swatch})`, ["--ct-c" as string]: `var(--ct-${f.swatch})` }}
                  className={off ? "line-through" : "ct"}
                  data-ct-family={off ? undefined : f.family}
                >
                  {f.label}
                </span>
              </button>
            );
          })}
        {colorOn && terms.length > 0 && (
          <Popover
            width="w-80"
            align="right"
            trigger={({ toggle, open }) => (
              <button
                type="button"
                onClick={toggle}
                aria-expanded={open}
                className={cx(
                  "inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-xs text-ink-2 hover:bg-hover",
                  (open || spotlight) && "bg-accent-soft text-accent",
                )}
                title="Everyone, every place and every time this chapter names"
              >
                <ListTree className="h-3.5 w-3.5" aria-hidden="true" /> In this chapter
              </button>
            )}
          >
            <div className="max-h-[60vh] overflow-y-auto p-2">
              <p className="mb-2 px-1 text-xs text-ink-3">Pick one to ring every place it stands in the chapter.</p>
              {COLOR_FAMILIES.map((f) => {
                const list = terms
                  .filter((t) => colorCategory(t.code)?.family === f.family)
                  .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));
                if (list.length === 0) return null;
                return (
                  <section key={f.family} className="mb-2">
                    <h4 className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                      {f.question} {f.label}
                    </h4>
                    <div className="flex flex-wrap gap-1">
                      {list.map((t) => {
                        const on = spotlight?.code === t.code && spotlight.term === t.term;
                        const entity = (t.code === "PN" || t.code === "PP") && entityFor(t.word);
                        return (
                          <span key={`${t.code} ${t.term}`} className={cx("inline-flex items-center rounded-md border", on ? "border-accent bg-accent-soft" : "border-line")}>
                            <button
                              type="button"
                              className="px-1.5 py-0.5 text-sm hover:underline"
                              style={{ color: `var(--ct-${t.code})` }}
                              title={`${colorCategory(t.code)?.name}: ${t.count} in this chapter`}
                              onClick={() => onSpotlight(on ? null : { code: t.code, term: t.term })}
                            >
                              {t.word}
                              {t.count > 1 && <span className="ml-1 text-[11px] text-ink-4">{t.count}</span>}
                            </button>
                            {entity && (
                              <button
                                type="button"
                                className="border-l border-line px-1 py-0.5 text-ink-4 hover:text-accent"
                                title={`About ${entity.name} in the Factbook`}
                                aria-label={`About ${entity.name} in the Factbook`}
                                onClick={(e) => openContent("factbook", { id: entity.id }, { target: targetFor(e, "new"), from: paneId })}
                              >
                                <BookUser className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          </Popover>
        )}
        {voiceOn && !compact && (
          <span className="ml-1 inline-flex flex-wrap items-center gap-x-2 text-xs text-ink-3" aria-label="Who is speaking: key">
            <span className="voice-god text-ink-2">God speaking</span>
            <span className="voice-quote text-ink-2">Scripture quoted</span>
            <span className="voice-inner text-ink-2">speech within speech</span>
          </span>
        )}
        <span className="ml-auto flex items-center gap-2 text-xs text-ink-4">
          {colorOn && !compact ? "Click a colored word for more" : ""}
          <button type="button" onClick={onHelp} className="inline-flex items-center gap-1 text-ink-3 hover:text-accent" title="What the colors mean">
            <CircleHelp className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="sr-only">What the colors mean</span>
          </button>
        </span>
      </div>
    </div>
  );
}
