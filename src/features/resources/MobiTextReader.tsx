import { useResourceText } from "../../api/queries";
import { useTtsStore } from "../../state/ttsStore";
import { useReadingTypography } from "../../state/uiStore";
import { ReadAloudWords } from "../tts/ReadAloudWords";
import { splitIntoParagraphs } from "../tts/textUtils";
import { EmptyState, LoadingState } from "../../components/ui/EmptyState";

export function MobiTextReader({ resourceId }: { resourceId: number }) {
  const { data: text } = useResourceText(resourceId);
  const ttsSourceKind = useTtsStore((s) => s.sourceKind);
  const ttsCurrentSegmentId = useTtsStore((s) => s.segments[s.currentSegmentIndex]?.id ?? null);
  const typography = useReadingTypography();
  const paragraphs = text ? splitIntoParagraphs(text) : [];

  return (
    <div className="h-full overflow-y-auto px-8 py-6">
      <div className="mx-auto w-full max-w-[70ch]">
        <p className="mb-4 text-xs text-ink-3">MOBI files are shown as extracted plain text; original formatting and images aren't preserved.</p>
        {text == null && <LoadingState />}
        {text === "" && <EmptyState title="No readable text could be extracted from this file" />}
        <div className="reading-font space-y-4 text-ink" style={typography}>
          {paragraphs.map((p, i) => (
            <p key={i}>
              <ReadAloudWords text={p} active={ttsSourceKind === "resource" && ttsCurrentSegmentId === i} />
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
