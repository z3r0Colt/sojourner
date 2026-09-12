import { createContext, useContext } from "react";
import type { Passage } from "../../../api/types";

/** What a sermon's live blocks need from the pane around them: which
 * translation the passages render in, the text of every passage in the
 * document, and what "Open source" should do. The editor is shared with
 * notes, so everything here has a harmless default and the note editor
 * never provides it.
 *
 * The passage text arrives through the context rather than being fetched by
 * each block, because a manuscript with twenty passages must issue one
 * `get_passages` call, not twenty: the pane collects the references out of
 * the document and fills this map from a single query. */
export interface SermonEditorContextValue {
  /** The sermon's translation; null falls back to the reader's own. */
  translationId: number | null;
  /** Every passage in the document, keyed by `refKey`. */
  passages?: Map<string, Passage>;
  passagesLoading?: boolean;
  /** Reopens a citation's source in a pane beside the sermon (SB1.4). */
  openSource?: (kind: string, refId: string | null, event?: React.MouseEvent) => void;
  /** True while the manuscript is read-only (preaching mode, the handout). */
  readOnly?: boolean;
}

const SermonEditorContext = createContext<SermonEditorContextValue>({ translationId: null });

export const SermonEditorProvider = SermonEditorContext.Provider;

export function useSermonEditorContext(): SermonEditorContextValue {
  return useContext(SermonEditorContext);
}
