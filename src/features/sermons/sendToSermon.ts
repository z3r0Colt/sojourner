import { useEffect } from "react";
import { create } from "zustand";
import { useWorkspaceStore } from "../../state/workspaceStore";
import { toast } from "../../components/ui/toast";
import type { PassageRef, SermonSourceKind } from "../../api/types";

/**
 * "Send to sermon", from anywhere in the study to the manuscript (SB1.4).
 *
 * A study pane only builds the item; this module decides where it goes. The
 * target is resolved when the action fires -- the sermon pane in the
 * sender's link group, else the focused sermon pane, else any open one --
 * and the request waits in this store for that pane's editor to pick it up.
 * If no pane answers (it was closed between the click and the insert), the
 * request times out and the picker opens instead, so a send is never
 * silently dropped.
 */

/** What a study pane hands over. A passage becomes a live block; everything
 * else becomes a citation that remembers where it came from. */
export interface SermonItem {
  kind: SermonSourceKind | "passage";
  /** The reopenable source identity (see sourceIdentity.ts); null for a passage. */
  refId: string | null;
  /** The source line ("Matthew Henry on Romans 8", "WCF 11.1"). */
  label: string;
  /** The quoted words, or the entry's first paragraph. */
  excerpt: string | null;
  /** Set when `kind` is "passage". */
  passage?: PassageRef;
}

interface PendingRequest {
  sermonId: number;
  item: SermonItem;
}

interface SendToSermonState {
  /** Waiting for a sermon pane's editor to insert it. */
  request: PendingRequest | null;
  /** Open while the reader is choosing which sermon to send to. */
  picking: SermonItem | null;
  setRequest: (request: PendingRequest | null) => void;
  setPicking: (item: SermonItem | null) => void;
}

export const useSendToSermonStore = create<SendToSermonState>((set) => ({
  request: null,
  picking: null,
  setRequest: (request) => set({ request }),
  setPicking: (picking) => set({ picking }),
}));

/** How long a queued insert waits for its pane before the picker opens. */
const HANDOFF_TIMEOUT_MS = 2500;
let handoffTimer: number | null = null;

/** The sermon pane an action should go to: one in the sender's link group
 * first (the manuscript beside the study pane being read), then the focused
 * pane, then any open sermon. */
function resolveSermonPane(fromPaneId?: string): { paneId: string; sermonId: number } | null {
  const { panes, focusedPaneId } = useWorkspaceStore.getState();
  const sermons = panes.filter((p): p is Extract<typeof p, { kind: "sermon" }> => p.kind === "sermon");
  if (sermons.length === 0) return null;
  const origin = panes.find((p) => p.id === (fromPaneId ?? focusedPaneId));
  const inGroup = origin?.linkGroup != null ? sermons.find((p) => p.linkGroup === origin.linkGroup) : undefined;
  const focused = sermons.find((p) => p.id === focusedPaneId);
  const pane = inGroup ?? focused ?? sermons[0];
  return { paneId: pane.id, sermonId: pane.params.id };
}

function clearTimer() {
  if (handoffTimer != null) {
    window.clearTimeout(handoffTimer);
    handoffTimer = null;
  }
}

/** Queues an insert for `sermonId` and opens the picker if nothing answers. */
export function queueInsert(sermonId: number, item: SermonItem): void {
  clearTimer();
  useSendToSermonStore.getState().setRequest({ sermonId, item });
  handoffTimer = window.setTimeout(() => {
    handoffTimer = null;
    const state = useSendToSermonStore.getState();
    if (!state.request) return;
    state.setRequest(null);
    state.setPicking(item);
  }, HANDOFF_TIMEOUT_MS);
}

/**
 * Sends material to the manuscript. With a sermon pane open it lands at the
 * cursor; with none, the picker offers the five most recently edited
 * sermons and "New sermon" (Q7).
 */
export function sendToSermon(item: SermonItem, opts: { from?: string } = {}): void {
  const target = resolveSermonPane(opts.from);
  if (!target) {
    useSendToSermonStore.getState().setPicking(item);
    return;
  }
  useWorkspaceStore.getState().focusPane(target.paneId);
  queueInsert(target.sermonId, item);
}

/** A sermon pane's editor consumes the request meant for it, once. */
export function useSendToSermonRequest(sermonId: number, onInsert: (item: SermonItem) => void): void {
  const request = useSendToSermonStore((s) => s.request);
  useEffect(() => {
    if (!request || request.sermonId !== sermonId) return;
    clearTimer();
    useSendToSermonStore.getState().setRequest(null);
    onInsert(request.item);
    toast.success(request.item.kind === "passage" ? "Passage added to the sermon" : "Sent to the sermon");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request, sermonId]);
}

/** The label a toast or a picker shows for what is being sent. */
export function describeItem(item: SermonItem): string {
  return item.label || (item.kind === "passage" ? "This passage" : "This source");
}
