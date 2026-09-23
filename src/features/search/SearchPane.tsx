import { usePane, usePaneParams } from "../../workspace/PaneContext";
import { openPassage } from "../../workspace/openContent";
import { resolveBiblePane, useWorkspaceStore } from "../../state/workspaceStore";
import { SearchPanel } from "./SearchPanel";

/** The search docked as a pane. Its query lives in the pane's params, so it
 * survives a restart with the workspace, and a result opens in the Bible
 * pane beside it -- the list stays put for the next one. */
export function SearchPane() {
  const { id: paneId } = usePane();
  const [params, setParams] = usePaneParams("search");
  return (
    <SearchPanel
      query={params.query}
      onQueryChange={(query) => setParams({ query })}
      docked
      onOpenVerse={(bookId, chapter, verse, newPane) => {
        const bible = resolveBiblePane(useWorkspaceStore.getState());
        openPassage({ bookId, chapter, verse: verse ?? undefined }, { target: newPane || !bible ? "new" : bible.id, from: paneId });
      }}
    />
  );
}
