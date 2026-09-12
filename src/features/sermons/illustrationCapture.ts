import { create } from "zustand";
import type { IllustrationKind } from "../../api/types";

/**
 * "Save as illustration" (SB3.2): the selection becomes the body, the
 * source label and identity are filled in from where it was read, and a
 * small modal asks only for a title and a kind. The host that shows that
 * modal is mounted once in the shell, so every study pane only has to
 * describe what it is handing over.
 */
export interface IllustrationDraft {
  title: string;
  body: string;
  sourceLabel: string | null;
  sourceRef: string | null;
  kind: IllustrationKind;
}

interface CaptureState {
  draft: IllustrationDraft | null;
  setDraft: (draft: IllustrationDraft | null) => void;
}

export const useIllustrationCapture = create<CaptureState>((set) => ({
  draft: null,
  setDraft: (draft) => set({ draft }),
}));

export function captureIllustration(draft: IllustrationDraft): void {
  useIllustrationCapture.getState().setDraft(draft);
}
