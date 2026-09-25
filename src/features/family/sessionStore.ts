import { create } from "zustand";

/**
 * A family worship session in progress: which step the family is on, whether
 * it fills the screen, and whose names they did not get to. One session at a
 * time, shared by the Family worship pane and the gather-round overlay, so
 * going full screen mid-way (or back) carries on from the same step.
 */
interface FamilySessionState {
  active: boolean;
  /** Filling the screen with large type, for a table or a television. */
  large: boolean;
  step: number;
  /** After Amen: the session is logged and the closing screen shows. */
  finished: boolean;
  /** People on tonight's list the family unticked: not marked as prayed for. */
  unticked: number[];
  begin: (opts?: { large?: boolean }) => void;
  setStep: (step: number) => void;
  setLarge: (large: boolean) => void;
  toggleTicked: (personId: number) => void;
  markFinished: () => void;
  end: () => void;
}

export const useFamilySession = create<FamilySessionState>((set) => ({
  active: false,
  large: false,
  step: 0,
  finished: false,
  unticked: [],
  begin: (opts = {}) =>
    set((s) =>
      // Beginning again while a session runs only changes how it is shown.
      s.active && !s.finished
        ? { large: opts.large ?? s.large }
        : { active: true, large: opts.large ?? false, step: 0, finished: false, unticked: [] },
    ),
  setStep: (step) => set({ step: Math.max(0, step) }),
  setLarge: (large) => set({ large }),
  toggleTicked: (personId) =>
    set((s) => ({ unticked: s.unticked.includes(personId) ? s.unticked.filter((id) => id !== personId) : [...s.unticked, personId] })),
  markFinished: () => set({ finished: true }),
  end: () => set({ active: false, large: false, step: 0, finished: false, unticked: [] }),
}));

/** Begin tonight's family worship from anywhere (Today, the command palette). */
export function beginFamilyWorship(large = false): void {
  useFamilySession.getState().begin({ large });
}
