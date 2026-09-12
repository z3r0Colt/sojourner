import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { ExternalLink } from "lucide-react";
import { useSermonEditorContext } from "./context";

/** A citation: the quoted words the writer keeps, plus the identity of where
 * they came from. The source line is editable text, and "Open source"
 * reopens the commentary entry, confession section, Strong's word,
 * dictionary term, or page of a book the block was sent from (SB1.4). */
export function SourceBlock({ node, updateAttributes, editor }: NodeViewProps) {
  const { openSource, readOnly } = useSermonEditorContext();
  const kind = (node.attrs.kind as string) ?? "resource";
  const refId = (node.attrs.refId as string | null) ?? null;
  const label = (node.attrs.label as string) ?? "";
  const editable = editor.isEditable && !readOnly;

  return (
    <NodeViewWrapper as="blockquote" className="sermon-source" data-kind={kind}>
      <NodeViewContent className="sermon-source-body" />
      <div className="sermon-source-line" contentEditable={false}>
        <span aria-hidden="true">—&nbsp;</span>
        {editable ? (
          <input
            value={label}
            onChange={(e) => updateAttributes({ label: e.target.value })}
            placeholder="Where this came from"
            aria-label="Source"
            className="sermon-source-label"
          />
        ) : (
          <span className="sermon-source-label">{label || "Source"}</span>
        )}
        {refId && openSource && (
          <button
            type="button"
            className="sermon-source-open"
            onClick={(e) => openSource(kind, refId, e)}
            title={`Open ${label || "this source"} in a pane`}
          >
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
            Open source
          </button>
        )}
      </div>
    </NodeViewWrapper>
  );
}
