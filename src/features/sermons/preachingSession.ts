import { create } from "zustand";

/**
 * The clock a sermon is run against, and the session PreachingMode.tsx
 * shows (SB2.3, SB4.1).
 *
 * The clock is wall-time based: `startedAt` plus whatever has accumulated
 * while it was paused, never a tick counter -- so a stray key, a slow
 * render, or a minimized window can never lose or invent minutes. Callers
 * read `elapsedMs(session)` whenever they need the figure.
 */

export interface RunSession {
  sermonId: number;
  /** How the run will be logged when it ends. */
  kind: "rehearsal" | "preaching";
  /** Wall-clock ms when the running stretch began; null while paused. */
  startedAt: number | null;
  /** Milliseconds already banked from earlier stretches. */
  bankedMs: number;
  /** True once the run has been started at least once. */
  everStarted: boolean;
  /** Which section preaching mode is showing. */
  sectionIndex: number;
  /** Full-screen preaching mode is up (SB4.1). */
  fullScreen: boolean;
}

/** A finished run waiting to be written down. It lives in the store rather
 * than in preaching mode's own state because the overlay unmounts the
 * moment the session ends -- the offer to log the run has to outlive it. */
export interface PendingLog {
  sermonId: number;
  kind: "rehearsal" | "preaching";
  seconds: number;
}

interface PreachingState {
  session: RunSession | null;
  /** Finished runs waiting to be written down, oldest first. A queue rather
   * than a slot because a second run can end before the first one's offer
   * has been answered. */
  pendingLogs: PendingLog[];
  /** Starts a run and, unless `paused`, the clock with it. */
  start: (sermonId: number, opts?: { kind?: "rehearsal" | "preaching"; fullScreen?: boolean; paused?: boolean }) => void;
  toggleClock: () => void;
  setSection: (index: number) => void;
  stepSection: (delta: 1 | -1, sectionCount: number) => void;
  /** Leaves the run. A run of any length worth logging is queued for the
   * dialog to pick up. */
  end: () => PendingLog | null;
  clearPendingLog: () => void;
}

/** Shorter than this and there is nothing worth writing down. */
const MIN_LOGGABLE_SECONDS = 30;

/** What a finished run is worth writing down, or null if it was too short. */
function logOf(session: RunSession): PendingLog | null {
  const seconds = Math.round(elapsedMs(session) / 1000);
  return seconds >= MIN_LOGGABLE_SECONDS ? { sermonId: session.sermonId, kind: session.kind, seconds } : null;
}

export function elapsedMs(session: RunSession | null): number {
  if (!session) return 0;
  return session.bankedMs + (session.startedAt != null ? Date.now() - session.startedAt : 0);
}

export const usePreachingStore = create<PreachingState>((set, get) => ({
  session: null,
  pendingLogs: [],

  // Starting a run must never throw away one already going. The same sermon
  // carries its clock over -- "Preach" during a rehearsal moves the same run
  // to the pulpit rather than restarting it -- and a different sermon's run
  // is finished properly, so what it measured is still offered for the log.
  start: (sermonId, opts = {}) =>
    set((s) => {
      const running = s.session;
      const carryOver = running != null && running.sermonId === sermonId;
      const banked = running && !carryOver ? logOf(running) : null;
      return {
        session: carryOver
          ? {
              ...running,
              kind: opts.kind ?? running.kind,
              fullScreen: opts.fullScreen ?? running.fullScreen,
              ...(opts.paused && running.startedAt != null
                ? { bankedMs: elapsedMs(running), startedAt: null }
                : {}),
            }
          : {
              sermonId,
              kind: opts.kind ?? "rehearsal",
              startedAt: opts.paused ? null : Date.now(),
              bankedMs: 0,
              everStarted: !opts.paused,
              sectionIndex: 0,
              fullScreen: opts.fullScreen ?? true,
            },
        pendingLogs: banked ? [...s.pendingLogs, banked] : s.pendingLogs,
      };
    }),

  toggleClock: () =>
    set((s) => {
      if (!s.session) return {};
      const running = s.session.startedAt != null;
      return {
        session: running
          ? { ...s.session, bankedMs: elapsedMs(s.session), startedAt: null }
          : { ...s.session, startedAt: Date.now(), everStarted: true },
      };
    }),

  setSection: (index) =>
    set((s) => (s.session ? { session: { ...s.session, sectionIndex: Math.max(0, index) } } : {})),

  stepSection: (delta, sectionCount) =>
    set((s) => {
      if (!s.session) return {};
      const next = Math.min(Math.max(0, s.session.sectionIndex + delta), Math.max(0, sectionCount - 1));
      return next === s.session.sectionIndex ? {} : { session: { ...s.session, sectionIndex: next } };
    }),

  end: () => {
    const session = get().session;
    if (!session) {
      set({ session: null });
      return null;
    }
    const result: PendingLog = {
      sermonId: session.sermonId,
      kind: session.kind,
      seconds: Math.round(elapsedMs(session) / 1000),
    };
    const worth = logOf(session);
    set((s) => ({ session: null, pendingLogs: worth ? [...s.pendingLogs, worth] : s.pendingLogs }));
    return result;
  },

  clearPendingLog: () => set((s) => ({ pendingLogs: s.pendingLogs.slice(1) })),
}));

/** Starts a run of `sermonId`. Preaching mode (SB4.1) shows it full screen;
 * before that the sermon pane shows a clock bar. */
export function startRun(sermonId: number, opts: { kind?: "rehearsal" | "preaching"; fullScreen?: boolean; paused?: boolean } = {}): void {
  usePreachingStore.getState().start(sermonId, opts);
}

/** "31:04" -- minutes and seconds, which is how a preacher reads a clock. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
