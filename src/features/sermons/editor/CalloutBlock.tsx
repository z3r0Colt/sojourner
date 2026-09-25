import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { CALLOUT_KINDS, CALLOUT_LABEL, isCalloutKind, type CalloutKind } from "./callouts";
import { useSermonEditorContext } from "./context";

/** A typed block (see callouts.ts): a colored rule and a chip naming the
 * kind, over ordinary editable paragraphs. The chip is a select, so changing
 * an illustration into an application is one choice and never a retype; a
 * custom block also gets a field for its own name. */
export function CalloutBlock({ node, updateAttributes, editor }: NodeViewProps) {
  const { readOnly } = useSermonEditorContext();
  const kind: CalloutKind = isCalloutKind(node.attrs.kind) ? node.attrs.kind : "explanation";
  const label = (node.attrs.label as string | null) ?? "";
  const editable = editor.isEditable && !readOnly;

  return (
    <NodeViewWrapper as="aside" className="sermon-callout" data-kind={kind}>
      <div className="sermon-callout-chip" contentEditable={false}>
        {editable ? (
          <>
            <select
              value={kind}
              onChange={(e) => updateAttributes({ kind: e.target.value })}
              aria-label="Kind of block"
              className="sermon-callout-kind"
            >
              {CALLOUT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {CALLOUT_LABEL[k]}
                </option>
              ))}
            </select>
            {kind === "custom" && (
              <input
                value={label}
                onChange={(e) => updateAttributes({ label: e.target.value })}
                placeholder="Name this block"
                aria-label="Block name"
                className="sermon-callout-label"
              />
            )}
          </>
        ) : (
          <span className="sermon-callout-kind">{kind === "custom" ? label || CALLOUT_LABEL.custom : CALLOUT_LABEL[kind]}</span>
        )}
      </div>
      <NodeViewContent className="sermon-callout-body" />
    </NodeViewWrapper>
  );
}
