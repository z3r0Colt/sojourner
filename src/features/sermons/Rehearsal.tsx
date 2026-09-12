import { useEffect, useMemo, useState } from "react";
import { Pause, Play, Presentation, Square, Timer, Volume2 } from "lucide-react";
import { useAddSermonEvent } from "../../api/queries";
import { Button, IconButton } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { toast } from "../../components/ui/toast";
import { cx, inputSmClass } from "../../components/ui/classes";
import { useTtsStore } from "../../state/ttsStore";
import { sectionsOf } from "./editor/documentModel";
import { elapsedMs, formatClock, startRun, usePreachingStore } from "./preachingSession";
import { localToday } from "./sermonFormat";
import type { Sermon } from "../../api/types";

/**
 * Rehearsal (SB2.3): a run of the manuscript with the clock going.
 *
 * "Rehearse" starts the clock; leaving it offers to log the run with its
 * duration and word count, and a note for what the run taught ("cut point
 * II"). "Rehearse aloud" hands the manuscript to read-aloud section by
 * section instead, with the same clock running alongside -- passage blocks
 * are read in the sermon's translation, and the source lines under a
 * citation are skipped, since nobody preaches a footnote.
 *
 * Every logged run feeds the measured speaking rate (SB2.4).
 */

/** The manuscript as read-aloud segments: one per section, the citations'
 * quoted words kept and their source lines dropped. */
export function rehearsalSegments(body: string): { id: number; text: string; label?: string }[] {
  return sectionsOf(body)
    .map((section, i) => ({
      id: i,
      text: [section.heading?.text, section.text].filter(Boolean).join(". ").trim(),
      label: section.heading?.text || undefined,
    }))
    .filter((s) => s.text.length > 0);
}

/** The clock bar a run shows in the sermon pane, plus the log dialog. */
export function RehearsalBar({ sermon, wordCount }: { sermon: Sermon; wordCount: number }) {
  const session = usePreachingStore((s) => s.session);
  const toggleClock = usePreachingStore((s) => s.toggleClock);
  const endRun = usePreachingStore((s) => s.end);
  const [pending, setPending] = useState<{ kind: "rehearsal" | "preaching"; seconds: number } | null>(null);
  const [, forceTick] = useState(0);

  const mine = session?.sermonId === sermon.id && !session.fullScreen;

  // A second's tick only redraws the clock; the figure itself is wall time,
  // so a missed tick costs nothing.
  useEffect(() => {
    if (!mine || session?.startedAt == null) return;
    const timer = window.setInterval(() => forceTick((n) => n + 1), 1000);
    return () => window.clearInterval(timer);
  }, [mine, session?.startedAt]);

  if (!mine || !session) return null;
  const running = session.startedAt != null;
  const target = sermon.target_minutes;
  const minutes = elapsedMs(session) / 60_000;
  const over = target != null && minutes > target;
  const nearly = target != null && !over && minutes > target * 0.9;

  return (
    <>
      <div
        className={cx(
          "flex shrink-0 items-center gap-2 border-b px-4 py-1.5 text-xs",
          over ? "border-danger bg-danger-soft text-danger" : nearly ? "border-warn bg-warn-soft text-warn" : "border-line bg-surface-2 text-ink-2",
        )}
        role="status"
      >
        <Timer className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="font-medium tabular-nums">{formatClock(elapsedMs(session))}</span>
        {target != null && <span className="text-ink-3">of {target}:00</span>}
        <IconButton
          icon={running ? Pause : Play}
          label={running ? "Pause the clock (T)" : "Start the clock (T)"}
          size="sm"
          onClick={toggleClock}
        />
        <Button
          size="sm"
          variant="ghost"
          icon={Square}
          className="ml-auto"
          onClick={() => {
            const result = endRun();
            if (result) setPending({ kind: result.kind, seconds: result.seconds });
          }}
        >
          Finish
        </Button>
      </div>
      {pending && (
        <LogRunModal
          sermon={sermon}
          kind={pending.kind}
          seconds={pending.seconds}
          wordCount={wordCount}
          onClose={() => setPending(null)}
        />
      )}
    </>
  );
}

