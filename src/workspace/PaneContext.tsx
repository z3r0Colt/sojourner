import { createContext, useCallback, useContext } from "react";
import { findPane, useWorkspaceStore, type PaneKind, type ParamsOf } from "../state/workspaceStore";
import { openContent, targetFor, type OpenTarget } from "./openContent";
import { parseRoute } from "./paneKinds";

/** What a view inside a pane can learn about its pane: which one it is,
 * whether it is the focused pane, and how wide it currently is (pixels,
 * measured -- toolbars fold below about 520px). */
export interface PaneContextValue {
  id: string;
  isFocused: boolean;
  width: number;
}

export const PaneContext = createContext<PaneContextValue | null>(null);

export function usePane(): PaneContextValue {
  const ctx = useContext(PaneContext);
  if (!ctx) throw new Error("usePane must be used inside a Pane");
  return ctx;
}

/** For components that may render outside any pane (the read-aloud button
 * in a popover, the preview card). */
export function usePaneOptional(): PaneContextValue | null {
  return useContext(PaneContext);
}

/** A pane view's params and a setter that patches them without touching
 * history. Views are keyed by kind, so the pane's kind always matches. */
export function usePaneParams<K extends PaneKind>(kind: K): [ParamsOf<K>, (patch: Partial<ParamsOf<K>>) => void] {
  const { id } = usePane();
  const params = useWorkspaceStore((s) => {
    const pane = findPane(s.panes, id);
    return pane && pane.kind === kind ? (pane.params as ParamsOf<K>) : null;
  });
  const setPaneParams = useWorkspaceStore((s) => s.setPaneParams);
  const setParams = useCallback((patch: Partial<ParamsOf<K>>) => setPaneParams(id, kind, patch), [id, kind, setPaneParams]);
  if (!params) throw new Error(`Pane ${id} is not a ${kind} pane`);
  return [params, setParams];
}

/** Drop-in for `useNavigate` inside a pane view: the path is applied to this
 * pane (or a new one for Ctrl+click / middle-click when an event is
 * passed). Paths the app does not know are ignored. */
export function usePaneNavigate(): (to: string, event?: { ctrlKey: boolean; metaKey: boolean; button?: number }) => void {
  const { id } = usePane();
  return useCallback(
    (to: string, event?: { ctrlKey: boolean; metaKey: boolean; button?: number }) => {
      const [pathname, search] = to.split("?");
      const parsed = parseRoute(pathname, search ? `?${search}` : "");
      if (!parsed) return;
      const target: OpenTarget = event ? targetFor(event, id) : id;
      openContent(parsed.kind, parsed.params as never, { target, from: id });
    },
    [id],
  );
}
