import { useState } from "react";
import { useMetricalPsalm } from "../../api/queries";
import { useReadingTypography } from "../../state/uiStore";
import { Button } from "../../components/ui/Button";
import { EmptyState, LoadingState } from "../../components/ui/EmptyState";

export function MetricalPsalmPanel({ psalm }: { psalm: number }) {
  const { data: versions } = useMetricalPsalm(psalm);
  const [versionIdx, setVersionIdx] = useState(0);
  const version = versions?.[Math.min(versionIdx, (versions?.length ?? 1) - 1)];
  const typography = useReadingTypography(0.9);

  return (
    <div className="flex h-full w-full flex-col">
      <div className="border-b border-line px-3 py-2 text-xs text-ink-3">1650 Scottish Metrical Psalter · Psalm {psalm}</div>
      {versions && versions.length > 1 && (
        <div className="flex gap-1 border-b border-line px-2 py-1.5">
          {versions.map((v, i) => (
            <Button key={i} size="sm" variant="ghost" active={i === versionIdx} onClick={() => setVersionIdx(i)}>
              {v.label ?? `Version ${i + 1}`}
            </Button>
          ))}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {!versions && <LoadingState />}
        {versions && versions.length === 0 && <EmptyState compact title="No metrical setting for this psalm" />}
        <div className="reading-font" style={typography}>
          {version?.verses.map((v) => (
            <p key={v.verse} className="mb-3 whitespace-pre-line">
              <sup className="mr-1 select-none font-sans text-xs font-semibold text-ink-4">{v.verse}</sup>
              {v.text}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
