import { useResourceText } from "../../api/queries";
import { useTtsStore } from "../../state/ttsStore";
import { ReadAloudWords } from "../tts/ReadAloudWords";
import { splitIntoParagraphs } from "../tts/textUtils";

export function MobiTextReader({ resourceId }: { resourceId: number }) {
  const { data: text } = useResourceText(resourceId);
  const ttsSourceKind = useTtsStore((s) => s.sourceKind);
  const ttsCurrentSegmentId = useTtsStore((s) => s.segments[s.currentSegmentIndex]?.id ?? null);
  const paragraphs = text ? splitIntoParagraphs(text) : [];

  return (
    <div className="h-full overflow-y-auto px-8 py-6">
      <p className="mb-4 text-xs text-gray-400">
        MOBI files are shown as extracted plain text (original formatting/images aren't preserved).
      </p>
      {text == null && <p className="text-gray-400">Loading…</p>}
      {text === "" && <p className="text-gray-400">No readable text could be extracted from this file.</p>}
      <div className="reading-font max-w-3xl space-y-3 text-[15px] leading-relaxed">
        {paragraphs.map((p, i) => (
          <p key={i}>
            <ReadAloudWords text={p} active={ttsSourceKind === "resource" && ttsCurrentSegmentId === i} />
          </p>
        ))}
      </div>
    </div>
  );
}
