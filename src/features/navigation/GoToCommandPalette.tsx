import { useEffect, useMemo, useState } from "react";
import { BookA, BookOpen, History, Languages, ScrollText, type LucideIcon } from "lucide-react";
import type { Book } from "../../api/types";
import { findPane, recentPositions, useWorkspaceStore, type Position } from "../../state/workspaceStore";
import { openContent } from "../../workspace/openContent";
import { buildBookLookup, parseReference } from "../../hooks/useReferenceParser";
import { useBookAliases, useTranslationCoverage, useDictionaryIndex, useWestminsterDocuments } from "../../api/queries";
import { Modal } from "../../components/ui/Modal";
import { Kbd } from "../../components/ui/Page";
import { cx, inputClass } from "../../components/ui/classes";

const STRONGS_RE = /^[GgHh]\d{1,5}$/;

interface Candidate {
  key: string;
  icon: LucideIcon;
  label: string;
  hint?: string;
  disabled?: boolean;
  run: () => void;
}

/** Beyond a Bible reference, "Go to" also resolves a Strong's number
 * (G26, h430) straight to the Lexicon, and otherwise offers dictionary
 * terms and Westminster Standards documents whose title contains the typed
 * text -- so one shortcut reaches anywhere a study session tends to jump.
 * With nothing typed it lists recently read passages. */
export function GoToCommandPalette({
  books,
  translationId,
  translationLabel,
  onClose,
  onNavigate,
}: {
  books: Book[];
  translationId?: number | null;
  translationLabel?: string;
  onClose: () => void;
  onNavigate: (p: Position) => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const { data: aliases } = useBookAliases();
  const { data: coverage } = useTranslationCoverage(translationId ?? null);
  const { data: dictionaryIndex } = useDictionaryIndex();
  const { data: westminsterDocs } = useWestminsterDocuments();
  const focusedHistory = useWorkspaceStore((s) => findPane(s.panes, s.focusedPaneId)?.history);
  const recent = useMemo(() => recentPositions(focusedHistory), [focusedHistory]);
  const lookup = useMemo(() => buildBookLookup(books, aliases ?? []), [books, aliases]);
  const trimmed = query.trim();
  const parsed = useMemo(() => (trimmed ? parseReference(query, lookup) : null), [query, lookup, trimmed]);
  const isStrongs = !parsed && STRONGS_RE.test(trimmed);

  const coveredChapters = parsed && coverage ? coverage.find((c) => c.book_id === parsed.book.id)?.chapters : undefined;
  // Only warn once coverage data has actually loaded for this translation --
  // otherwise every reference would flash "not covered" for a frame.
  const notCovered = !!(parsed && coverage && (!coveredChapters || !coveredChapters.includes(parsed.chapter)));

  function bookName(id: number) {
    return books.find((b) => b.id === id)?.name ?? `#${id}`;
  }

  const candidates = useMemo<Candidate[]>(() => {
    if (trimmed === "") {
      return recent.map<Candidate>((p) => ({
        key: `recent-${p.bookId}:${p.chapter}`,
        icon: History,
        label: `${bookName(p.bookId)} ${p.chapter}`,
        hint: "Recently read",
        run: () => onNavigate({ bookId: p.bookId, chapter: p.chapter }),
      }));
    }
    if (parsed) {
      return [
        {
          key: "ref",
          icon: BookOpen,
          label: `${parsed.book.name} ${parsed.chapter}${parsed.verse ? `:${parsed.verse}` : ""}`,
          hint: notCovered ? `Not in ${translationLabel ?? "the selected translation"}` : "Open passage",
          disabled: notCovered,
          run: () => onNavigate({ bookId: parsed.book.id, chapter: parsed.chapter, verse: parsed.verse }),
        },
      ];
    }
    if (isStrongs) {
      const id = trimmed.toUpperCase();
      return [
        {
          key: "strongs",
          icon: Languages,
          label: `Strong's ${id}`,
          hint: "Open in the Lexicon",
          run: () => {
            openContent("lexicon", { id });
            onClose();
          },
        },
      ];
    }
    if (trimmed.length < 2) return [];
    const q = trimmed.toLowerCase();
    const dict = (dictionaryIndex ?? [])
      .filter((d) => d.term.toLowerCase().includes(q))
      .slice(0, 5)
      .map<Candidate>((d) => ({
        key: `dict-${d.slug}`,
        icon: BookA,
        label: d.term,
        hint: "Dictionary",
        run: () => {
          openContent("dictionary", { slug: d.slug });
          onClose();
        },
      }));
    const docs = (westminsterDocs ?? [])
      .filter((d) => d.title.toLowerCase().includes(q) || d.code.toLowerCase() === q)
      .slice(0, 5)
      .map<Candidate>((d) => ({
        key: `wm-${d.code}`,
        icon: ScrollText,
        label: d.title,
        hint: "Confessions",
        run: () => {
          openContent("westminster", { docCode: d.code });
          onClose();
        },
      }));
    return [...dict, ...docs];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmed, parsed, isStrongs, notCovered, dictionaryIndex, westminsterDocs, recent, translationLabel]);

  useEffect(() => setSelected(0), [trimmed]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((i) => Math.min(candidates.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      const c = candidates[selected];
      if (c && !c.disabled) c.run();
    }
  }

  return (
    <Modal onClose={onClose} align="top" size="md" bodyClassName="p-3">
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="John 3:16, Rom 8, G26, mercy, WCF…"
        aria-label="Go to"
        className={cx(inputClass, "w-full py-2 text-base")}
      />
      <div className="mt-2">
        {trimmed === "" && candidates.length === 0 && (
          <p className="px-2 py-1 text-sm text-ink-3">Type a Bible reference, a Strong's number, a dictionary term, or a confession name.</p>
        )}
        {trimmed !== "" && candidates.length === 0 && <p className="px-2 py-1 text-sm text-ink-3">Nothing matches that yet.</p>}
        <ul role="listbox" className="space-y-0.5">
          {candidates.map((c, i) => {
            const Icon = c.icon;
            return (
              <li key={c.key} role="option" aria-selected={i === selected}>
                <button
                  type="button"
                  disabled={c.disabled}
                  onMouseEnter={() => setSelected(i)}
                  onClick={c.run}
                  className={cx(
                    "flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm",
                    i === selected ? "bg-accent-soft text-accent" : "text-ink-2 hover:bg-hover",
                    c.disabled && "opacity-60",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate font-medium">{c.label}</span>
                  {c.hint && <span className={cx("text-xs", c.disabled ? "text-amber-700 dark:text-amber-400" : "text-ink-3")}>{c.hint}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="mt-2 flex items-center gap-2 border-t border-line px-1 pt-2 text-xs text-ink-3">
        <Kbd>↑↓</Kbd> choose <Kbd>Enter</Kbd> open <Kbd>Esc</Kbd> close
      </div>
    </Modal>
  );
}
