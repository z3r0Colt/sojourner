import type { ComponentType } from "react";
import type { PaneKind } from "../state/workspaceStore";
import { EmptyState } from "../components/ui/EmptyState";
import { PANE_KINDS } from "./paneKinds";
import { usePane } from "./PaneContext";
import { useWorkspaceStore, findPane } from "../state/workspaceStore";

/** Placeholder until a kind's view is ported (W1.3 replaces every entry). */
function PanePlaceholder() {
  const { id } = usePane();
  const kind = useWorkspaceStore((s) => findPane(s.panes, id)?.kind);
  return <EmptyState compact title={kind ? PANE_KINDS[kind].label : "Empty pane"} description="This content is not available in a pane yet." />;
}

/** Kind → the component that renders it. Each reads its params from the
 * pane (see `usePaneParams`), never from the URL. Kept apart from the
 * metadata registry so views can import `paneKinds` and `openContent`
 * without a circular import back through themselves. */
export const PANE_COMPONENTS: Record<PaneKind, ComponentType> = {
  bible: PanePlaceholder,
  interlinear: PanePlaceholder,
  commentary: PanePlaceholder,
  crossrefs: PanePlaceholder,
  "confession-for-passage": PanePlaceholder,
  metrical: PanePlaceholder,
  westminster: PanePlaceholder,
  lexicon: PanePlaceholder,
  dictionary: PanePlaceholder,
  resource: PanePlaceholder,
  resources: PanePlaceholder,
  "commentary-book": PanePlaceholder,
  notes: PanePlaceholder,
  prayer: PanePlaceholder,
  memory: PanePlaceholder,
  plans: PanePlaceholder,
  harmony: PanePlaceholder,
  settings: PanePlaceholder,
};
