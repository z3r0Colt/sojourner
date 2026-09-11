import { create } from "zustand";

export interface ConfirmRequest {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm button as destructive. */
  danger?: boolean;
}

interface ConfirmState {
  pending: (ConfirmRequest & { resolve: (ok: boolean) => void }) | null;
  open: (req: ConfirmRequest) => Promise<boolean>;
  settle: (ok: boolean) => void;
}

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  pending: null,
  open: (req) =>
    new Promise<boolean>((resolve) => {
      // Only one at a time; a second request while one is open cancels the first.
      get().pending?.resolve(false);
      set({ pending: { ...req, resolve } });
    }),
  settle: (ok) => {
    const p = get().pending;
    set({ pending: null });
    p?.resolve(ok);
  },
}));

/** In-app confirmation dialog (replaces the native OS confirm). Resolves
 * true when the user confirms. */
export function confirmDialog(req: ConfirmRequest): Promise<boolean> {
  return useConfirmStore.getState().open(req);
}

/** Convenience for the common "Delete X?" case. */
export function confirmDelete(what: string, detail?: string): Promise<boolean> {
  return confirmDialog({
    title: `Delete ${what}? `,
    message: detail ?? "This can't be undone.",
    confirmLabel: "Delete",
    danger: true,
  });
}
