import { IllustrationModal } from "./IllustrationsView";
import { useIllustrationCapture } from "./illustrationCapture";

/** Shows the "Save as illustration" modal wherever the capture came from.
 * Mounted once in the shell, like the other dialog hosts. */
export function IllustrationCaptureHost() {
  const draft = useIllustrationCapture((s) => s.draft);
  const setDraft = useIllustrationCapture((s) => s.setDraft);
  if (!draft) return null;
  return (
    <IllustrationModal
      illustration={null}
      initial={{
        title: draft.title,
        body: draft.body,
        sourceLabel: draft.sourceLabel,
        sourceRef: draft.sourceRef,
        kind: draft.kind,
      }}
      onClose={() => setDraft(null)}
    />
  );
}
