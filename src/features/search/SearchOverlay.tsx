import { useState } from "react";
import { Modal } from "../../components/ui/Modal";
import { openContent } from "../../workspace/openContent";
import { SearchPanel } from "./SearchPanel";

/** The search as a dialog over everything (Ctrl+K). "Dock" moves the same
 * search into a pane beside the reading, where it stays while the reader
 * opens one result after another. */
export function SearchOverlay({
  onClose,
  onJumpToVerse,
}: {
  onClose: () => void;
  onJumpToVerse: (bookId: number, chapter: number, verse: number | null, newPane: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  return (
    <Modal onClose={onClose} align="top" size="lg" bodyClassName="flex min-h-0 flex-col">
      <SearchPanel
        query={query}
        onQueryChange={setQuery}
        docked={false}
        autoFocus
        onOpenVerse={onJumpToVerse}
        onOpened={onClose}
        onDock={() => {
          openContent("search", { query }, { target: "new" });
          onClose();
        }}
      />
    </Modal>
  );
}
