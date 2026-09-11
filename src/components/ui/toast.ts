import { create } from "zustand";

export type ToastKind = "info" | "success" | "error";

export interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
  /** Optional single action (e.g. Undo). Dismisses the toast when clicked. */
  action?: { label: string; onClick: () => void };
  durationMs: number;
}

interface ToastState {
  toasts: ToastItem[];
  push: (t: Omit<ToastItem, "id" | "durationMs"> & { durationMs?: number }) => number;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (t) => {
    const id = nextId++;
    const durationMs = t.durationMs ?? (t.kind === "error" ? 7000 : t.action ? 6000 : 3000);
    set((s) => ({ toasts: [...s.toasts.slice(-3), { ...t, id, durationMs }] }));
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Fire-and-forget notifications. Use for confirmations of saves, deletes,
 * and exports, and for any failure the user would otherwise never see. */
export const toast = {
  info: (message: string, action?: ToastItem["action"]) => useToastStore.getState().push({ kind: "info", message, action }),
  success: (message: string, action?: ToastItem["action"]) => useToastStore.getState().push({ kind: "success", message, action }),
  error: (message: string) => useToastStore.getState().push({ kind: "error", message }),
};