/** What a finished run offers to write down. */
export function LogRunModal({
  sermon,
  kind,
  seconds,
  wordCount,
  onClose,
}: {
  sermon: Sermon;
  kind: "rehearsal" | "preaching";
  seconds: number;
  wordCount: number;
  onClose: () => void;
}) {
  const addEvent = useAddSermonEvent();
  const [note, setNote] = useState("");
  const [minutes, setMinutes] = useState(Math.max(1, Math.round(seconds / 60)));
  const noun = kind === "preaching" ? "preaching" : "rehearsal";

  return (
    <Modal
      title={`Log this ${noun}?`}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Don't log it
          </Button>
          <Button
            variant="primary"
            disabled={addEvent.isPending}
            onClick={() =>
              addEvent.mutate(
                {
                  sermonId: sermon.id,
                  kind,
                  date: kind === "preaching" ? (sermon.preach_date ?? localToday()) : localToday(),
                  venue: kind === "preaching" ? sermon.venue : null,
                  durationSeconds: Math.max(1, Math.round(minutes * 60)),
                  wordCount,
                  notes: note.trim() || null,
                },
                {
                  onSuccess: () => {
                    toast.success(`${minutes} min ${noun} logged`);
                    onClose();
                  },
                },
              )
            }
          >
            Log it
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-ink-2">
        {formatClock(seconds * 1000)} for {wordCount.toLocaleString()} words. Timed runs are what the app measures your
        speaking rate from, so every one makes "about N minutes" truer.
      </p>
      <label className="mb-3 flex items-center gap-2 text-sm text-ink-2">
        Minutes
        <input
          type="number"
          min={1}
          max={240}
          value={minutes}
          onChange={(e) => setMinutes(Math.max(1, Number(e.target.value) || 1))}
          aria-label="Minutes"
          className={cx(inputSmClass, "w-20")}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-ink-3">A note (optional)</span>
        <input
          autoFocus
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="cut point II"
          className={cx(inputSmClass, "w-full")}
        />
      </label>
    </Modal>
  );
}

/** "Rehearse" and "Rehearse aloud", for the sermon pane's toolbar. */
export function RehearsalButtons({ sermon }: { sermon: Sermon }) {
  const session = usePreachingStore((s) => s.session);
  const ttsTitle = useTtsStore((s) => s.title);
  const isPlaying = useTtsStore((s) => s.isPlaying);
  const startTts = useTtsStore((s) => s.start);
  const stopTts = useTtsStore((s) => s.stop);
  const segments = useMemo(() => rehearsalSegments(sermon.body), [sermon.body]);
  const title = `Rehearsing: ${sermon.title}`;
  const readingThis = isPlaying && ttsTitle === title;
  const running = session?.sermonId === sermon.id;

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        icon={Timer}
        active={running}
        disabled={running}
        title="Run the manuscript with the clock going, then log it"
        onClick={() => startRun(sermon.id, { kind: "rehearsal", fullScreen: false })}
      >
        Rehearse
      </Button>
      <Button
        size="sm"
        variant="ghost"
        icon={Presentation}
        title="The manuscript alone, at a pulpit size, with the clock"
        onClick={() =>
          startRun(sermon.id, {
            kind: sermon.preach_date === localToday() ? "preaching" : "rehearsal",
            fullScreen: true,
          })
        }
      >
        Preach
      </Button>
      <Button
        size="sm"
        variant="ghost"
        icon={Volume2}
        active={readingThis}
        disabled={segments.length === 0}
        title="Read the manuscript aloud, section by section, with the clock running"
        onClick={() => {
          if (readingThis) {
            stopTts();
            return;
          }
          if (!running) startRun(sermon.id, { kind: "rehearsal", fullScreen: false });
          startTts(title, "other", segments);
        }}
      >
        {readingThis ? "Stop" : "Rehearse aloud"}
      </Button>
    </>
  );
}
