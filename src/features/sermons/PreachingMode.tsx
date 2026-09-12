import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Minus, Pause, Play, Plus, X } from "lucide-react";
import { useBooks, usePassagesIn, useSermon } from "../../api/queries";
import { useReaderTranslationId } from "../../state/workspaceStore";
import { useUiStore } from "../../state/uiStore";
import { IconButton } from "../../components/ui/Button";
import { confirmDialog } from "../../components/ui/confirm";
import { cx } from "../../components/ui/classes";
import { ManuscriptView } from "./ManuscriptView";
import { elapsedMs, formatClock, usePreachingStore } from "./preachingSession";
import { countWords, manuscriptText, passageBlocks, sectionsOf } from "./editor/documentModel";
import { sermonTextLabel } from "./sermonFormat";
import { useSermonWordCount, useSpeakingRateInfo } from "./sermonStats";

/**
 * Preaching mode (SB4.1): the manuscript alone, at a pulpit size, paged at
 * its headings, with a clock.
 *
 * It is a full-screen overlay above every pane and modal but below the
 * confirm dialog, so leaving with the clock running can still ask. Nothing
 * here is editable; the clock is wall-time based (see preachingSession.ts), so
 * a stray key can never reset it. On the way out it offers to write the run
 * down as a preaching or a rehearsal.
 */
export function PreachingMode() {
  const session = usePreachingStore((s) => s.session);
  if (!session?.fullScreen) return null;
  return <PreachingOverlay key={session.sermonId} />;
}

