import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Plus, X } from "lucide-react";
import { useBooks, useSermonSeries, useTranslations } from "../../api/queries";
import { useSetting } from "../../hooks/useSetting";
import { parseReference, useBookLookup } from "../../hooks/useReferenceParser";
import { IconButton } from "../../components/ui/Button";
import { cx, inputSmClass, selectSmClass } from "../../components/ui/classes";
import { openContent, targetFor } from "../../workspace/openContent";
import { passageLabel } from "./sermonFormat";
import type { PassageRef, SermonStatus } from "../../api/types";
import type { SermonDraft } from "./sermonDraft";

/** The venue a new sermon starts with -- almost always the same church as
 * the last one, so it is remembered rather than retyped. */
export const LAST_VENUE_SETTING = "sermon_last_venue";
/** Asked for once, then filled into every sermon (SB1.2). */
export const PREACHER_NAME_SETTING = "preacher_name";

const STATUSES: SermonStatus[] = ["draft", "ready", "preached", "archived"];

/** What the folded details hold, on one line: "Sun, Sep 27 · Grace Church ·
 * Romans · Draft". */
function detailsSummary(draft: SermonDraft, series: { id: number; title: string }[] | undefined): string {
  const date = draft.preachDate ? new Date(`${draft.preachDate}T00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) : null;
  const seriesTitle = series?.find((s) => s.id === draft.seriesId)?.title ?? null;
  const status = draft.status[0].toUpperCase() + draft.status.slice(1);
  return [date, draft.venue, seriesTitle, status].filter(Boolean).join(" · ");
}

/** Title, text, big idea, and the details row (SB1.2). In a pane under
 * 640 px wide or 700 px tall -- a quarter of the screen in the Sermon prep
 * arrangement -- the details fold behind a one-line summary, so the
 * manuscript keeps its writing space. */
export function SermonHeader({
  draft,
  patch,
  paneWidth,
  paneHeight,
}: {
  draft: SermonDraft;
  patch: (fields: Partial<SermonDraft>) => void;
  paneWidth: number;
  paneHeight: number;
}) {
  const { data: books } = useBooks();
  const lookup = useBookLookup();
  const { data: translations } = useTranslations();
  const { data: series } = useSermonSeries();
  const [lastVenue, setLastVenue] = useSetting<string>(LAST_VENUE_SETTING, "");
  const [preacherName, setPreacherName] = useSetting<string>(PREACHER_NAME_SETTING, "");
  const [title, setTitle] = useState(draft.title);
  const [bigIdea, setBigIdea] = useState(draft.bigIdea);
  const [textInput, setTextInput] = useState("");
  const [textError, setTextError] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState("");
  // A height of 0 is a pane not yet measured, not a short one.
  const cramped = paneWidth < 640 || (paneHeight > 0 && paneHeight < 700);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // The title and big idea inputs own their text while typing; the pane
  // keys this component by sermon id, so switching sermons remounts it with
  // the new draft rather than fighting the caret with an effect.

  // A sermon with no venue or preacher yet takes the last ones used, so the
  // preacher is asked for once rather than every week.
  useEffect(() => {
    const fields: Partial<SermonDraft> = {};
    if (draft.venue == null && lastVenue) fields.venue = lastVenue;
    if (draft.preacher == null && preacherName) fields.preacher = preacherName;
    if (Object.keys(fields).length > 0) patch(fields);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastVenue, preacherName]);

  function addText() {
    const parsed = parseReference(textInput.trim(), lookup);
    if (!parsed) {
      setTextError("That doesn't look like a reference.");
      return;
    }
    const start = parsed.verse ?? 1;
    const end = parsed.verseEnd ?? parsed.verse ?? 999;
    const ref: PassageRef = { book_id: parsed.book.id, chapter: parsed.chapter, verse_start: start, verse_end: Math.max(start, end) };
    patch({ textRefs: [...draft.textRefs, ref] });
    setTextInput("");
    setTextError(null);
  }

  function addTag() {
    const tag = tagInput.trim();
    if (!tag || draft.tags.includes(tag)) {
      setTagInput("");
      return;
    }
    patch({ tags: [...draft.tags, tag] });
    setTagInput("");
  }

  const details = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-ink-3">
      <label className="flex items-center gap-1.5">
        <span>Date</span>
        <input
          type="date"
          value={draft.preachDate ?? ""}
          onChange={(e) => patch({ preachDate: e.target.value || null })}
          aria-label="Preach date"
          className={cx(inputSmClass, "w-36")}
        />
      </label>
      <label className="flex items-center gap-1.5">
        <span>Series</span>
        <select
          value={draft.seriesId ?? ""}
          onChange={(e) => patch({ seriesId: e.target.value ? Number(e.target.value) : null })}
          aria-label="Series"
          className={cx(selectSmClass, "w-36")}
        >
          <option value="">No series</option>
          {series?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
      </label>
      {draft.seriesId != null && (
        <label className="flex items-center gap-1.5">
          <span>No.</span>
          <input
            type="number"
            min={1}
            value={draft.seriesOrder != null ? draft.seriesOrder + 1 : ""}
            onChange={(e) => patch({ seriesOrder: e.target.value ? Math.max(0, Number(e.target.value) - 1) : null })}
            aria-label="Place in the series"
            className={cx(inputSmClass, "w-16")}
          />
        </label>
      )}
      <label className="flex items-center gap-1.5">
        <span>Church</span>
        <input
          value={draft.venue ?? ""}
          onChange={(e) => patch({ venue: e.target.value || null })}
          onBlur={(e) => e.target.value.trim() && setLastVenue(e.target.value.trim())}
          placeholder="Where"
          aria-label="Church"
          className={cx(inputSmClass, "w-36")}
        />
      </label>
      <label className="flex items-center gap-1.5">
        <span>Preacher</span>
        <input
          value={draft.preacher ?? ""}
          onChange={(e) => patch({ preacher: e.target.value || null })}
          onBlur={(e) => e.target.value.trim() && !preacherName && setPreacherName(e.target.value.trim())}
          placeholder="Who"
          aria-label="Preacher"
          className={cx(inputSmClass, "w-32")}
        />
      </label>
      <label className="flex items-center gap-1.5">
        <span>Translation</span>
        <select
          value={draft.translationId ?? ""}
          onChange={(e) => patch({ translationId: e.target.value ? Number(e.target.value) : null })}
          aria-label="Translation every passage renders in"
          className={cx(selectSmClass, "w-28")}
        >
          <option value="">Reader's</option>
          {translations?.map((t) => (
            <option key={t.id} value={t.id}>
              {t.code}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1.5">
        <span>Target</span>
        <input
          type="number"
          min={1}
          max={180}
          value={draft.targetMinutes ?? ""}
          onChange={(e) => patch({ targetMinutes: e.target.value ? Number(e.target.value) : null })}
          placeholder="min"
          aria-label="Target minutes"
          className={cx(inputSmClass, "w-16")}
        />
      </label>
      <label className="flex items-center gap-1.5">
        <span>Status</span>
        <select
          value={draft.status}
          onChange={(e) => patch({ status: e.target.value as SermonStatus })}
          aria-label="Status"
          className={cx(selectSmClass, "w-28")}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s[0].toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap items-center gap-1">
        {draft.tags.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-0.5 rounded-full bg-surface-2 px-2 py-0.5 text-ink-2">
            {tag}
            <button
              type="button"
              onClick={() => patch({ tags: draft.tags.filter((t) => t !== tag) })}
              aria-label={`Remove the tag ${tag}`}
              className="text-ink-4 hover:text-danger"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag();
            }
          }}
          onBlur={addTag}
          placeholder="Tag"
          aria-label="Add a tag"
          className={cx(inputSmClass, "w-20")}
        />
      </div>
    </div>
  );

  return (
    <header className="mb-3">
      <input
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          patch({ title: e.target.value });
        }}
        placeholder="Untitled sermon"
        aria-label="Sermon title"
        className="w-full border-0 bg-transparent text-2xl font-semibold text-ink outline-none placeholder:text-ink-4"
      />

      <input
        value={bigIdea}
        onChange={(e) => {
          setBigIdea(e.target.value);
          patch({ bigIdea: e.target.value });
        }}
        placeholder="The big idea, in one sentence"
        aria-label="Big idea"
        className="mt-0.5 w-full border-0 bg-transparent text-sm text-ink-2 outline-none placeholder:text-ink-4"
      />

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm">
        <span className="text-xs uppercase tracking-wide text-ink-3">Text</span>
        {draft.textRefs.map((ref, i) => (
          <span key={`${ref.book_id}-${ref.chapter}-${ref.verse_start}-${i}`} className="inline-flex items-center gap-0.5">
            <button
              type="button"
              onClick={(e) =>
                openContent("bible", { bookId: ref.book_id, chapter: ref.chapter, verse: ref.verse_start }, { target: targetFor(e) })
              }
              title="Open this passage"
              className="rounded px-1 text-accent hover:underline"
            >
              {passageLabel(books, { book_id: ref.book_id, chapter: ref.chapter, verse_start: ref.verse_start, verse_end: ref.verse_end })}
            </button>
            <button
              type="button"
              onClick={() => patch({ textRefs: draft.textRefs.filter((_, j) => j !== i) })}
              aria-label="Remove this text"
              className="text-ink-4 hover:text-danger"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </span>
        ))}
        <span className="inline-flex items-center gap-1">
          <input
            value={textInput}
            onChange={(e) => {
              setTextInput(e.target.value);
              setTextError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addText();
              }
            }}
            placeholder={draft.textRefs.length ? "Another passage" : "Romans 8:28-30"}
            aria-label="The sermon's text"
            className={cx(inputSmClass, "w-40")}
          />
          <IconButton icon={Plus} label="Add this text" size="sm" onClick={addText} />
        </span>
        {textError && <span className="text-xs text-danger">{textError}</span>}
      </div>

      {cramped ? (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setDetailsOpen((v) => !v)}
            aria-expanded={detailsOpen}
            className="inline-flex max-w-full items-center gap-1 text-xs text-ink-3 hover:text-ink"
          >
            {detailsOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
            <span className="shrink-0">Details</span>
            {!detailsOpen && <span className="truncate text-ink-4">· {detailsSummary(draft, series)}</span>}
          </button>
          {detailsOpen && <div className="mt-2">{details}</div>}
        </div>
      ) : (
        <div className="mt-2.5">{details}</div>
      )}
    </header>
  );
}