function PreachingOverlay() {
  const session = usePreachingStore((s) => s.session);
  const toggleClock = usePreachingStore((s) => s.toggleClock);
  const stepSection = usePreachingStore((s) => s.stepSection);
  const setSection = usePreachingStore((s) => s.setSection);
  const endRun = usePreachingStore((s) => s.end);
  const pulpitFontSize = useUiStore((s) => s.pulpitFontSize);
  const setPulpitFontSize = useUiStore((s) => s.setPulpitFontSize);
  const sermonId = session?.sermonId ?? null;
  const { data: sermon } = useSermon(sermonId);
  const { data: books } = useBooks();
  const readerTranslationId = useReaderTranslationId();
  const rate = useSpeakingRateInfo();
  const [, tick] = useState(0);

  const body = sermon?.body ?? "";
  const translationId = sermon?.translation_id ?? readerTranslationId;
  const refs = useMemo(() => passageBlocks(body), [body]);
  const { byKey } = usePassagesIn(translationId, refs);
  const sections = useMemo(() => sectionsOf(body), [body]);
  const words = useSermonWordCount(body, translationId, rate);

  const index = Math.min(session?.sectionIndex ?? 0, Math.max(0, sections.length - 1));
  const current = sections[index];
  const next = sections[index + 1];

  // The clock redraws every second; the figure itself is wall time.
  useEffect(() => {
    if (session?.startedAt == null) return;
    const timer = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(timer);
  }, [session?.startedAt]);

  // Every key the pulpit needs, and nothing else: paging, the clock, the
  // text size, and the way out.
  useEffect(() => {
    async function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        await leave();
        return;
      }
      if (e.key === " " || e.key === "PageDown" || e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        stepSection(1, sections.length);
      } else if (e.key === "PageUp" || e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        stepSection(-1, sections.length);
      } else if (e.key === "Home") {
        e.preventDefault();
        setSection(0);
      } else if (e.key === "End") {
        e.preventDefault();
        setSection(sections.length - 1);
      } else if (e.key.toLowerCase() === "t") {
        e.preventDefault();
        toggleClock();
      } else if (e.ctrlKey && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        setPulpitFontSize(pulpitFontSize + 2);
      } else if (e.ctrlKey && e.key === "-") {
        e.preventDefault();
        setPulpitFontSize(pulpitFontSize - 2);
      }
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  });

  async function leave() {
    const running = usePreachingStore.getState().session?.startedAt != null;
    if (running) {
      const ok = await confirmDialog({
        title: "Leave preaching mode?",
        message: "The clock is still running. Leaving stops it and offers to log the run.",
        confirmLabel: "Leave",
      });
      if (!ok) return;
    }
    // The store keeps what the run measured; RunLogHost offers to write it
    // down, since this overlay is about to unmount.
    endRun();
  }

  if (!session || !sermon) return null;

  const elapsed = elapsedMs(session);
  const target = sermon.target_minutes;
  const remaining = target != null ? target * 60_000 - elapsed : null;
  const fraction = target != null ? Math.min(1, elapsed / (target * 60_000)) : words.total > 0 ? countWords(manuscriptText(current?.html ?? "")) / words.total : 0;
  const over = target != null && elapsed > target * 60_000;
  const nearly = target != null && !over && elapsed > target * 60_000 * 0.9;
  const text = sermonTextLabel(books, sermon);

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-bg text-ink"
      role="dialog"
      aria-modal="true"
      aria-label={`Preaching ${sermon.title}`}
    >
      {/* The screen's left and right thirds page the sermon, so a laptop at
          the pulpit can be driven with a touch rather than a keystroke. */}
      <div className="relative min-h-0 flex-1">
        <button
          type="button"
          aria-label="Previous section"
          className="absolute inset-y-0 left-0 z-10 w-1/3 cursor-w-resize opacity-0"
          onClick={() => stepSection(-1, sections.length)}
        />
        <button
          type="button"
          aria-label="Next section"
          className="absolute inset-y-0 right-0 z-10 w-1/3 cursor-e-resize opacity-0"
          onClick={() => stepSection(1, sections.length)}
        />
        <div className="h-full overflow-y-auto px-[8vw] py-10">
          <div className="mx-auto max-w-[52ch]" style={{ fontSize: `${pulpitFontSize}px`, lineHeight: 1.5 }}>
            {index === 0 && (
              <header className="mb-8">
                <h1 className="reading-font font-semibold">{sermon.title}</h1>
                {sermon.big_idea && <p className="mt-1 text-ink-2">{sermon.big_idea}</p>}
                {text && <p className="mt-1 text-ink-3">{text}</p>}
              </header>
            )}
            {current ? (
              <ManuscriptView html={current.html} passages={byKey} className="reading-font pulpit" />
            ) : (
              <p className="text-ink-3">Nothing written yet.</p>
            )}
          </div>
        </div>
      </div>

      <div
        className={cx(
          "shrink-0 border-t px-5 py-2",
          over ? "border-danger bg-danger-soft" : nearly ? "border-warn bg-warn-soft" : "border-line bg-surface-2",
        )}
      >
        <div className="mb-1.5 h-0.5 w-full rounded-full bg-line" aria-hidden="true">
          <div
            className={cx("h-full rounded-full", over ? "bg-danger" : nearly ? "bg-warn" : "bg-accent")}
            style={{ width: `${Math.round(fraction * 100)}%` }}
          />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className={cx("font-medium tabular-nums", over ? "text-danger" : nearly ? "text-warn" : "text-ink")}>
            {formatClock(elapsed)}
            {remaining != null && (
              <span className="ml-2 font-normal text-ink-3">
                {remaining >= 0 ? `${formatClock(remaining)} left` : `${formatClock(-remaining)} over`}
              </span>
            )}
          </span>
          <IconButton
            icon={session.startedAt != null ? Pause : Play}
            label={session.startedAt != null ? "Pause the clock (T)" : "Start the clock (T)"}
            size="sm"
            onClick={toggleClock}
          />
          <span className="min-w-0 flex-1 truncate text-ink-2">
            {current?.heading?.text || (index === 0 ? "Opening" : "")}
            {next?.heading?.text && <span className="text-ink-4"> → {next.heading.text}</span>}
          </span>
          <span className="tabular-nums text-ink-3">
            {index + 1} of {Math.max(1, sections.length)}
          </span>
          <IconButton icon={Minus} label="Smaller text (Ctrl+-)" size="sm" onClick={() => setPulpitFontSize(pulpitFontSize - 2)} />
          <IconButton icon={Plus} label="Larger text (Ctrl+=)" size="sm" onClick={() => setPulpitFontSize(pulpitFontSize + 2)} />
          <IconButton icon={X} label="Leave preaching mode (Esc)" size="sm" onClick={() => void leave()} />
        </div>
      </div>

    </div>,
    document.body,
  );
}
